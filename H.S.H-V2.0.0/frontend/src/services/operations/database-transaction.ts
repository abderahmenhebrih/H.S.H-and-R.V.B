import { db } from "../../lib/database/db";

export async function runDatabaseTransaction<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return db.transaction(
    "rw",
    [
      db.products,
      db.suppliers,
      db.customers,
      db.bankAccounts,
      db.vehicles,
      db.workers,
      db.expenses,
      db.tasks,
      db.purchases,
      db.sales,
      db.payments,
      db.transfers,
      db.injuryEquations,
      db.settings,
      db.notifications,
      db.syncOperations,
      db.syncMeta,
      db.syncConflicts,
    ],
    operation,
  );
}
