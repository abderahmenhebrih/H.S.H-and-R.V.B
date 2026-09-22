import Dexie, { type Table } from "dexie";

import type { Product } from "../../types/entities/product";
import type { Supplier } from "../../types/entities/supplier";
import type { Customer } from "../../types/entities/customer";
import type { BankAccount } from "../../types/entities/bank-account";
import type { Vehicle } from "../../types/entities/vehicle";
import type { Worker } from "../../types/entities/worker";
import type { Expense } from "../../types/entities/expense";
import type { Task } from "../../types/entities/task";
import type { Purchase } from "../../types/entities/purchase";
import type { Sale } from "../../types/entities/sale";
import type { Payment } from "../../types/entities/payment";
import type { Transfer } from "../../types/entities/transfer";
import type { InjuryEquation } from "../../types/entities/injury-equation";
import type { Settings } from "../../types/settings/settings";
import type { Notification } from "../../types/entities/notification";
import type { Invoice } from "../../types/entities/invoice";
import type { InvoiceSellerProfile } from "../../types/entities/invoice-seller-profile";
import type { InvoiceTaxProfile } from "../../types/entities/invoice-tax-profile";
import type { IncomingInvoice } from "../../types/entities/incoming-invoice";
import type { OfficeFile } from "../../types/entities/office-file";

export interface SyncOperation {
  id?: number;
  operationId: string;
  entity: string;
  entityId: string;
  operation: "create" | "update" | "delete" | "upsert";
  payload: unknown;
  createdAt: number;
  synced: boolean;
  attempts: number;
  lastError?: string;
  baseRevision?: number;
  clientId?: string;
  status?: "pending" | "terminal" | "retrying";
}

export interface SyncMeta {
  key: string;
  value: unknown;
}

export interface SyncConflict {
  id?: number;
  entity: string;
  entityId: string;
  operationId: string;
  baseRevision?: number;
  serverRevision: number;
  detectedAt: number;
  resolution: string;
  details?: unknown;
}

class HebrihDatabase extends Dexie {
  products!: Table<Product, string>;
  suppliers!: Table<Supplier, string>;
  customers!: Table<Customer, string>;
  bankAccounts!: Table<BankAccount, string>;
  vehicles!: Table<Vehicle, string>;
  workers!: Table<Worker, string>;
  expenses!: Table<Expense, string>;
  tasks!: Table<Task, string>;
  purchases!: Table<Purchase, string>;
  sales!: Table<Sale, string>;
  payments!: Table<Payment, string>;
  transfers!: Table<Transfer, string>;
  injuryEquations!: Table<InjuryEquation, string>;
  settings!: Table<Settings, string>;
  notifications!: Table<Notification, string>;
  invoices!: Table<Invoice, string>;
  invoiceSellerProfiles!: Table<InvoiceSellerProfile, string>;
  invoiceTaxProfiles!: Table<InvoiceTaxProfile, string>;
  incomingInvoices!: Table<IncomingInvoice, string>;
  officeFiles!: Table<OfficeFile, string>;

  syncOperations!: Table<SyncOperation, number>;
  syncMeta!: Table<SyncMeta, string>;
  syncConflicts!: Table<SyncConflict, number>;

