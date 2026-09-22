export class PurchaseCalculationOperation {
  calculate(input: {
    weightBeforeSlaughterKg: number;
    weightAfterSlaughterKg: number;
    amount: number;
  }) {
    if (input.weightBeforeSlaughterKg <= 0) {
      throw new Error("Weight before slaughter must be greater than zero.");
    }

    if (input.weightAfterSlaughterKg < 0) {
      throw new Error("Weight after slaughter cannot be negative.");
    }

    if (input.amount <= 0) {
      throw new Error("Amount must be greater than zero.");
    }

    if (
      input.weightAfterSlaughterKg >
      input.weightBeforeSlaughterKg
    ) {
      throw new Error(
        "Weight after slaughter cannot exceed weight before slaughter.",
      );
    }

    const averageWeightKg =
      input.weightBeforeSlaughterKg / input.amount;

    const output =
      (input.weightAfterSlaughterKg * 100) /
      input.weightBeforeSlaughterKg;

    const averageLossPercent = Number(
      ((output - 100) * -1).toFixed(2),
    );

    const averageLossKg =
      (averageWeightKg * averageLossPercent) / 100;

    return {
      weightBeforeSlaughterKg: input.weightBeforeSlaughterKg,
      weightAfterSlaughterKg: input.weightAfterSlaughterKg,
      amount: input.amount,
      averageWeightKg,
      averageLossPercent,
      averageLossKg,
    };
  }
}

export const purchaseCalculationOperation =
  new PurchaseCalculationOperation();
