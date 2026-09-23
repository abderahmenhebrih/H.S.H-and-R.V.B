import { runDatabaseTransaction } from "./database-transaction";

export class TransferEditOperation {
  async edit(_input: {
    transferId: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: number;
    note?: string;
  }) {
    return runDatabaseTransaction(async () => {
      throw new Error("TRANSFER_UPDATE_UNSUPPORTED: Transfer editing is not supported. Create a new transfer and delete the old one instead.");
    });
  }
}

export const transferEditOperation = new TransferEditOperation();
