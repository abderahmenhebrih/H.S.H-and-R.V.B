import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";

async function main() {
  console.log("Database name:", db.name);

  await db.delete();

  console.log("Deleted.");

  await db.open();

  console.log("Opened.");
  console.log("Database version:", db.verno);

  console.log(
    "Tables:",
    db.tables.map((table) => table.name),
  );

  console.log(
    "Vehicle table exists:",
    db.tables.some((table) => table.name === "vehicles"),
  );

  console.log(
    "Product table exists:",
    db.tables.some((table) => table.name === "products"),
  );

  console.log(
    "Supplier table exists:",
    db.tables.some((table) => table.name === "suppliers"),
  );

  await db.vehicles.toArray();

  console.log("Vehicle table access passed.");

  db.close();
}

main().catch((error) => {
  console.error("Database schema test failed.");
  console.error(error);
  process.exit(1);
});

