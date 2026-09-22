import { purchaseCalculationOperation } from "../frontend/src/services/operations/purchase-calculation.operation";

function assertEqual(actual: number, expected: number, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${expected}, received ${actual}`,
    );
  }
}

async function main() {
  // Normal calculation
  const result = purchaseCalculationOperation.calculate({
    weightBeforeSlaughterKg: 100,
    weightAfterSlaughterKg: 60,
    amount: 10,
  });

  assertEqual(
    result.weightBeforeSlaughterKg,
    100,
    "Before-slaughter weight calculation failed",
  );

  assertEqual(
    result.weightAfterSlaughterKg,
    60,
    "After-slaughter weight calculation failed",
  );

  assertEqual(
    result.amount,
    10,
    "Amount calculation failed",
  );

  assertEqual(
    result.averageWeightKg,
    10,
    "Average weight calculation failed",
  );

  assertEqual(
    result.averageLossPercent,
    40,
    "Average loss percentage calculation failed",
  );

  assertEqual(
    result.averageLossKg,
    4,
    "Average loss kg calculation failed",
  );

  console.log("Purchase calculation passed.");

  // Decimal calculation
  const decimalResult = purchaseCalculationOperation.calculate({
    weightBeforeSlaughterKg: 157.5,
    weightAfterSlaughterKg: 110.25,
    amount: 7,
  });

  assertEqual(
    decimalResult.averageWeightKg,
    22.5,
    "Decimal average weight calculation failed",
  );

  assertEqual(
    decimalResult.averageLossPercent,
    30,
    "Decimal average loss percentage calculation failed",
  );

  assertEqual(
    decimalResult.averageLossKg,
    6.75,
    "Decimal average loss kg calculation failed",
  );

  console.log("Decimal purchase calculation passed.");

  // Zero before-slaughter weight
  try {
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: 0,
      weightAfterSlaughterKg: 0,
      amount: 10,
    });

    throw new Error("Zero before-slaughter weight was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Weight before slaughter must be greater than zero."
    ) {
      console.log("Zero before-slaughter weight rejection passed.");
    } else {
      throw error;
    }
  }

  // Negative before-slaughter weight
  try {
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: -1,
      weightAfterSlaughterKg: 0,
      amount: 10,
    });

    throw new Error(
      "Negative before-slaughter weight was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Weight before slaughter must be greater than zero."
    ) {
      console.log("Negative before-slaughter weight rejection passed.");
    } else {
      throw error;
    }
  }

  // Negative after-slaughter weight
  try {
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: 100,
      weightAfterSlaughterKg: -1,
      amount: 10,
    });

    throw new Error(
      "Negative after-slaughter weight was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Weight after slaughter cannot be negative."
    ) {
      console.log("Negative after-slaughter weight rejection passed.");
    } else {
      throw error;
    }
  }

  // Zero amount
  try {
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: 100,
      weightAfterSlaughterKg: 60,
      amount: 0,
    });

    throw new Error("Zero amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Amount must be greater than zero."
    ) {
      console.log("Zero amount rejection passed.");
    } else {
      throw error;
    }
  }

  // Negative amount
  try {
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: 100,
      weightAfterSlaughterKg: 60,
      amount: -1,
    });

    throw new Error("Negative amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Amount must be greater than zero."
    ) {
      console.log("Negative amount rejection passed.");
    } else {
      throw error;
    }
  }

  // After-slaughter weight greater than before-slaughter weight
  try {
    purchaseCalculationOperation.calculate({
      weightBeforeSlaughterKg: 100,
      weightAfterSlaughterKg: 101,
      amount: 10,
    });

    throw new Error(
      "After-slaughter weight greater than before-slaughter weight was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Weight after slaughter cannot exceed weight before slaughter."
    ) {
      console.log("Invalid slaughter weight relationship rejection passed.");
    } else {
      throw error;
    }
  }

  console.log("Purchase calculation operation test passed.");
}

main().catch((error) => {
  console.error("Purchase calculation operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

