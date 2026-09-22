import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { supplierService } from "../frontend/src/services/supplier.service";
import { supplierEditOperation } from "../frontend/src/services/operations/supplier-edit.operation";
import { purchaseOperation } from "../frontend/src/services/operations/purchase.operation";
import { productService } from "../frontend/src/services/product.service";

async function main() {
  const now = Date.now();

  const supplier = await supplierService.create({
    name: `__TEST_SUPPLIER_EDIT_${now}__`,
    phone: "1111111111",
    address: "Original address",
    identificationNumber: "ID-ORIGINAL",
    email: "original@test.com",
    notes: "Original notes",
  });

  const secondSupplier = await supplierService.create({
    name: `__TEST_SUPPLIER_EDIT_OTHER_${now}__`,
    phone: "2222222222",
  });

  await supplierEditOperation.edit({
    supplierId: supplier.id,
    name: `__TEST_SUPPLIER_EDITED_${now}__`,
    phone: "3333333333",
    address: "Edited address",
    identificationNumber: "ID-EDITED",
    email: "edited@test.com",
    notes: "Edited notes",
  });

  let updated = await db.suppliers.get(supplier.id);

  if (
    !updated ||
    updated.name !== `__TEST_SUPPLIER_EDITED_${now}__` ||
    updated.phone !== "3333333333" ||
    updated.address !== "Edited address" ||
    updated.identificationNumber !== "ID-EDITED" ||
    updated.email !== "edited@test.com" ||
    updated.notes !== "Edited notes" ||
    updated.balance !== 0
  ) {
    throw new Error("Supplier edit persistence failed.");
  }

  console.log("Supplier edit persistence passed.");

  const product = await productService.create({
    name: `__TEST_SUPPLIER_EDIT_PRODUCT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  const purchase = await purchaseOperation.create({
    supplierId: supplier.id,
    date: now,
    items: [
      {
        productId: product.id,
        quantity: 2,
        weightKg: 5,
        price: 500,
        total: 2500,
      },
    ],
    total: 2500,
  });

  updated = await db.suppliers.get(supplier.id);

  if (!updated || updated.balance !== 2500) {
    throw new Error("Supplier balance setup failed.");
  }

  await supplierEditOperation.edit({
    supplierId: supplier.id,
    name: updated.name,
    phone: updated.phone,
    address: "Balance preserved",
    identificationNumber: updated.identificationNumber,
    email: updated.email,
    notes: updated.notes,
  });

  updated = await db.suppliers.get(supplier.id);

  if (!updated || updated.balance !== 2500) {
    throw new Error("Supplier balance was modified by profile edit.");
  }

  console.log("Supplier balance preservation passed.");

  const storedPurchase = await db.purchases.get(purchase.id);

  if (
    !storedPurchase ||
    storedPurchase.supplierId !== supplier.id ||
    storedPurchase.total !== 2500 ||
    storedPurchase.items[0].price !== 500
  ) {
    throw new Error("Supplier edit modified purchase history.");
  }

  console.log("Historical purchase preservation passed.");

  try {
    await supplierEditOperation.edit({
      supplierId: supplier.id,
      name: secondSupplier.name,
      phone: "4444444444",
    });

    throw new Error("Duplicate supplier name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A supplier with this name already exists."
    ) {
      console.log("Duplicate supplier name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await supplierEditOperation.edit({
      supplierId: supplier.id,
      name: "",
      phone: "5555555555",
    });

    throw new Error("Empty supplier name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Supplier name is required."
    ) {
      console.log("Empty supplier name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await supplierEditOperation.edit({
      supplierId: "__NON_EXISTENT_SUPPLIER__",
      name: "Should fail",
      phone: "0000000000",
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

  const beforeFailure = await db.suppliers.get(supplier.id);

  if (!beforeFailure) {
    throw new Error("Supplier disappeared before rollback test.");
  }

  try {
    await supplierEditOperation.edit({
      supplierId: supplier.id,
      name: "",
      phone: "0000000000",
    });

    throw new Error("Invalid supplier edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Supplier name is required."
    ) {
      console.log("Supplier failed-edit rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailure = await db.suppliers.get(supplier.id);

  if (
    !afterFailure ||
    afterFailure.name !== beforeFailure.name ||
    afterFailure.phone !== beforeFailure.phone ||
    afterFailure.balance !== beforeFailure.balance
  ) {
    throw new Error("Failed supplier edit was not atomic.");
  }

  console.log("Supplier edit rollback passed.");
  console.log("Supplier edit operation test passed.");
}

main().catch((error) => {
  console.error("Supplier edit operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

