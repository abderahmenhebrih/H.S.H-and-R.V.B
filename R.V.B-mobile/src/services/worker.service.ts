import { api } from "@/api/client";
import type { WorkerProfile, WorkerFinancialEvent, WorkerActivity, WorkerRequest, WorkerRequestType } from "@/types/worker";

export async function getWorkerPortal(): Promise<{ worker: WorkerProfile }> {
  const res = await api.get<{ success: boolean; worker: WorkerProfile }>("/api/rvb/portal/worker");
  return { worker: res.worker };
}

export async function getWorkerPortalMe(): Promise<{ account: any; linkedEntity: WorkerProfile | null; entity: WorkerProfile | null }> {
  const res = await api.get<{ success: boolean; account: any; linkedEntity?: WorkerProfile | null; entity?: WorkerProfile | null; linkedEntityDisplayName?: string }>("/api/rvb/portal/me");
  return { account: res.account, linkedEntity: (res as any).linkedEntity ?? (res as any).entity ?? null, entity: (res as any).entity ?? (res as any).linkedEntity ?? null };
}

export async function getWorkerFinancialEvents(): Promise<{ workerId: string; events: WorkerFinancialEvent[] }> {
  const res = await api.get<{ success: boolean; workerId: string; events: WorkerFinancialEvent[] }>("/api/rvb/portal/worker/financial-events");
  return { workerId: res.workerId, events: res.events || [] };
}

export async function getWorkerActivities(): Promise<{ workerId: string; activities: WorkerActivity[] }> {
  const res = await api.get<{ success: boolean; workerId: string; activities: WorkerActivity[] }>("/api/rvb/portal/worker/activities");
  return { workerId: res.workerId, activities: res.activities || [] };
}

export async function getWorkerRequests(): Promise<{ requests: WorkerRequest[] }> {
  const res = await api.get<{ success: boolean; requests: WorkerRequest[] }>("/api/rvb/worker-requests");
  return { requests: res.requests || [] };
}

export async function createPaymentRequest(amount: number, description?: string): Promise<{ request: WorkerRequest }> {
  const res = await api.post<{ success: boolean; request: WorkerRequest }>("/api/rvb/worker-requests", {
    type: "payment" as WorkerRequestType,
    amount,
    description: description?.trim() || undefined,
  });
  return { request: res.request };
}

export async function createLoanRequest(amount: number, description?: string): Promise<{ request: WorkerRequest }> {
  const res = await api.post<{ success: boolean; request: WorkerRequest }>("/api/rvb/worker-requests", {
    type: "loan" as WorkerRequestType,
    amount,
    description: description?.trim() || undefined,
  });
  return { request: res.request };
}

export async function createDiscrepancyRequest(description: string): Promise<{ request: WorkerRequest }> {
  const res = await api.post<{ success: boolean; request: WorkerRequest }>("/api/rvb/worker-requests", {
    type: "discrepancy" as WorkerRequestType,
    description: description.trim(),
  });
  return { request: res.request };
}

export async function getConfig(): Promise<{ currency: string; config: { currency: string; language: string; customerTypes: string[]; workerPositions: string[] } }> {
  const res = await api.get<{ success: boolean; currency: string; config: any }>("/api/rvb/config");
  return { currency: res.currency || res.config?.currency || "DA", config: res.config };
}
