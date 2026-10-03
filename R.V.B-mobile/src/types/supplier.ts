export interface SupplierProfile {
  id: string;
  name: string;
  phone: string;
  address?: string | null;
  identificationNumber?: string | null;
  email?: string | null;
  notes?: string | null;
  balance: number;
  createdAt: number;
  updatedAt: number;
}

export interface SupplierPurchase {
  id: string;
  supplierId: string;
  date: number;
  createdAt: number;
  updatedAt: number;
  items: SupplierPurchaseItem[];
  total: number;
  calculation?: SupplierCalculation | null;
}

export interface SupplierPurchaseItem {
  productId: string;
  quantity: number;
  weightKg: number;
  price: number;
  total: number;
}

export interface SupplierCalculation {
  weightBeforeSlaughterKg: number;
  weightAfterSlaughterKg: number;
  amount: number;
  averageWeightKg: number;
  averageLossPercent: number;
  averageLossKg: number;
}

export interface SupplierPayment {
  id: string;
  entityType: "supplier";
  entityId: string;
  amount: number;
  date: number;
  createdAt: number;
  note?: string | null;
}

export type SupplierRequestType = "new_supply" | "discrepancy";
export type SupplierRequestStatus = "under_review" | "accepted" | "rejected";

export interface SupplierSupplyItem {
  productId: string;
  quantity: number;
  weightKg: number;
  price: number;
  total?: number; // server computed
}

export interface SupplierRequest {
  id: string;
  createdAt: number;
  updatedAt: number;
  supplierId: string;
  accountId?: string | null;
  type: SupplierRequestType;
  status: SupplierRequestStatus;
  items?: SupplierSupplyItem[] | null;
  total?: number | null;
  calculation?: SupplierCalculation | null;
  date?: number | null;
  description?: string | null;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  notes?: string | null;
  purchaseId?: string | null;
  originalItems?: SupplierSupplyItem[] | null;
  originalTotal?: number | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  available: boolean;
}
