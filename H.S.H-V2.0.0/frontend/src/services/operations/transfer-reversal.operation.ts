import { runDatabaseTransaction } from "./database-transaction";

export class TransferReversalOperation {
  async delete(_transferId: string) {
    return runDatabaseTransaction(async () => {
      throw new Error("TRANSFER_DELETE_UNSUPPORTED: Transfer deletion is not supported via this operation.");
    });
  }
}

export const transferReversalOperation = new TransferReversalOperation();
