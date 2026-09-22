import { db } from "@/src/lib/database/db";

export const SYNC_ENTITIES = [
  "product",
  "supplier",
  "customer",
  "bankAccount",
  "vehicle",
  "worker",
  "expense",
  "task",
  "purchase",
  "sale",
  "payment",
  "transfer",
  "injuryEquation",
  "settings",
  "notification",
  "invoice",
  "invoiceSellerProfile",
  "invoiceTaxProfile",
  "incomingInvoice",
  "officeFile",
] as const;

export type SyncEntityName = (typeof SYNC_ENTITIES)[number];

const entityTableMap: Record<string, any> = {
  product: () => db.products,
  supplier: () => db.suppliers,
  customer: () => db.customers,
  bankAccount: () => db.bankAccounts,
  vehicle: () => db.vehicles,
  worker: () => db.workers,
  expense: () => db.expenses,
  task: () => db.tasks,
  purchase: () => db.purchases,
  sale: () => db.sales,
  payment: () => db.payments,
  transfer: () => db.transfers,
  injuryEquation: () => db.injuryEquations,
  settings: () => db.settings,
  notification: () => db.notifications,
  invoice: () => db.invoices,
  invoiceSellerProfile: () => db.invoiceSellerProfiles,
  invoiceTaxProfile: () => db.invoiceTaxProfiles,
  incomingInvoice: () => db.incomingInvoices,
  officeFile: () => db.officeFiles,
};

export function getTableForSyncEntity(entity: string): any {
  const getter = entityTableMap[entity];
  if (!getter) return undefined;
  return getter();
}

export function getAllSyncTables(): any[] {
  return SYNC_ENTITIES.map((e) => getTableForSyncEntity(e)).filter(Boolean);
}
