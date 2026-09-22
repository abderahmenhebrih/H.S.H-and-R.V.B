import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { productService } from "../frontend/src/services/product.service";
import { injuryEquationService } from "../frontend/src/services/injury-equation.service";
import { injuryEquationEditOperation } from "../frontend/src/services/operations/injury-equation-edit.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const product = await productService.create({
    name: `__TEST_INJURY_PRODUCT_${now}__`,
    price: 500,
    quantity: 10,
    weightKg: 100,
  });

  const secondProduct = await productService.create({
    name: `__TEST_INJURY_PRODUCT_OTHER_${now}__`,
    price: 700,
    quantity: 5,
    weightKg: 50,
  });

  const equation = await injuryEquationService.create({
    productId: product.id,
    name: `__TEST_INJURY_EQUATION_${now}__`,
    equation: "A * 0.15 / 2",
    enabled: true,
  });

  await injuryEquationEditOperation.edit({
    injuryEquationId: equation.id,
    productId: secondProduct.id,
    name: `__TEST_INJURY_EQUATION_EDITED_${now}__`,
    equation: "A * 0.20 / 2",
    enabled: false,
  });

  let updated = await db.injuryEquations.get(equation.id);

  if (
    !updated ||
    updated.productId !== secondProduct.id ||
    updated.name !== `__TEST_INJURY_EQUATION_EDITED_${now}__` ||
    updated.equation !== "A * 0.20 / 2" ||
    updated.enabled !== false ||
    updated.inputVariable !== "A" ||
    updated.outputVariable !== "B"
  ) {
    throw new Error("Injury equation edit persistence failed.");
  }

  console.log("Injury equation edit persistence passed.");

  await injuryEquationEditOperation.edit({
    injuryEquationId: equation.id,
    productId: product.id,
    name: updated.name,
    equation: "A * 0.25",
    enabled: true,
  });

  updated = await db.injuryEquations.get(equation.id);

  if (
    !updated ||
    updated.productId !== product.id ||
    updated.equation !== "A * 0.25" ||
    updated.enabled !== true
  ) {
    throw new Error("Injury equation field edit failed.");
  }

  console.log("Injury equation field edit passed.");

  try {
    await injuryEquationEditOperation.edit({
      injuryEquationId: equation.id,
      productId: "__NON_EXISTENT_PRODUCT__",
      name: updated.name,
      equation: updated.equation,
      enabled: true,
    });

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

  try {
    await injuryEquationEditOperation.edit({
      injuryEquationId: equation.id,
      productId: product.id,
      name: "",
      equation: "A * 0.10",
      enabled: true,
    });

    throw new Error("Empty injury equation name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Injury equation name is required."
    ) {
      console.log("Empty equation name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await injuryEquationEditOperation.edit({
      injuryEquationId: equation.id,
      productId: product.id,
      name: updated.name,
      equation: "",
      enabled: true,
    });

    throw new Error("Empty injury equation was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Injury equation is required."
    ) {
      console.log("Empty equation rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await injuryEquationEditOperation.edit({
      injuryEquationId: "__NON_EXISTENT_INJURY_EQUATION__",
      productId: product.id,
      name: "Should fail",
      equation: "A * 0.10",
      enabled: true,
    });

    throw new Error("Missing injury equation was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Injury equation not found."
    ) {
      console.log("Missing injury equation rejection passed.");
    } else {
      throw error;
    }
  }

  const beforeFailure = await db.injuryEquations.get(equation.id);

  if (!beforeFailure) {
    throw new Error(
      "Injury equation disappeared before rollback test.",
    );
  }

  try {
    await injuryEquationEditOperation.edit({
      injuryEquationId: equation.id,
      productId: product.id,
      name: "",
      equation: "Should fail",
      enabled: true,
    });

    throw new Error("Invalid injury equation edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Injury equation name is required."
    ) {
      console.log("Injury equation failed-edit rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailure = await db.injuryEquations.get(equation.id);

  if (
    !afterFailure ||
    afterFailure.productId !== beforeFailure.productId ||
    afterFailure.name !== beforeFailure.name ||
    afterFailure.equation !== beforeFailure.equation ||
    afterFailure.enabled !== beforeFailure.enabled
  ) {
    throw new Error("Failed injury equation edit was not atomic.");
  }

  console.log("Injury equation edit rollback passed.");
  console.log("Injury equation edit operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Injury equation edit operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

