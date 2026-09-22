import { getModel, modelRegistry } from "./src/sync/model-registry";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const expectedEntities = [
  "bankAccount",
  "customer",
  "expense",
  "injuryEquation",
  "payment",
  "product",
  "purchase",
  "sale",
  "settings",
  "supplier",
  "task",
  "transfer",
  "vehicle",
  "worker",
];

for (const entity of expectedEntities) {
  const model = getModel(entity);

  assert(
    model !== undefined,
    `Model registry missing entity: ${entity}`,
  );
}

assert(
  Object.keys(modelRegistry).length === expectedEntities.length,
  "Model registry contains an unexpected number of entities.",
);

try {
  getModel("__unsupported_entity__");
  throw new Error("Unsupported entity was accepted.");
} catch (error) {
  if (
    error instanceof Error &&
    error.message ===
      "Unsupported sync entity: __unsupported_entity__"
  ) {
    console.log("Unsupported entity rejection passed.");
  } else {
    throw error;
  }
}

console.log("Model registry test passed.");

