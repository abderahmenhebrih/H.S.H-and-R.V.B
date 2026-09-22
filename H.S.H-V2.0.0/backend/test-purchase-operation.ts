import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { supplierService } from "../frontend/src/services/supplier.service";
import { productService } from "../frontend/src/services/product.service";
import { purchaseOperation } from "../frontend/src/services/operations/purchase.operation";
import { purchaseEditOperation } from "../frontend/src/services/operations/purchase-edit.operation";
import { purchaseReversalOperation } from "../frontend/src/services/operations/purchase-reversal.operation";
import { purchaseCalculationOperation } from "../frontend/src/services/operations/purchase-calculation.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const supplier = await supplierService.create({
    name: `__TEST_PURCHASE_SUPPLIER_${now}__`,
    phone: "0000000000",
  });

  const secondSupplier = await supplierService.create({
    name: `__TEST_PURCHASE_SUPPLIER_OTHER_${now}__`,
    phone: "0000000000",
  });

  const product = await productService.create({
    name: `__TEST_PURCHASE_PRODUCT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  const secondProduct = await productService.create({
    name: `__TEST_PURCHASE_PRODUCT_OTHER_${now}__`,
    price: 700,
    quantity: 5,
    weightKg: 50,
  });

  // ------------------------------------------------------------
  // Create
  // ------------------------------------------------------------

  const purchase = await purchaseOperation.create({
    supplierId: supplier.id,
    date: now,
    items: [
      {
        productId: product.id,
        quantity: 5,
        weightKg: 25,
        price: 500,
        total: 2500,
      },
      {
        productId: secondProduct.id,
        quantity: 2,
        weightKg: 10,
        price: 700,
        total: 1400,
      },
    ],
    total: 3900,
  });

  let storedPurchase = await db.purchases.get(purchase.id);
  let currentSupplier = await db.suppliers.get(supplier.id);
  let currentProduct = await db.products.get(product.id);
  let currentSecondProduct = await db.products.get(secondProduct.id);

  if (
    !storedPurchase ||
    storedPurchase.total !== 3900 ||
    storedPurchase.supplierId !== supplier.id ||
    storedPurchase.items.length !== 2 ||
    !currentSupplier ||
    currentSupplier.balance !== 3900 ||
    !currentProduct ||
    currentProduct.quantity !== 15 ||
    currentProduct.weightKg !== 125 ||
    !currentSecondProduct ||
    currentSecondProduct.quantity !== 7 ||
    currentSecondProduct.weightKg !== 60
  ) {
    throw new Error("Purchase creation accounting failed.");
  }

  console.log("Purchase creation accounting passed.");

  // ------------------------------------------------------------
  // Edit same supplier / change inventory and total
  // ------------------------------------------------------------

  await purchaseEditOperation.edit({
    purchaseId: purchase.id,
    supplierId: supplier.id,
    date: now + 1,
    items: [
      {
        productId: product.id,
        quantity: 3,
        weightKg: 15,
        price: 600,
        total: 1800,
      },
      {
        productId: secondProduct.id,
        quantity: 1,
        weightKg: 5,
        price: 800,
        total: 800,
      },
    ],
    total: 2600,
  });

  storedPurchase = await db.purchases.get(purchase.id);
  currentSupplier = await db.suppliers.get(supplier.id);
  currentProduct = await db.products.get(product.id);
  currentSecondProduct = await db.products.get(secondProduct.id);

  if (
    !storedPurchase ||
    storedPurchase.total !== 2600 ||
    storedPurchase.items.length !== 2 ||
    !currentSupplier ||
    currentSupplier.balance !== 2600 ||
    !currentProduct ||
    currentProduct.quantity !== 13 ||
    currentProduct.weightKg !== 115 ||
    !currentSecondProduct ||
    currentSecondProduct.quantity !== 6 ||
    currentSecondProduct.weightKg !== 55
  ) {
    throw new Error("Purchase same-supplier edit failed.");
  }

  console.log("Purchase same-supplier edit passed.");

  // ------------------------------------------------------------
  // Edit to another supplier and another product
  // ------------------------------------------------------------

  await purchaseEditOperation.edit({
    purchaseId: purchase.id,
    supplierId: secondSupplier.id,
    date: now + 2,
    items: [
      {
        productId: product.id,
        quantity: 2,
        weightKg: 8,
        price: 700,
        total: 1400,
      },
    ],
    total: 1400,
  });

  storedPurchase = await db.purchases.get(purchase.id);
  currentSupplier = await db.suppliers.get(supplier.id);
  let currentSecondSupplier = await db.suppliers.get(
    secondSupplier.id,
  );
  currentProduct = await db.products.get(product.id);
  currentSecondProduct = await db.products.get(secondProduct.id);

  if (
    !storedPurchase ||
    storedPurchase.supplierId !== secondSupplier.id ||
    storedPurchase.total !== 1400 ||
    storedPurchase.items.length !== 1 ||
    !currentSupplier ||
    currentSupplier.balance !== 0 ||
    !currentSecondSupplier ||
    currentSecondSupplier.balance !== 1400 ||
    !currentProduct ||
    currentProduct.quantity !== 12 ||
    currentProduct.weightKg !== 108 ||
    !currentSecondProduct ||
    currentSecondProduct.quantity !== 5 ||
    currentSecondProduct.weightKg !== 50
  ) {
    throw new Error("Purchase supplier-change edit failed.");
  }

  console.log("Purchase supplier-change edit passed.");

  // ------------------------------------------------------------
  // Reversal
  // ------------------------------------------------------------

  await purchaseReversalOperation.delete(purchase.id);

  const deletedPurchase = await db.purchases.get(purchase.id);
  currentSecondSupplier = await db.suppliers.get(secondSupplier.id);
  currentProduct = await db.products.get(product.id);

  if (
    deletedPurchase ||
    !currentSecondSupplier ||
    currentSecondSupplier.balance !== 0 ||
    !currentProduct ||
    currentProduct.quantity !== 10 ||
    currentProduct.weightKg !== 100
  ) {
    throw new Error("Purchase reversal failed.");
  }

  console.log("Purchase reversal passed.");

  // ------------------------------------------------------------
  // Missing purchase
  // ------------------------------------------------------------

  try {
    await purchaseReversalOperation.delete(
      "__NON_EXISTENT_PURCHASE__",
    );

    throw new Error("Missing purchase was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Purchase not found."
    ) {
      console.log("Missing purchase rejection passed.");
    } else {
      throw error;
    }
  }

  // ------------------------------------------------------------
  // Invalid creation
  // ------------------------------------------------------------

  try {
    await purchaseOperation.create({
      supplierId: supplier.id,
      date: now,
      items: [],
      total: 0,
    });

    throw new Error("Empty purchase was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "A purchase must contain at least one item."
    ) {
      console.log("Empty purchase rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await purchaseOperation.create({
      supplierId: supplier.id,
      date: now,
      items: [
        {
          productId: product.id,
          quantity: 1,
          weightKg: 1,
          price: 100,
          total: 100,
        },
      ],
      total: -1,
    });

    throw new Error("Negative purchase total was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Purchase total cannot be negative."
    ) {
      console.log("Negative purchase total rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await purchaseOperation.create({
      supplierId: "__NON_EXISTENT_SUPPLIER__",
      date: now,
      items: [
        {
          productId: product.id,
          quantity: 1,
          weightKg: 1,
          price: 100,
          total: 100,
        },
      ],
      total: 100,
    });

    throw new Error("Missing supplier was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Supplier not found."
    ) {
      console.log("Missing supplier rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await purchaseOperation.create({
      supplierId: supplier.id,
      date: now,
      items: [
        {
          productId: "__NON_EXISTENT_PRODUCT__",
          quantity: 1,
          weightKg: 1,
          price: 100,
          total: 100,
        },
      ],
      total: 100,
    });

    throw new Error("Missing product was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Product not found:")
    ) {
      console.log("Missing product rejection passed.");
    } else {
      throw error;
    }
  }

  // ------------------------------------------------------------
  // Invalid edit
  // ------------------------------------------------------------

  const rollbackPurchase = await purchaseOperation.create({
    supplierId: supplier.id,
    date: now,
    items: [
      {
        productId: product.id,
        quantity: 2,
        weightKg: 10,
        price: 500,
        total: 1000,
      },
    ],
    total: 1000,
  });

  const beforeFailurePurchase = await db.purchases.get(
    rollbackPurchase.id,
  );
  const beforeFailureSupplier = await db.suppliers.get(
    supplier.id,
  );
  const beforeFailureProduct = await db.products.get(
    product.id,
  );

  if (
    !beforeFailurePurchase ||
    !beforeFailureSupplier ||
    !beforeFailureProduct
  ) {
    throw new Error("Purchase rollback setup failed.");
  }

  try {
    await purchaseEditOperation.edit({
      purchaseId: rollbackPurchase.id,
      supplierId: "__NON_EXISTENT_SUPPLIER__",
      date: now + 3,
      items: [
        {
          productId: product.id,
          quantity: 3,
          weightKg: 15,
          price: 500,
          total: 1500,
        },
      ],
      total: 1500,
    });

    throw new Error("Invalid purchase edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Supplier not found."
    ) {
      console.log("Invalid purchase edit rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailurePurchase = await db.purchases.get(
    rollbackPurchase.id,
  );
  const afterFailureSupplier = await db.suppliers.get(
    supplier.id,
  );
  const afterFailureProduct = await db.products.get(
    product.id,
  );

  if (
    !afterFailurePurchase ||
    !afterFailureSupplier ||
    !afterFailureProduct ||
    afterFailurePurchase.total !== beforeFailurePurchase.total ||
    afterFailurePurchase.supplierId !==
      beforeFailurePurchase.supplierId ||
    afterFailureProduct.quantity !==
      beforeFailureProduct.quantity ||
    afterFailureProduct.weightKg !==
      beforeFailureProduct.weightKg ||
    afterFailureSupplier.balance !==
      beforeFailureSupplier.balance
  ) {
    throw new Error("Failed purchase edit was not atomic.");
  }

  console.log("Purchase edit rollback passed.");

  // ------------------------------------------------------------
  // Calculation
  // ------------------------------------------------------------

  const calculation =
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: 100,
      weightAfterSlaughterKg: 80,
      amount: 10,
    });

  if (
    calculation.weightBeforeSlaughterKg !== 100 ||
    calculation.weightAfterSlaughterKg !== 80 ||
    calculation.amount !== 10 ||
    calculation.averageWeightKg !== 10 ||
    calculation.averageLossPercent !== 20 ||
    calculation.averageLossKg !== 2
  ) {
    throw new Error("Purchase calculation failed.");
  }

  console.log("Purchase calculation passed.");

  // ------------------------------------------------------------
  // Calculation validation
  // ------------------------------------------------------------

  try {
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: 0,
      weightAfterSlaughterKg: 80,
      amount: 10,
    });

    throw new Error("Invalid before-slaughter weight was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Weight before slaughter must be greater than zero."
    ) {
      console.log("Invalid before-slaughter weight rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: 100,
      weightAfterSlaughterKg: 120,
      amount: 10,
    });

    throw new Error("Invalid after-slaughter weight was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Weight after slaughter cannot exceed weight before slaughter."
    ) {
      console.log("Invalid after-slaughter weight rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: 100,
      weightAfterSlaughterKg: 80,
      amount: 0,
    });

    throw new Error("Invalid calculation amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Amount must be greater than zero."
    ) {
      console.log("Invalid calculation amount rejection passed.");
    } else {
      throw error;
    }
  }

  console.log("Purchase operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Purchase operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

