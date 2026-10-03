export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  address?: string | null;
  identificationNumber?: string | null;
  email?: string | null;
  notes?: string | null;
  type: string;
  balance: number;
  legalName?: string | null;
  commercialName?: string | null;
  legalForm?: string | null;
  activity?: string | null;
  billingAddress?: string | null;
  rc?: string | null;
  nif?: string | null;
  nis?: string | null;
  invoiceCustomerType?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CustomerSale {
  id: string;
  customerId: string;
  date: number;
  createdAt: number;
  updatedAt: number;
  items: CustomerOrderItem[];
  total: number;
}

export interface CustomerPayment {
  id: string;
  entityType: "customer";
  entityId: string;
  amount: number;
  date: number;
  createdAt: number;
  note?: string | null;
}

export interface CustomerOrderItem {
  productId: string;
  quantity: number;
  weightKg: number;
  price: number;
  total: number;
}

export type CustomerRequestType = "insert_shipment" | "discrepancy";
export type CustomerRequestStatus = "under_review" | "accepted" | "rejected";

export interface CustomerRequest {
  id: string;
  createdAt: number;
  updatedAt: number;
  customerId: string;
  accountId?: string | null;
  type: CustomerRequestType;
  status: CustomerRequestStatus;
  items?: CustomerOrderItem[] | null;
  total?: number | null;
  date?: number | null;
  description?: string | null;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  notes?: string | null;
  saleId?: string | null;
}

export type CustomerOrderStatus = "under_review" | "accepted" | "rejected" | "cancelled";

export interface CustomerOrder {
  id: string;
  createdAt: number;
  updatedAt: number;
  customerId: string;
  accountId?: string | null;
  status: CustomerOrderStatus;
  items: CustomerOrderItem[];
  total: number;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  cancelledAt?: number | null;
  notes?: string | null;
  customerName?: string | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  available: boolean;
}
