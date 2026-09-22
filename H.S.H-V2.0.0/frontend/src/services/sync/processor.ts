import { syncCycle } from "./manager";

export async function processPendingSyncQueue(): Promise<void> {
  return syncCycle();
}

export { syncCycle } from "./manager";
