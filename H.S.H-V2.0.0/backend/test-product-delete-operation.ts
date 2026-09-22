import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { productService } from "../frontend/src/services/product.service";
import { supplierService } from "../frontend/src/services/supplier.service";
import { customerService } from "../frontend/src/services/customer.service";
import { purchaseOperation } from "../frontend/src/services/operations/purchase.operation";
import { saleOperation } from "../frontend/src/services/operations/sale.operation";
import { injuryEquationService } from "../frontend/src/services/injury-equation.service";
import { productDeleteOperation } from "../frontend/src/services/operations/product-delete.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const product = await productService.create({
    name: `__TEST_PRODUCT_DELETE_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  await productDeleteOperation.delete(product.id);

  const deleted = await db.products.get(product.id);

  if (deleted) {
    throw new Error("Product was not deleted.");
  }

  console.log("Product deletion passed.");

  const protectedProduct = await productService.create({
    name: `__TEST_PRODUCT_DELETE_PROTECTED_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  const supplier = await supplierService.create({
    name: `__TEST_PRODUCT_DELETE_SUPPLIER_${now}__`,
    phone: "0000000000",
  });

  await purchaseOperation.create({
    supplierId: supplier.id,
    date: now,
    items: [
      {
        productId: protectedProduct.id,
        quantity: 1,
        weightKg: 2,
        price: 500,
        total: 1000,
      },
    ],
    total: 1000,
  });

  try {
    await productDeleteOperation.delete(protectedProduct.id);
    throw new Error("Product used by purchase was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete product because it is used in purchase history."
    ) {
      console.log("Purchase history protection passed.");
    } else {
      throw error;
    }
  }

  const customer = await customerService.create({
    name: `__TEST_PRODUCT_DELETE_CUSTOMER_${now}__`,
    phone: "0000000000",
    type: "test",
  });

  const saleProduct = await productService.create({
    name: `__TEST_PRODUCT_DELETE_SALE_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  await saleOperation.create({
    customerId: customer.id,
    date: now,
    items: [
      {
        productId: saleProduct.id,
        quantity: 1,
        weightKg: 2,
        price: 500,
        total: 1000,
      },
    ],
    total: 1000,
  });

  try {
    await productDeleteOperation.delete(saleProduct.id);
    throw new Error("Product used by sale was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete product because it is used in sale history."
    ) {
      console.log("Sale history protection passed.");
    } else {
      throw error;
    }
  }

  const equationProduct = await productService.create({
    name: `__TEST_PRODUCT_DELETE_EQUATION_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  await injuryEquationService.create({
    productId: equationProduct.id,
    name: `__TEST_DELETE_EQUATION_${now}__`,
    equation: "A * 0.15",
    enabled: true,
  });

  try {
    await productDeleteOperation.delete(equationProduct.id);
    throw new Error("Product used by injury equation was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete product because it is used by an injury equation."
    ) {
      console.log("Injury equation protection passed.");
    } else {
      throw error;
    }
  }

  try {
    await productDeleteOperation.delete("__NON_EXISTENT_PRODUCT__");
    throw new Error("Missing product was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Product not found."
    ) {
      console.log("Missing product rejection passed.");
    } else {
      throw error;
    }
  }

  const stillThere = await db.products.get(protectedProduct.id);

  if (!stillThere) {
    throw new Error("Failed deletion removed the product.");
  }

  console.log("Product delete protection passed.");
  console.log("Product delete operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Product delete operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

