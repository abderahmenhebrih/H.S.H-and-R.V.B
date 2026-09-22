import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { saleOperation } from "../frontend/src/services/operations/sale.operation";
import { saleEditOperation } from "../frontend/src/services/operations/sale-edit.operation";
import { saleReversalOperation } from "../frontend/src/services/operations/sale-reversal.operation";
import { customerService } from "../frontend/src/services/customer.service";
import { productService } from "../frontend/src/services/product.service";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  // =========================
  // CREATE SETUP
  // =========================

  const customer = await customerService.create({
    name: `__TEST_SALE_CUSTOMER_${now}__`,
    phone: "0000000000",
    type: "retail",
  });

  const product = await productService.create({
    name: `__TEST_SALE_PRODUCT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  const sale = await saleOperation.create({
    customerId: customer.id,
    date: now,
    items: [
      {
        productId: product.id,
        quantity: 2,
        weightKg: 20,
        price: 500,
        total: 1000,
      },
    ],
    total: 1000,
  });

  let storedSale = await db.sales.get(sale.id);
  let currentProduct = await db.products.get(product.id);
  let currentCustomer = await db.customers.get(customer.id);

  if (
    !storedSale ||
    storedSale.total !== 1000 ||
    storedSale.customerId !== customer.id ||
    !currentProduct ||
    currentProduct.quantity !== 8 ||
    currentProduct.weightKg !== 80 ||
    !currentCustomer ||
    currentCustomer.balance !== 1000
  ) {
    throw new Error("Sale creation accounting failed.");
  }

  console.log("Sale creation accounting passed.");

  // =========================
  // SAME-CUSTOMER EDIT
  // =========================

  await saleEditOperation.edit({
    saleId: sale.id,
    customerId: customer.id,
    date: now + 1,
    items: [
      {
        productId: product.id,
        quantity: 3,
        weightKg: 30,
        price: 500,
        total: 1500,
      },
    ],
    total: 1500,
  });

  storedSale = await db.sales.get(sale.id);
  currentProduct = await db.products.get(product.id);
  currentCustomer = await db.customers.get(customer.id);

  if (
    !storedSale ||
    storedSale.total !== 1500 ||
    storedSale.items[0]?.quantity !== 3 ||
    storedSale.items[0]?.weightKg !== 30 ||
    !currentProduct ||
    currentProduct.quantity !== 7 ||
    currentProduct.weightKg !== 70 ||
    !currentCustomer ||
    currentCustomer.balance !== 1500
  ) {
    throw new Error("Sale same-customer edit failed.");
  }

  console.log("Sale same-customer edit passed.");

  // =========================
  // CUSTOMER-CHANGE EDIT
  // =========================

  const secondCustomer = await customerService.create({
    name: `__TEST_SALE_CUSTOMER_TWO_${now}__`,
    phone: "0000000001",
    type: "retail",
  });

  await saleEditOperation.edit({
    saleId: sale.id,
    customerId: secondCustomer.id,
    date: now + 2,
    items: [
      {
        productId: product.id,
        quantity: 2,
        weightKg: 20,
        price: 500,
        total: 1000,
      },
    ],
    total: 1000,
  });

  storedSale = await db.sales.get(sale.id);
  currentProduct = await db.products.get(product.id);
  currentCustomer = await db.customers.get(customer.id);
  const currentSecondCustomer = await db.customers.get(
    secondCustomer.id,
  );

  if (
    !storedSale ||
    storedSale.customerId !== secondCustomer.id ||
    storedSale.total !== 1000 ||
    !currentProduct ||
    currentProduct.quantity !== 8 ||
    currentProduct.weightKg !== 80 ||
    !currentCustomer ||
    currentCustomer.balance !== 0 ||
    !currentSecondCustomer ||
    currentSecondCustomer.balance !== 1000
  ) {
    throw new Error("Sale customer-change edit failed.");
  }

  console.log("Sale customer-change edit passed.");

  // =========================
  // REVERSAL
  // =========================

  await saleReversalOperation.delete(sale.id);

  const deletedSale = await db.sales.get(sale.id);
  currentProduct = await db.products.get(product.id);
  const restoredSecondCustomer = await db.customers.get(
    secondCustomer.id,
  );

  if (
    deletedSale ||
    !currentProduct ||
    currentProduct.quantity !== 10 ||
    currentProduct.weightKg !== 100 ||
    !restoredSecondCustomer ||
    restoredSecondCustomer.balance !== 0
  ) {
    throw new Error("Sale reversal failed.");
  }

  console.log("Sale reversal passed.");

  // =========================
  // MISSING SALE
  // =========================

  try {
    await saleReversalOperation.delete(
      "__NON_EXISTENT_SALE__",
    );

    throw new Error("Missing sale was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Sale not found."
    ) {
      console.log("Missing sale rejection passed.");
    } else {
      throw error;
    }
  }

  // =========================
  // EMPTY SALE
  // =========================

  try {
    await saleOperation.create({
      customerId: customer.id,
      date: now,
      items: [],
      total: 0,
    });

    throw new Error("Empty sale was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A sale must contain at least one item."
    ) {
      console.log("Empty sale rejection passed.");
    } else {
      throw error;
    }
  }

  // =========================
  // NEGATIVE SALE TOTAL
  // =========================

  try {
    await saleOperation.create({
      customerId: customer.id,
      date: now,
      items: [
        {
          productId: product.id,
          quantity: 1,
          weightKg: 10,
          price: 500,
          total: 500,
        },
      ],
      total: -1,
    });

    throw new Error("Negative sale total was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Sale total cannot be negative."
    ) {
      console.log("Negative sale total rejection passed.");
    } else {
      throw error;
    }
  }

  // =========================
  // MISSING CUSTOMER
  // =========================

  try {
    await saleOperation.create({
      customerId: "__NON_EXISTENT_CUSTOMER__",
      date: now,
      items: [
        {
          productId: product.id,
          quantity: 1,
          weightKg: 10,
          price: 500,
          total: 500,
        },
      ],
      total: 500,
    });

    throw new Error("Missing customer was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Customer not found."
    ) {
      console.log("Missing sale customer rejection passed.");
    } else {
      throw error;
    }
  }

  // =========================
  // MISSING PRODUCT
  // =========================

  try {
    await saleOperation.create({
      customerId: customer.id,
      date: now,
      items: [
        {
          productId: "__NON_EXISTENT_PRODUCT__",
          quantity: 1,
          weightKg: 10,
          price: 500,
          total: 500,
        },
      ],
      total: 500,
    });

    throw new Error("Missing product was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Product not found: __NON_EXISTENT_PRODUCT__"
    ) {
      console.log("Missing sale product rejection passed.");
    } else {
      throw error;
    }
  }

  // =========================
  // INSUFFICIENT QUANTITY
  // =========================

  try {
    await saleOperation.create({
      customerId: customer.id,
      date: now,
      items: [
        {
          productId: product.id,
          quantity: 999,
          weightKg: 10,
          price: 500,
          total: 500,
        },
      ],
      total: 500,
    });

    throw new Error("Insufficient quantity was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        `Insufficient product quantity: ${product.id}`
    ) {
      console.log("Insufficient sale quantity rejection passed.");
    } else {
      throw error;
    }
  }

  // =========================
  // INSUFFICIENT WEIGHT
  // =========================

  try {
    await saleOperation.create({
      customerId: customer.id,
      date: now,
      items: [
        {
          productId: product.id,
          quantity: 1,
          weightKg: 999,
          price: 500,
          total: 500,
        },
      ],
      total: 500,
    });

    throw new Error("Insufficient weight was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        `Insufficient product weight: ${product.id}`
    ) {
      console.log("Insufficient sale weight rejection passed.");
    } else {
      throw error;
    }
  }

  // =========================
  // INVALID EDIT VALUES
  // =========================

  const editCustomer = await customerService.create({
    name: `__TEST_SALE_EDIT_CUSTOMER_${now}__`,
    phone: "0000000002",
    type: "retail",
  });

  const editProduct = await productService.create({
    name: `__TEST_SALE_EDIT_PRODUCT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  const editSale = await saleOperation.create({
    customerId: editCustomer.id,
    date: now,
    items: [
      {
        productId: editProduct.id,
        quantity: 2,
        weightKg: 20,
        price: 500,
        total: 1000,
      },
    ],
    total: 1000,
  });

  try {
    await saleEditOperation.edit({
      saleId: editSale.id,
      customerId: editCustomer.id,
      date: now,
      items: [
        {
          productId: editProduct.id,
          quantity: -1,
          weightKg: 10,
          price: 500,
          total: 500,
        },
      ],
      total: 500,
    });

    throw new Error("Negative sale quantity was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Sale quantity cannot be negative."
    ) {
      console.log("Negative sale quantity rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await saleEditOperation.edit({
      saleId: editSale.id,
      customerId: editCustomer.id,
      date: now,
      items: [
        {
          productId: editProduct.id,
          quantity: 1,
          weightKg: -1,
          price: 500,
          total: 500,
        },
      ],
      total: 500,
    });

    throw new Error("Negative sale weight was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Sale weight cannot be negative."
    ) {
      console.log("Negative sale weight rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await saleEditOperation.edit({
      saleId: editSale.id,
      customerId: editCustomer.id,
      date: now,
      items: [
        {
          productId: editProduct.id,
          quantity: 1,
          weightKg: 10,
          price: -1,
          total: 500,
        },
      ],
      total: 500,
    });

    throw new Error("Negative sale price was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Sale price cannot be negative."
    ) {
      console.log("Negative sale price rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await saleEditOperation.edit({
      saleId: editSale.id,
      customerId: editCustomer.id,
      date: now,
      items: [
        {
          productId: editProduct.id,
          quantity: 1,
          weightKg: 10,
          price: 500,
          total: -1,
        },
      ],
      total: 500,
    });

    throw new Error("Negative sale item total was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Sale item total cannot be negative."
    ) {
      console.log("Negative sale item total rejection passed.");
    } else {
      throw error;
    }
  }

  // =========================
  // REVERSAL BALANCE PROTECTION
  // =========================

  const protectedCustomer = await customerService.create({
    name: `__TEST_SALE_REVERSAL_PROTECTED_${now}__`,
    phone: "0000000003",
    type: "retail",
  });

  const protectedProduct = await productService.create({
    name: `__TEST_SALE_REVERSAL_PRODUCT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  const protectedSale = await saleOperation.create({
    customerId: protectedCustomer.id,
    date: now,
    items: [
      {
        productId: protectedProduct.id,
        quantity: 2,
        weightKg: 20,
        price: 500,
        total: 1000,
      },
    ],
    total: 1000,
  });

  await db.customers.update(protectedCustomer.id, {
    balance: 0,
  });

  try {
    await saleReversalOperation.delete(protectedSale.id);

    throw new Error(
      "Sale with insufficient customer balance was reversed.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot reverse sale because customer balance is insufficient."
    ) {
      console.log(
        "Sale reversal balance protection passed.",
      );
    } else {
      throw error;
    }
  }

  const protectedSaleStillThere = await db.sales.get(
    protectedSale.id,
  );
  const protectedProductAfterFailure = await db.products.get(
    protectedProduct.id,
  );

  if (
    !protectedSaleStillThere ||
    !protectedProductAfterFailure ||
    protectedProductAfterFailure.quantity !== 8 ||
    protectedProductAfterFailure.weightKg !== 80
  ) {
    throw new Error(
      "Failed sale reversal affected sale or inventory.",
    );
  }

  console.log("Sale reversal failure preservation passed.");

  // =========================
  // EDIT ROLLBACK
  // =========================

  const rollbackCustomer = await customerService.create({
    name: `__TEST_SALE_ROLLBACK_CUSTOMER_${now}__`,
    phone: "0000000004",
    type: "retail",
  });

  const rollbackProduct = await productService.create({
    name: `__TEST_SALE_ROLLBACK_PRODUCT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  const rollbackSale = await saleOperation.create({
    customerId: rollbackCustomer.id,
    date: now,
    items: [
      {
        productId: rollbackProduct.id,
        quantity: 2,
        weightKg: 20,
        price: 500,
        total: 1000,
      },
    ],
    total: 1000,
  });

  const beforeFailureSale = await db.sales.get(rollbackSale.id);
  const beforeFailureProduct = await db.products.get(
    rollbackProduct.id,
  );
  const beforeFailureCustomer = await db.customers.get(
    rollbackCustomer.id,
  );

  if (
    !beforeFailureSale ||
    !beforeFailureProduct ||
    !beforeFailureCustomer
  ) {
    throw new Error("Sale rollback setup failed.");
  }

  try {
    await saleEditOperation.edit({
      saleId: rollbackSale.id,
      customerId: rollbackCustomer.id,
      date: now + 10,
      items: [
        {
          productId: rollbackProduct.id,
          quantity: 999,
          weightKg: 999,
          price: 500,
          total: 500000,
        },
      ],
      total: 500000,
    });

    throw new Error(
      "Invalid sale edit with insufficient inventory was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message ===
          `Insufficient product quantity: ${rollbackProduct.id}` ||
        error.message ===
          `Insufficient product weight: ${rollbackProduct.id}`
      )
    ) {
      console.log("Sale edit rollback rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailureSale = await db.sales.get(rollbackSale.id);
  const afterFailureProduct = await db.products.get(
    rollbackProduct.id,
  );
  const afterFailureCustomer = await db.customers.get(
    rollbackCustomer.id,
  );

  if (
    !afterFailureSale ||
    !afterFailureProduct ||
    !afterFailureCustomer ||
    afterFailureSale.total !== beforeFailureSale.total ||
    afterFailureSale.customerId !==
      beforeFailureSale.customerId ||
    afterFailureProduct.quantity !==
      beforeFailureProduct.quantity ||
    afterFailureProduct.weightKg !==
      beforeFailureProduct.weightKg ||
    afterFailureCustomer.balance !==
      beforeFailureCustomer.balance
  ) {
    throw new Error("Failed sale edit was not atomic.");
  }

  console.log("Sale edit rollback passed.");
  console.log("Sale operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Sale operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

