import { BankAccountModel } from "../models/bank-account.model";
import { CustomerModel } from "../models/customer.model";
import { ExpenseModel } from "../models/expense.model";
import { InjuryEquationModel } from "../models/injury-equation.model";
import { NotificationModel } from "../models/notification.model";
import { PaymentModel } from "../models/payment.model";
import { ProductModel } from "../models/product.model";
import { PurchaseModel } from "../models/purchase.model";
import { SaleModel } from "../models/sale.model";
import { SettingsModel } from "../models/settings.model";
import { SupplierModel } from "../models/supplier.model";
import { TaskModel } from "../models/task.model";
import { TransferModel } from "../models/transfer.model";
import { VehicleModel } from "../models/vehicle.model";
import { WorkerModel } from "../models/worker.model";
import { InvoiceModel } from "../models/invoice.model";
import { InvoiceSellerProfileModel } from "../models/invoice-seller-profile.model";
import { InvoiceTaxProfileModel } from "../models/invoice-tax-profile.model";
import { IncomingInvoiceModel } from "../models/incoming-invoice.model";
import { OfficeFileModel } from "../models/office-file.model";

export const modelRegistry = {
  bankAccount: BankAccountModel,
  customer: CustomerModel,
  expense: ExpenseModel,
  injuryEquation: InjuryEquationModel,
  notification: NotificationModel,
  payment: PaymentModel,
  product: ProductModel,
  purchase: PurchaseModel,
  sale: SaleModel,
  settings: SettingsModel,
  supplier: SupplierModel,
  task: TaskModel,
  transfer: TransferModel,
  vehicle: VehicleModel,
  worker: WorkerModel,
  invoice: InvoiceModel,
  invoiceSellerProfile: InvoiceSellerProfileModel,
  invoiceTaxProfile: InvoiceTaxProfileModel,
  incomingInvoice: IncomingInvoiceModel,
  officeFile: OfficeFileModel,
} as const;

export type SyncEntity = keyof typeof modelRegistry;

export function getModel(entity: string) {
  if (!(entity in modelRegistry)) {
    throw new Error(`Unsupported sync entity: ${entity}`);
  }

  return modelRegistry[entity as SyncEntity];
}
