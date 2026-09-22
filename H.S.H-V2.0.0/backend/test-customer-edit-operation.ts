import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { customerService } from "../frontend/src/services/customer.service";
import { customerEditOperation } from "../frontend/src/services/operations/customer-edit.operation";
import { productService } from "../frontend/src/services/product.service";
import { saleOperation } from "../frontend/src/services/operations/sale.operation";

async function main() {
  const now = Date.now();

  const customer = await customerService.create({
    name: `__TEST_CUSTOMER_EDIT_${now}__`,
    phone: "1111111111",
    address: "Original address",
    identificationNumber: "ID-ORIGINAL",
    email: "original@test.com",
    notes: "Original notes",
    type: "retail",
  });

  const secondCustomer = await customerService.create({
    name: `__TEST_CUSTOMER_EDIT_OTHER_${now}__`,
    phone: "2222222222",
    type: "wholesale",
  });

  await customerEditOperation.edit({
    customerId: customer.id,
    name: `__TEST_CUSTOMER_EDITED_${now}__`,
    phone: "3333333333",
    address: "Edited address",
    identificationNumber: "ID-EDITED",
    email: "edited@test.com",
    notes: "Edited notes",
    type: "wholesale",
  });

  let updated = await db.customers.get(customer.id);

  if (
    !updated ||
    updated.name !== `__TEST_CUSTOMER_EDITED_${now}__` ||
    updated.phone !== "3333333333" ||
    updated.address !== "Edited address" ||
    updated.identificationNumber !== "ID-EDITED" ||
    updated.email !== "edited@test.com" ||
    updated.notes !== "Edited notes" ||
    updated.type !== "wholesale" ||
    updated.balance !== 0
  ) {
    throw new Error("Customer edit persistence failed.");
  }

  console.log("Customer edit persistence passed.");

  const product = await productService.create({
    name: `__TEST_CUSTOMER_EDIT_PRODUCT_${now}__`,
    price: 500,
    quantity: 20,
    weightKg: 100,
  });

  const sale = await saleOperation.create({
    customerId: customer.id,
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

  updated = await db.customers.get(customer.id);

  if (!updated || updated.balance !== 2500) {
    throw new Error("Customer balance setup failed.");
  }

  await customerEditOperation.edit({
    customerId: customer.id,
    name: updated.name,
    phone: updated.phone,
    address: "Balance preserved",
    identificationNumber: updated.identificationNumber,
    email: updated.email,
    notes: updated.notes,
    type: updated.type,
  });

  updated = await db.customers.get(customer.id);

  if (!updated || updated.balance !== 2500) {
    throw new Error("Customer balance was modified by profile edit.");
  }

  console.log("Customer balance preservation passed.");

  const storedSale = await db.sales.get(sale.id);

  if (
    !storedSale ||
    storedSale.customerId !== customer.id ||
    storedSale.total !== 2500 ||
    storedSale.items[0].price !== 500
  ) {
    throw new Error("Customer edit modified sale history.");
  }

  console.log("Historical sale preservation passed.");

  try {
    await customerEditOperation.edit({
      customerId: customer.id,
      name: secondCustomer.name,
      phone: "4444444444",
      type: "retail",
    });

    throw new Error("Duplicate customer name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A customer with this name already exists."
    ) {
      console.log("Duplicate customer name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await customerEditOperation.edit({
      customerId: customer.id,
      name: "",
      phone: "5555555555",
      type: "retail",
    });

    throw new Error("Empty customer name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Customer name is required."
    ) {
      console.log("Empty customer name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await customerEditOperation.edit({
      customerId: customer.id,
      name: "Should fail",
      phone: "5555555555",
      type: "",
    });

    throw new Error("Empty customer type was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Customer type is required."
    ) {
      console.log("Empty customer type rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await customerEditOperation.edit({
      customerId: "__NON_EXISTENT_CUSTOMER__",
      name: "Should fail",
      phone: "0000000000",
      type: "retail",
    });

    throw new Error("Missing customer was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Customer not found."
    ) {
      console.log("Missing customer rejection passed.");
    } else {
      throw error;
    }
  }

  const beforeFailure = await db.customers.get(customer.id);

  if (!beforeFailure) {
    throw new Error("Customer disappeared before rollback test.");
  }

  try {
    await customerEditOperation.edit({
      customerId: customer.id,
      name: "",
      phone: "0000000000",
      type: "retail",
    });

    throw new Error("Invalid customer edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Customer name is required."
    ) {
      console.log("Customer failed-edit rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailure = await db.customers.get(customer.id);

  if (
    !afterFailure ||
    afterFailure.name !== beforeFailure.name ||
    afterFailure.phone !== beforeFailure.phone ||
    afterFailure.type !== beforeFailure.type ||
    afterFailure.balance !== beforeFailure.balance
  ) {
    throw new Error("Failed customer edit was not atomic.");
  }

  console.log("Customer edit rollback passed.");
  console.log("Customer edit operation test passed.");
}

main().catch((error) => {
  console.error("Customer edit operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

