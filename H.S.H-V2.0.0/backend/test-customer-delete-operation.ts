import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { customerService } from "../frontend/src/services/customer.service";
import { customerDeleteOperation } from "../frontend/src/services/operations/customer-delete.operation";
import { productService } from "../frontend/src/services/product.service";
import { saleOperation } from "../frontend/src/services/operations/sale.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const customer = await customerService.create({
    name: `__TEST_CUSTOMER_DELETE_${now}__`,
    phone: "0000000000",
    type: "retail",
  });

  await customerDeleteOperation.delete(customer.id);

  const deleted = await db.customers.get(customer.id);

  if (deleted) {
    throw new Error("Customer was not deleted.");
  }

  console.log("Customer deletion passed.");

  const balanceCustomer = await customerService.create({
    name: `__TEST_CUSTOMER_DELETE_BALANCE_${now}__`,
    phone: "0000000000",
    type: "retail",
  });

  await db.customers.update(balanceCustomer.id, {
    balance: 1000,
  });

  try {
    await customerDeleteOperation.delete(balanceCustomer.id);

    throw new Error("Customer with non-zero balance was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete customer while the customer balance is not zero."
    ) {
      console.log("Customer balance protection passed.");
    } else {
      throw error;
    }
  }

  const saleCustomer = await customerService.create({
    name: `__TEST_CUSTOMER_DELETE_SALE_${now}__`,
    phone: "0000000000",
    type: "retail",
  });

  const product = await productService.create({
    name: `__TEST_CUSTOMER_DELETE_PRODUCT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  await saleOperation.create({
    customerId: saleCustomer.id,
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
    await customerDeleteOperation.delete(saleCustomer.id);

    throw new Error("Customer used by sale was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete customer because it is used in sale history."
    ) {
      console.log("Sale history protection passed.");
    } else {
      throw error;
    }
  }

  try {
    await customerDeleteOperation.delete(
      "__NON_EXISTENT_CUSTOMER__",
    );

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

  const stillThere = await db.customers.get(saleCustomer.id);

  if (!stillThere) {
    throw new Error("Failed customer deletion removed the customer.");
  }

  console.log("Customer delete protection passed.");
  console.log("Customer delete operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Customer delete operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

