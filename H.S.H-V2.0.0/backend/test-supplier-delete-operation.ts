import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { supplierService } from "../frontend/src/services/supplier.service";
import { supplierDeleteOperation } from "../frontend/src/services/operations/supplier-delete.operation";
import { productService } from "../frontend/src/services/product.service";
import { purchaseOperation } from "../frontend/src/services/operations/purchase.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const supplier = await supplierService.create({
    name: `__TEST_SUPPLIER_DELETE_${now}__`,
    phone: "0000000000",
  });

  await supplierDeleteOperation.delete(supplier.id);

  const deleted = await db.suppliers.get(supplier.id);

  if (deleted) {
    throw new Error("Supplier was not deleted.");
  }

  console.log("Supplier deletion passed.");

  const balanceSupplier = await supplierService.create({
    name: `__TEST_SUPPLIER_DELETE_BALANCE_${now}__`,
    phone: "0000000000",
  });

  await db.suppliers.update(balanceSupplier.id, {
    balance: 1000,
  });

  try {
    await supplierDeleteOperation.delete(balanceSupplier.id);

    throw new Error("Supplier with non-zero balance was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete supplier while the supplier balance is not zero."
    ) {
      console.log("Supplier balance protection passed.");
    } else {
      throw error;
    }
  }

  const purchaseSupplier = await supplierService.create({
    name: `__TEST_SUPPLIER_DELETE_PURCHASE_${now}__`,
    phone: "0000000000",
  });

  const product = await productService.create({
    name: `__TEST_SUPPLIER_DELETE_PRODUCT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  await purchaseOperation.create({
    supplierId: purchaseSupplier.id,
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

  try {
    await supplierDeleteOperation.delete(purchaseSupplier.id);

    throw new Error("Supplier used by purchase was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete supplier because it is used in purchase history."
    ) {
      console.log("Purchase history protection passed.");
    } else {
      throw error;
    }
  }

  try {
    await supplierDeleteOperation.delete(
      "__NON_EXISTENT_SUPPLIER__",
    );

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

  const stillThere = await db.suppliers.get(purchaseSupplier.id);

  if (!stillThere) {
    throw new Error("Failed supplier deletion removed the supplier.");
  }

  console.log("Supplier delete protection passed.");
  console.log("Supplier delete operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Supplier delete operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

