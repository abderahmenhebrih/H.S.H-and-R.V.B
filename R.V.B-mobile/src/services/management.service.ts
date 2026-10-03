import { api } from "@/api/client";
import { useAuthStore } from "@/stores/auth-store";
import {
  canAccessAccountsManagement,
  canAccessWorkerManagement,
  canAccessSupplierManagement,
  canAccessCustomerManagement,
  canAccessRequestsManagement,
  canAccessOrdersManagement,
} from "@/constants/roles";
import type { RvbRole } from "@/types/rvb";
import { RvbApiError } from "@/types/rvb";

// PBS-BUG-037: client-side management fetch backstop. Expo Router instantiates
// a matched file route even when the profile layout redirects away in the
// same window, so these first-load fetchers refuse synchronously for
// unauthorized roles BEFORE any network request. This guarantees zero
// forbidden backend requests; the backend 403 stays authoritative.
// Screens keep their existing error handling for the (unreachable) throw.
function requireManagementRole(checker: (role: RvbRole) => boolean): void {
  const role = useAuthStore.getState().account?.role;
  if (!role || !checker(role)) {
    throw new RvbApiError({ status: 403, code: "RVB_FORBIDDEN", message: "Forbidden for this role" });
  }
}

// Accounts
export async function getAccounts() {
  requireManagementRole(canAccessAccountsManagement);
  const res = await api.get<{ success: boolean; accounts: any[] }>("/api/rvb/accounts");
  return res.accounts || [];
}
export async function getAccount(id: string) {
  requireManagementRole(canAccessAccountsManagement);
  const res = await api.get<{ success: boolean; account: any }>(`/api/rvb/accounts/${id}`);
  return res.account;
}
export async function createAccount(input: { tag: string; displayName: string; role: string; password: string; confirmPassword: string; linkedEntityType?: string; linkedEntityId?: string }) {
  requireManagementRole(canAccessAccountsManagement);
  const res = await api.post<{ success: boolean; account: any }>("/api/rvb/accounts", input);
  return res.account;
}
export async function updateAccount(id: string, input: any) {
  requireManagementRole(canAccessAccountsManagement);
  const res = await api.patch<{ success: boolean; account: any }>(`/api/rvb/accounts/${id}`, input);
  return res.account;
}
export async function archiveAccount(id: string) {
  requireManagementRole(canAccessAccountsManagement);
  const res = await api.post<{ success: boolean; account: any }>(`/api/rvb/accounts/${id}/archive`, {});
  return res.account;
}
export async function reactivateAccount(id: string) {
  requireManagementRole(canAccessAccountsManagement);
  const res = await api.post<{ success: boolean; account: any }>(`/api/rvb/accounts/${id}/reactivate`, {});
  return res.account;
}
export async function getLinkable(type: "worker" | "supplier" | "customer", search?: string) {
  requireManagementRole(canAccessAccountsManagement);
  const q = search ? `&search=${encodeURIComponent(search)}` : "";
  const res = await api.get<{ success: boolean; entities: any[] }>(`/api/rvb/accounts/linkable?type=${type}${q}`);
  return res.entities || [];
}

// Workers
export async function getWorkers() {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.get<{ success: boolean; workers: any[] }>("/api/rvb/workers");
  return res.workers || [];
}
export async function getWorker(id: string) {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.get<{ success: boolean; worker: any }>(`/api/rvb/workers/${id}`);
  return res.worker;
}
export async function createWorker(input: any) {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.post<{ success: boolean; worker: any }>(`/api/rvb/workers`, input);
  return res.worker;
}
export async function updateWorker(id: string, input: any) {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.patch<{ success: boolean; worker: any }>(`/api/rvb/workers/${id}`, input);
  return res.worker;
}
export async function archiveWorker(id: string) {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.post<{ success: boolean; worker: any }>(`/api/rvb/workers/${id}/archive`, {});
  return res.worker;
}
export async function reactivateWorker(id: string, input?: any) {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.post<{ success: boolean; worker: any }>(`/api/rvb/workers/${id}/reactivate`, input || {});
  return res.worker;
}
export async function bonusAbsence(id: string, input: { type: "bonus" | "absence"; amount: number; note?: string }) {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.post<{ success: boolean; worker: any; event: any }>(`/api/rvb/workers/${id}/bonus-absence`, input);
  return res;
}

// Suppliers
export async function getSuppliers() {
  requireManagementRole(canAccessSupplierManagement);
  const res = await api.get<{ success: boolean; suppliers: any[] }>("/api/rvb/suppliers");
  return res.suppliers || [];
}
export async function getSupplier(id: string) {
  requireManagementRole(canAccessSupplierManagement);
  const res = await api.get<{ success: boolean; supplier: any }>(`/api/rvb/suppliers/${id}`);
  return res.supplier;
}
export async function createSupplier(input: any) {
  requireManagementRole(canAccessSupplierManagement);
  const res = await api.post<{ success: boolean; supplier: any }>(`/api/rvb/suppliers`, input);
  return res.supplier;
}
export async function updateSupplier(id: string, input: any) {
  requireManagementRole(canAccessSupplierManagement);
  const res = await api.patch<{ success: boolean; supplier: any }>(`/api/rvb/suppliers/${id}`, input);
  return res.supplier;
}
export async function deleteSupplier(id: string) {
  requireManagementRole(canAccessSupplierManagement);
  const res = await api.del<{ success: boolean }>(`/api/rvb/suppliers/${id}`);
  return res;
}

