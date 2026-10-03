export interface WorkerProfile {
  id: string;
  name: string;
  phone: string;
  address?: string | null;
  birthDate?: number | null;
  employmentDate: number;
  position: string;
  notes?: string | null;
  startingSalary: number;
  monthlySalary: number;
  status: "active" | "archived";
  balance: number;
  createdAt: number;
  updatedAt: number;
}

export type WorkerFinancialEventType = "salary" | "bonus" | "absence" | "payment" | "loan" | "adjustment";

export interface WorkerFinancialEvent {
  id: string;
  createdAt: number;
  updatedAt: number;
  workerId: string;
  type: WorkerFinancialEventType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note?: string | null;
  actorId?: string | null;
  actorTag?: string | null;
  referenceId?: string | null;
}

export interface WorkerActivity {
  id: string;
  createdAt: number;
  workerId: string;
  accountId?: string | null;
  action: string;
  details?: string | null;
  actorId?: string | null;
  actorTag?: string | null;
}

export type WorkerRequestType = "payment" | "loan" | "discrepancy";
export type WorkerRequestStatus = "under_review" | "accepted" | "rejected";

export interface WorkerRequest {
  id: string;
  createdAt: number;
  updatedAt: number;
  workerId: string;
  accountId?: string | null;
  type: WorkerRequestType;
  status: WorkerRequestStatus;
  amount?: number | null;
  description?: string | null;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  notes?: string | null;
  paymentId?: string | null;
  financialEventId?: string | null;
}

export interface WorkerPortalMe {
  success: boolean;
  account: any;
  linkedEntity?: WorkerProfile | null;
  entity?: WorkerProfile | null;
  worker?: WorkerProfile | null;
}

export interface WorkerConfig {
  currency: string;
  customerTypes?: string[];
  workerPositions?: string[];
}
