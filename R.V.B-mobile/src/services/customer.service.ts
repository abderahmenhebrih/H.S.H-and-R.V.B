import { api } from "@/api/client";
import type { CustomerProfile, CustomerSale, CustomerPayment, CustomerRequest, CustomerOrder, CatalogProduct } from "@/types/customer";

export async function getCustomerPortal(): Promise<{ customer: CustomerProfile }> {
  const res = await api.get<{ success: boolean; customer: CustomerProfile }>("/api/rvb/portal/customer");
  return { customer: res.customer };
}

export async function getCustomerSales(): Promise<{ customerId: string; sales: CustomerSale[] }> {
  const res = await api.get<{ success: boolean; customerId: string; sales: CustomerSale[] }>("/api/rvb/portal/customer/sales");
  return { customerId: res.customerId, sales: res.sales || [] };
}

export async function getCustomerPayments(): Promise<{ customerId: string; payments: CustomerPayment[] }> {
  const res = await api.get<{ success: boolean; customerId: string; payments: CustomerPayment[] }>("/api/rvb/portal/customer/payments");
  return { customerId: res.customerId, payments: res.payments || [] };
}

export async function getCustomerOrders(): Promise<{ orders: CustomerOrder[] }> {
  const res = await api.get<{ success: boolean; orders: CustomerOrder[] }>("/api/rvb/portal/customer/orders");
  return { orders: res.orders || [] };
}

export async function getCustomerRequests(): Promise<{ requests: CustomerRequest[] }> {
  const res = await api.get<{ success: boolean; requests: CustomerRequest[] }>("/api/rvb/customer-requests");
  return { requests: res.requests || [] };
}

export async function createInsertShipment(input: {
  items: { productId: string; quantity: number; weightKg: number; price: number }[];
  date?: number;
  description?: string | null;
}): Promise<{ request: CustomerRequest }> {
  const res = await api.post<{ success: boolean; request: CustomerRequest }>("/api/rvb/customer-requests", {
    type: "insert_shipment",
    items: input.items,
    date: input.date,
    description: input.description,
  });
  return { request: res.request };
}

export async function createDiscrepancy(description: string): Promise<{ request: CustomerRequest }> {
  const res = await api.post<{ success: boolean; request: CustomerRequest }>("/api/rvb/customer-requests", {
    type: "discrepancy",
    description: description.trim(),
  });
  return { request: res.request };
}

// One stable random key per order submission attempt. The SAME key must be
// reused for all retries of that attempt (network retry, user re-tap after
// ambiguous failure); a new intentional order gets a NEW key. Randomness (not
// timestamps) identifies the attempt; server enforces actor+key uniqueness.
function randomHex(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export function newIdempotencyKey(): string {
  return `ord_${Date.now().toString(36)}_${randomHex(12)}`;
}

// Customer Orders (separate workflow from requests)
export async function getOrders(): Promise<{ orders: CustomerOrder[] }> {
  const res = await api.get<{ success: boolean; orders: CustomerOrder[] }>("/api/rvb/customer-orders");
  return { orders: res.orders || [] };
}

export async function createOrder(input: {
  items: { productId: string; quantity: number; weightKg: number; price: number }[];
  notes?: string | null;
}, opts?: { idempotencyKey?: string }): Promise<{ order: CustomerOrder }> {
  // Stable key per attempt (caller owns lifecycle); per-call fallback keeps
  // the field populated. Retries (incl. the client's token-refresh retry,
  // which reuses headers) send the SAME key.
  const key = opts?.idempotencyKey || newIdempotencyKey();
  const res = await api.post<{ success: boolean; order: CustomerOrder }>("/api/rvb/customer-orders", {
    items: input.items,
    notes: input.notes,
  }, { headers: { "Idempotency-Key": key } });
  return { order: res.order };
}

export async function editOrder(id: string, input: { items: { productId: string; quantity: number; weightKg: number; price: number }[]; notes?: string | null }): Promise<{ order: CustomerOrder }> {
  const res = await api.patch<{ success: boolean; order: CustomerOrder }>(`/api/rvb/customer-orders/${id}`, {
    items: input.items,
    notes: input.notes,
  });
  return { order: res.order };
}

export async function cancelOrder(id: string): Promise<{ order: CustomerOrder }> {
  const res = await api.post<{ success: boolean; order: CustomerOrder }>(`/api/rvb/customer-orders/${id}/cancel`, {});
  return { order: res.order };
}

export async function getCatalogForCustomer(): Promise<{ products: CatalogProduct[] }> {
  const res = await api.get<{ success: boolean; for: string; products: CatalogProduct[] }>("/api/rvb/catalog/products?for=customer");
  return { products: res.products || [] };
}

export async function getConfig(): Promise<{ currency: string; config: any }> {
  const res = await api.get<{ success: boolean; currency: string; config: any }>("/api/rvb/config");
  return { currency: res.currency || res.config?.currency || "DA", config: res.config };
}
