import { api } from "@/api/client";
import type { SupplierProfile, SupplierPurchase, SupplierPayment, SupplierRequest, CatalogProduct } from "@/types/supplier";

export async function getSupplierPortal(): Promise<{ supplier: SupplierProfile }> {
  const res = await api.get<{ success: boolean; supplier: SupplierProfile }>("/api/rvb/portal/supplier");
  return { supplier: res.supplier };
}

export async function getSupplierPurchases(): Promise<{ supplierId: string; purchases: SupplierPurchase[] }> {
  const res = await api.get<{ success: boolean; supplierId: string; purchases: SupplierPurchase[] }>("/api/rvb/portal/supplier/purchases");
  return { supplierId: res.supplierId, purchases: res.purchases || [] };
}

export async function getSupplierPayments(): Promise<{ supplierId: string; payments: SupplierPayment[] }> {
  const res = await api.get<{ success: boolean; supplierId: string; payments: SupplierPayment[] }>("/api/rvb/portal/supplier/payments");
  return { supplierId: res.supplierId, payments: res.payments || [] };
}

export async function getSupplierRequests(): Promise<{ requests: SupplierRequest[] }> {
  const res = await api.get<{ success: boolean; requests: SupplierRequest[] }>("/api/rvb/supplier-requests");
  return { requests: res.requests || [] };
}

export async function createNewSupply(input: {
  items: { productId: string; quantity: number; weightKg: number; price: number }[];
  date?: number;
  description?: string | null;
  total?: number; // will be ignored, server recomputes
}): Promise<{ request: SupplierRequest }> {
  const res = await api.post<{ success: boolean; request: SupplierRequest }>("/api/rvb/supplier-requests", {
    type: "new_supply",
    items: input.items,
    date: input.date,
    description: input.description,
    ...(input.total !== undefined ? { total: input.total } : {}),
  });
  return { request: res.request };
}

export async function createDiscrepancy(description: string): Promise<{ request: SupplierRequest }> {
  const res = await api.post<{ success: boolean; request: SupplierRequest }>("/api/rvb/supplier-requests", {
    type: "discrepancy",
    description: description.trim(),
  });
  return { request: res.request };
}

export async function getCatalogForSupplier(): Promise<{ products: CatalogProduct[] }> {
  const res = await api.get<{ success: boolean; for: string; products: CatalogProduct[] }>("/api/rvb/catalog/products?for=supplier");
  return { products: res.products || [] };
}

export async function getConfig(): Promise<{ currency: string; config: any }> {
  const res = await api.get<{ success: boolean; currency: string; config: any }>("/api/rvb/config");
  return { currency: res.currency || res.config?.currency || "DA", config: res.config };
}
