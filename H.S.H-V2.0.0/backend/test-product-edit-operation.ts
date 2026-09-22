import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { productService } from "../frontend/src/services/product.service";
import { productEditOperation } from "../frontend/src/services/operations/product-edit.operation";
import { supplierService } from "../frontend/src/services/supplier.service";
import { purchaseOperation } from "../frontend/src/services/operations/purchase.operation";
import { customerService } from "../frontend/src/services/customer.service";
import { saleOperation } from "../frontend/src/services/operations/sale.operation";

async function main() {
  const now = Date.now();

  const product = await productService.create({
    name: `__TEST_PRODUCT_EDIT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
    description: "Original",
  });

  const secondProduct = await productService.create({
    name: `__TEST_PRODUCT_EDIT_OTHER_${now}__`,
    price: 700,
    quantity: 5,
    weightKg: 50,
  });

  await productEditOperation.edit({
    productId: product.id,
    name: `__TEST_PRODUCT_EDITED_${now}__`,
    price: 600,
    quantity: 20,
    weightKg: 150,
    description: "Edited",
  });

  let updated = await db.products.get(product.id);

  if (
    !updated ||
    updated.name !== `__TEST_PRODUCT_EDITED_${now}__` ||
    updated.price !== 600 ||
    updated.quantity !== 20 ||
    updated.weightKg !== 150 ||
    updated.description !== "Edited"
  ) {
    throw new Error("Product edit persistence failed.");
  }

  console.log("Product edit persistence passed.");

  await productEditOperation.edit({
    productId: product.id,
    name: updated.name,
    price: 650,
    quantity: 20,
    weightKg: 150,
    description: "Price changed",
  });

  updated = await db.products.get(product.id);

  if (!updated || updated.price !== 650) {
    throw new Error("Product price edit failed.");
  }

  console.log("Product price edit passed.");

  try {
    await productEditOperation.edit({
      productId: product.id,
      name: secondProduct.name,
      price: 650,
      quantity: 20,
      weightKg: 150,
    });

    throw new Error("Duplicate product name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A product with this name already exists."
    ) {
      console.log("Duplicate product name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await productEditOperation.edit({
      productId: product.id,
      name: "Should fail",
      price: -1,
      quantity: 20,
      weightKg: 150,
    });

    throw new Error("Negative product price was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Product price cannot be negative."
    ) {
      console.log("Negative price rejection passed.");
    } else {
      throw error;
    }
  }

  const beforeFailure = await db.products.get(product.id);

  if (!beforeFailure) {
    throw new Error("Product disappeared before rollback test.");
  }

  try {
    await productEditOperation.edit({
      productId: product.id,
      name: "Should fail",
      price: 600,
      quantity: -1,
      weightKg: 150,
    });

    throw new Error("Negative product quantity was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Product quantity cannot be negative."
    ) {
      console.log("Negative quantity rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailure = await db.products.get(product.id);

  if (
    !afterFailure ||
    afterFailure.name !== beforeFailure.name ||
    afterFailure.price !== beforeFailure.price ||
    afterFailure.quantity !== beforeFailure.quantity ||
    afterFailure.weightKg !== beforeFailure.weightKg
  ) {
    throw new Error("Failed product edit was not atomic.");
  }

  console.log("Product edit rollback passed.");

  // Verify historical transaction prices remain unchanged.
  const supplier = await supplierService.create({
    name: `__TEST_PRODUCT_EDIT_SUPPLIER_${now}__`,
    phone: "0000000000",
  });

  const purchase = await purchaseOperation.create({
    supplierId: supplier.id,
    date: now,
    items: [
      {
        productId: product.id,
        quantity: 1,
        weightKg: 2,
        price: 500,
        total: 1000,
      },
    ],
    total: 1000,
  });

  await productEditOperation.edit({
    productId: product.id,
    name: product.name,
    price: 900,
    quantity: 21,
    weightKg: 152,
    description: "Current price changed",
  });

  const storedPurchase = await db.purchases.get(purchase.id);

  if (
    !storedPurchase ||
    storedPurchase.items[0].price !== 500 ||
    storedPurchase.items[0].total !== 1000
  ) {
    throw new Error("Historical purchase price was modified.");
  }

  console.log("Historical purchase price preservation passed.");

  const customer = await customerService.create({
    name: `__TEST_PRODUCT_EDIT_CUSTOMER_${now}__`,
    phone: "0000000000",
    type: "test",
  });

  const sale = await saleOperation.create({
    customerId: customer.id,
    date: now,
    items: [
      {
        productId: product.id,
        quantity: 1,
        weightKg: 1,
        price: 900,
        total: 900,
      },
    ],
    total: 900,
  });

  await productEditOperation.edit({
    productId: product.id,
    name: product.name,
    price: 1000,
    quantity: 20,
    weightKg: 151,
  });

  const storedSale = await db.sales.get(sale.id);

  if (
    !storedSale ||
    storedSale.items[0].price !== 900 ||
    storedSale.items[0].total !== 900
  ) {
    throw new Error("Historical sale price was modified.");
  }

  console.log("Historical sale price preservation passed.");
  console.log("Product edit operation test passed.");
}

main().catch((error) => {
  console.error("Product edit operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

