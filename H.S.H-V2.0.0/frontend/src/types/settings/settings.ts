export type Language = "ar" | "fr" | "en";

export type Currency = "DA" | "€" | "$";

export type NavigationStyle = "classic" | "floating";

export interface NotificationPreferences {
  inAppEnabled?: boolean;
  desktopEnabled?: boolean;
  soundEnabled?: boolean;
  customerOrders?: boolean;
  tasks?: boolean;
  inventory?: boolean;
  financial?: boolean;
  system?: boolean;
}

export interface PaymentMethodConfig {
  id: string;
  label: string;
  enabled: boolean;
  isCustom?: boolean;
}

export interface InvoiceDocumentDefaults {
  defaultInvoiceLanguage?: Language;
  defaultCurrency?: Currency;
  showBankDetails?: boolean;
  showRC?: boolean;
  showNIF?: boolean;
  showNIS?: boolean;
  showCapital?: boolean;
  showStamp?: boolean;
}

export interface Settings {
  language: Language;
  currency: Currency;
  customerTypes: string[];
  workerPositions: string[];
  vehicleTypes: string[];
  expenseTypes: string[];
  navigationStyle?: NavigationStyle;
  notifications?: NotificationPreferences;
  invoicePaymentMethods?: PaymentMethodConfig[];
  invoiceDocumentDefaults?: InvoiceDocumentDefaults;
}