  constructor() {
    super("HebrihSlaughterHouse");

    this.version(1).stores({
      syncOperations: "++id, entity, entityId, operation, createdAt, synced",
    });

    this.version(2).stores({
      products: "id, name, createdAt, updatedAt",
      suppliers: "id, name, createdAt, updatedAt",
      customers: "id, name, type, createdAt, updatedAt",
      bankAccounts: "id, name, type, createdAt, updatedAt",
      vehicles: "id, name, registrationNumber, type, createdAt, updatedAt",
      workers:
        "id, name, status, position, employmentDate, createdAt, updatedAt",
      expenses: "id, accountId, date, createdAt, updatedAt",
      tasks: "id, deadline, createdAt, updatedAt",
      purchases: "id, supplierId, date, createdAt, updatedAt",
      sales: "id, customerId, date, createdAt, updatedAt",
      payments:
        "id, entityType, entityId, accountId, date, createdAt, updatedAt",
      transfers:
        "id, fromAccountId, toAccountId, date, createdAt, updatedAt",
      injuryEquations: "id, productId, enabled, createdAt, updatedAt",
      settings: "id",
    });

    this.version(3).stores({
      syncOperations:
        "++id, operationId, entity, entityId, operation, createdAt, synced, clientId",
      syncMeta: "key",
      syncConflicts: "++id, entity, entityId, operationId, serverRevision",
    });

    this.version(4).stores({
      syncOperations:
        "++id, operationId, entity, entityId, operation, createdAt, synced, clientId, status",
      syncMeta: "key",
      syncConflicts: "++id, entity, entityId, operationId, serverRevision",
    });

    this.version(5).stores({
      notifications: "id, type, severity, createdAt, readAt, sourceEventId, syncStatus, serverRevision",
      syncOperations:
        "++id, operationId, entity, entityId, operation, createdAt, synced, clientId, status",
      syncMeta: "key",
      syncConflicts: "++id, entity, entityId, operationId, serverRevision",
    });

    this.version(6).stores({
      products: "id, name, createdAt, updatedAt",
      suppliers: "id, name, createdAt, updatedAt",
      customers: "id, name, type, createdAt, updatedAt",
      bankAccounts: "id, name, type, createdAt, updatedAt",
      vehicles: "id, name, registrationNumber, type, createdAt, updatedAt",
      workers: "id, name, status, position, employmentDate, createdAt, updatedAt",
      expenses: "id, accountId, date, createdAt, updatedAt",
      tasks: "id, deadline, createdAt, updatedAt",
      purchases: "id, supplierId, date, createdAt, updatedAt",
      sales: "id, customerId, date, createdAt, updatedAt",
      payments: "id, entityType, entityId, accountId, date, createdAt, updatedAt",
      transfers: "id, fromAccountId, toAccountId, date, createdAt, updatedAt",
      injuryEquations: "id, productId, enabled, createdAt, updatedAt",
      settings: "id",
      notifications: "id, type, severity, createdAt, readAt, sourceEventId, syncStatus, serverRevision",
      invoices: "id, sellerProfileId, invoiceNumber, status, customerId, invoiceDate, createdAt, updatedAt",
      invoiceSellerProfiles: "id, commercialName, invoicePrefix, nextNumber, enabled, createdAt, updatedAt",
      invoiceTaxProfiles: "id, code, vatRate, enabled, createdAt, updatedAt",
      incomingInvoices: "id, supplierId, supplierInvoiceNumber, invoiceDate, createdAt, updatedAt",
      syncOperations:
        "++id, operationId, entity, entityId, operation, createdAt, synced, clientId, status",
      syncMeta: "key",
      syncConflicts: "++id, entity, entityId, operationId, serverRevision",
    });

    // Fix for v6 that previously deleted old tables due to incomplete stores definition
    this.version(7).stores({
      products: "id, name, createdAt, updatedAt",
      suppliers: "id, name, createdAt, updatedAt",
      customers: "id, name, type, createdAt, updatedAt",
      bankAccounts: "id, name, type, createdAt, updatedAt",
      vehicles: "id, name, registrationNumber, type, createdAt, updatedAt",
      workers: "id, name, status, position, employmentDate, createdAt, updatedAt",
      expenses: "id, accountId, date, createdAt, updatedAt",
      tasks: "id, deadline, createdAt, updatedAt",
      purchases: "id, supplierId, date, createdAt, updatedAt",
      sales: "id, customerId, date, createdAt, updatedAt",
      payments: "id, entityType, entityId, accountId, date, createdAt, updatedAt",
      transfers: "id, fromAccountId, toAccountId, date, createdAt, updatedAt",
      injuryEquations: "id, productId, enabled, createdAt, updatedAt",
      settings: "id",
      notifications: "id, type, severity, createdAt, readAt, sourceEventId, syncStatus, serverRevision",
      invoices: "id, sellerProfileId, invoiceNumber, status, customerId, invoiceDate, createdAt, updatedAt",
      invoiceSellerProfiles: "id, commercialName, invoicePrefix, nextNumber, enabled, createdAt, updatedAt",
      invoiceTaxProfiles: "id, code, vatRate, enabled, createdAt, updatedAt",
      incomingInvoices: "id, supplierId, supplierInvoiceNumber, invoiceDate, createdAt, updatedAt",
      syncOperations:
        "++id, operationId, entity, entityId, operation, createdAt, synced, clientId, status",
      syncMeta: "key",
      syncConflicts: "++id, entity, entityId, operationId, serverRevision",
    });

    this.version(8).stores({
      products: "id, name, createdAt, updatedAt",
      suppliers: "id, name, createdAt, updatedAt",
      customers: "id, name, type, createdAt, updatedAt",
      bankAccounts: "id, name, type, createdAt, updatedAt",
      vehicles: "id, name, registrationNumber, type, createdAt, updatedAt",
      workers: "id, name, status, position, employmentDate, createdAt, updatedAt",
      expenses: "id, accountId, date, createdAt, updatedAt",
      tasks: "id, deadline, createdAt, updatedAt",
      purchases: "id, supplierId, date, createdAt, updatedAt",
      sales: "id, customerId, date, createdAt, updatedAt",
      payments: "id, entityType, entityId, accountId, date, createdAt, updatedAt",
      transfers: "id, fromAccountId, toAccountId, date, createdAt, updatedAt",
      injuryEquations: "id, productId, enabled, createdAt, updatedAt",
      settings: "id",
      notifications: "id, type, severity, createdAt, readAt, sourceEventId, syncStatus, serverRevision",
      invoices: "id, sellerProfileId, invoiceNumber, status, customerId, invoiceDate, createdAt, updatedAt",
      invoiceSellerProfiles: "id, commercialName, invoicePrefix, nextNumber, enabled, createdAt, updatedAt",
      invoiceTaxProfiles: "id, code, vatRate, enabled, createdAt, updatedAt",
      incomingInvoices: "id, supplierId, supplierInvoiceNumber, invoiceDate, createdAt, updatedAt",
      officeFiles: "id, type, title, updatedAt, lastOpenedAt, isArchived, syncStatus",
      syncOperations:
        "++id, operationId, entity, entityId, operation, createdAt, synced, clientId, status",
      syncMeta: "key",
      syncConflicts: "++id, entity, entityId, operationId, serverRevision",
    });

    this.version(9).stores({
      products: "id, name, createdAt, updatedAt",
      suppliers: "id, name, createdAt, updatedAt",
      customers: "id, name, type, createdAt, updatedAt",
      bankAccounts: "id, name, type, createdAt, updatedAt",
      vehicles: "id, name, registrationNumber, type, createdAt, updatedAt",
      workers: "id, name, status, position, employmentDate, createdAt, updatedAt",
      expenses: "id, accountId, date, createdAt, updatedAt",
      tasks: "id, deadline, createdAt, updatedAt",
      purchases: "id, supplierId, date, createdAt, updatedAt",
      sales: "id, customerId, date, createdAt, updatedAt",
      payments: "id, entityType, entityId, accountId, date, createdAt, updatedAt",
      transfers: "id, fromAccountId, toAccountId, date, createdAt, updatedAt",
      injuryEquations: "id, productId, enabled, createdAt, updatedAt",
      settings: "id",
      notifications: "id, type, severity, createdAt, readAt, archivedAt, priority, sourceEventId, syncStatus, serverRevision",
      invoices: "id, sellerProfileId, invoiceNumber, status, customerId, invoiceDate, createdAt, updatedAt",
      invoiceSellerProfiles: "id, commercialName, invoicePrefix, nextNumber, enabled, createdAt, updatedAt",
      invoiceTaxProfiles: "id, code, vatRate, enabled, createdAt, updatedAt",
      incomingInvoices: "id, supplierId, supplierInvoiceNumber, invoiceDate, createdAt, updatedAt",
      officeFiles: "id, type, title, updatedAt, lastOpenedAt, isArchived, syncStatus",
      syncOperations:
        "++id, operationId, entity, entityId, operation, createdAt, synced, clientId, status",
      syncMeta: "key",
      syncConflicts: "++id, entity, entityId, operationId, serverRevision",
    });
  }
}

export const db = new HebrihDatabase();