// Customers
export async function getCustomers() {
  requireManagementRole(canAccessCustomerManagement);
  const res = await api.get<{ success: boolean; customers: any[] }>("/api/rvb/customers");
  return res.customers || [];
}
export async function getCustomer(id: string) {
  requireManagementRole(canAccessCustomerManagement);
  const res = await api.get<{ success: boolean; customer: any }>(`/api/rvb/customers/${id}`);
  return res.customer;
}
export async function createCustomer(input: any) {
  requireManagementRole(canAccessCustomerManagement);
  const res = await api.post<{ success: boolean; customer: any }>(`/api/rvb/customers`, input);
  return res.customer;
}
export async function updateCustomer(id: string, input: any) {
  requireManagementRole(canAccessCustomerManagement);
  const res = await api.patch<{ success: boolean; customer: any }>(`/api/rvb/customers/${id}`, input);
  return res.customer;
}
export async function deleteCustomer(id: string) {
  requireManagementRole(canAccessCustomerManagement);
  const res = await api.del<{ success: boolean }>(`/api/rvb/customers/${id}`);
  return res;
}

// Requests (aggregated)
export async function getRequests(params?: { status?: string; source?: string; search?: string; page?: number; limit?: number }) {
  requireManagementRole(canAccessRequestsManagement);
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.source) q.set("source", params.source);
  if (params?.search) q.set("search", params.search);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await api.get<{ success: boolean; requests: any[]; total?: number }>(`/api/rvb/requests${qs}`);
  return res;
}
export async function reviewRequest(source: "worker" | "supplier" | "customer", id: string, input: { status: "accepted" | "rejected"; notes?: string; items?: any[]; total?: number; calculation?: any; date?: number }) {
  requireManagementRole(canAccessRequestsManagement);
  const res = await api.post<{ success: boolean; request: any }>(`/api/rvb/requests/${source}/${id}/review`, input);
  return res.request;
}

// Customer Orders (management)
export async function getCustomerOrders(params?: { customerId?: string; status?: string }) {
  requireManagementRole(canAccessOrdersManagement);
  const q = new URLSearchParams();
  if (params?.customerId) q.set("customerId", params.customerId);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString() ? `?${q.toString()}` : "";
  const res = await api.get<{ success: boolean; orders: any[] }>(`/api/rvb/customer-orders${qs}`);
  return res.orders || [];
}
export async function reviewCustomerOrderMgmt(id: string, input: { status: "accepted" | "rejected"; notes?: string; items?: any[] }) {
  requireManagementRole(canAccessOrdersManagement);
  const res = await api.post<{ success: boolean; order: any }>(`/api/rvb/customer-orders/${id}/review`, input);
  return res.order;
}

// Worker detail helpers
export async function getWorkerFinancialEvents(id: string) {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.get<{ success: boolean; events: any[] }>(`/api/rvb/workers/${id}/financial-events`);
  return res.events || [];
}
export async function getWorkerActivitiesForWorker(id: string) {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.get<{ success: boolean; activities: any[] }>(`/api/rvb/workers/${id}/activities`);
  return res.activities || [];
}
export async function getSupplierPurchases(id: string) {
  requireManagementRole(canAccessSupplierManagement);
  const res = await api.get<{ success: boolean; purchases: any[] }>(`/api/rvb/suppliers/${id}/purchases`);
  return res.purchases || [];
}
export async function getSupplierPayments(id: string) {
  requireManagementRole(canAccessSupplierManagement);
  const res = await api.get<{ success: boolean; payments: any[] }>(`/api/rvb/suppliers/${id}/payments`);
  return res.payments || [];
}
export async function getCustomerSales(id: string) {
  requireManagementRole(canAccessCustomerManagement);
  const res = await api.get<{ success: boolean; sales: any[] }>(`/api/rvb/customers/${id}/sales`);
  return res.sales || [];
}
export async function getCustomerPaymentsForCustomer(id: string) {
  requireManagementRole(canAccessCustomerManagement);
  const res = await api.get<{ success: boolean; payments: any[] }>(`/api/rvb/customers/${id}/payments`);
  return res.payments || [];
}
export async function getWorkerRequestsForWorker(workerId: string) {
  requireManagementRole(canAccessWorkerManagement);
  const res = await api.get<{ success: boolean; requests: any[] }>(`/api/rvb/worker-requests?workerId=${workerId}`);
  return res.requests || [];
}
