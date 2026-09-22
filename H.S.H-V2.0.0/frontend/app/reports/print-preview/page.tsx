"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, FileDown, Printer, RefreshCw } from "lucide-react";
import StyledSelect from "../../../src/components/common/StyledSelect";
import { getPrinters, printReport, downloadReportPdf, APP_PDF_PRINTER, APP_PDF_LABEL } from "../../../src/services/printing.service";
import type { PrinterInfo } from "../../../src/services/printing.service";
import { productService } from "../../../src/services/product.service";
import { supplierService } from "../../../src/services/supplier.service";
import { customerService } from "../../../src/services/customer.service";
import { bankAccountService } from "../../../src/services/bank-account.service";
import { workerService } from "../../../src/services/worker.service";
import { expenseService } from "../../../src/services/expense.service";
import { vehicleService } from "../../../src/services/vehicle.service";
import { purchaseService } from "../../../src/services/purchase.service";
import { saleService } from "../../../src/services/sale.service";
import { paymentService } from "../../../src/services/payment.service";
import { transferService } from "../../../src/services/transfer.service";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, formatCurrency, getDirection, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Settings } from "../../../src/types/settings/settings";
import type { Supplier } from "../../../src/types/entities/supplier";
import type { Customer } from "../../../src/types/entities/customer";
import type { BankAccount } from "../../../src/types/entities/bank-account";
import type { Worker } from "../../../src/types/entities/worker";
import type { Expense } from "../../../src/types/entities/expense";
import type { Vehicle } from "../../../src/types/entities/vehicle";
import type { Purchase } from "../../../src/types/entities/purchase";
import type { Sale } from "../../../src/types/entities/sale";
import type { Payment } from "../../../src/types/entities/payment";
import type { Transfer } from "../../../src/types/entities/transfer";
import type { Product } from "../../../src/types/entities/product";
import type { Currency, Language } from "../../../src/types/settings/settings";
import styles from "./page.module.css";
import reportStyles from "../page.module.css";

type Category = "suppliers" | "customers" | "accounts" | "workers" | "expenses" | "vehicles";
type PaperSize = "A4" | "Letter" | "Legal";
type Margins = "normal" | "narrow" | "wide";
type ColorMode = "color" | "grayscale";
type Sides = "one-sided" | "two-sided";

function formatDateLocalized(ts: number, language: Language) {
  const locale = language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";
  try {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", numberingSystem: "latn" } as any).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleDateString("en-GB");
  }
}

function formatGeneratedDate(language: Language) {
  const locale = language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";
  try {
    const d = new Date();
    const datePart = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", numberingSystem: "latn" } as any).format(d);
    const timePart = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" } as any).format(d);
    return `${datePart} ${timePart}`;
  } catch {
    return `${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString("en-GB")}`;
  }
}

function formatPeriodDate(dateStr: string, language: Language) {
  const locale = language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB";
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", numberingSystem: "latn" } as any).format(d);
  } catch {
    return dateStr;
  }
}

const TRANSLATIONS = {
  en: {
    loadingReports: "Loading reports...",
    printPreview: "Print Preview",
    reviewConfigure: "Review and configure the report before printing.",
    goToDashboard: "Go to Dashboard",
    noActivity: "No activity in this period.",
    printSettings: "PRINT SETTINGS",
    paperSize: "Paper size",
    choosePrinter: "Choose printer",
    loadingPrinters: "Loading printers...",
    selectPrinter: "Select printer",
    windowsPrintersError: "Windows printers could not be loaded. Print to PDF is still available.",
    retry: "Retry",
    noWindowsPrinters: "No Windows printers detected.",
    copies: "Copies",
    copiesHint: "Available when printing to a physical printer.",
    sides: "Sides",
    oneSided: "One-sided",
    twoSided: "Two-sided",
    colorMode: "Color mode",
    color: "Color",
    grayscale: "Black & White",
    margins: "Margins",
    normal: "Normal",
    narrow: "Narrow",
    wide: "Wide",
    scale: "Scale",
    documentHeaderFooter: "Document header & footer",
    resetSettings: "Reset settings",
    print: "Print",
    savePdf: "Save PDF",
    printing: "Printing...",
    savingPdf: "Saving PDF...",
    openSystemPrint: "Open system print dialog",
    reportDetails: "REPORT DETAILS",
    report: "Report",
    category: "Category",
    entity: "Entity",
    period: "Period",
    generated: "Generated",
    printMode: "Print mode",
    allWithActivity: "All with activity",
    selected: "Selected",
    printerHint: "Printer, destination, copies, and device-specific options are selected in the system print dialog.",
    showMore: "Show more",
    showLess: "Show less",
    refreshPrinters: "Refresh printers",
    all: "All",
    reportSuffix: "REPORT",
    totalSales: "Total Sales",
    payment: "Payment",
    date: "Date",
    serial: "Serial",
    product: "Product",
    quantity: "Quantity",
    weight: "Weight",
    price: "Price",
    total: "Total",
    history: "History",
    expense: "Expense",
    account: "Account",
    vehicle: "Vehicle",
    transfer: "Transfer",
    customers: "Customers",
    suppliers: "Suppliers",
    accounts: "Bank/Cash Accounts",
    workers: "Workers",
    expenses: "Expenses",
    vehicles: "Vehicles",
    pleaseSelectPrinter: "Please select a printer.",
    noPrintersDetected: "No printers detected.",
    pdfGenerated: "PDF generated successfully.",
    printSuccess: "Report sent to",
    successfully: "successfully.",
    printFailed: "Print job failed.",
  },
  fr: {
    loadingReports: "Chargement des rapports...",
    printPreview: "Aperçu avant impression",
    reviewConfigure: "Vérifiez et configurez le rapport avant d'imprimer.",
    goToDashboard: "Aller au tableau de bord",
    noActivity: "Aucune activité sur cette période.",
    printSettings: "PARAMÈTRES D'IMPRESSION",
    paperSize: "Taille du papier",
    choosePrinter: "Choisir l'imprimante",
    loadingPrinters: "Chargement des imprimantes...",
    selectPrinter: "Sélectionner une imprimante",
    windowsPrintersError: "Les imprimantes Windows n'ont pas pu être chargées. L'impression en PDF reste disponible.",
    retry: "Réessayer",
    noWindowsPrinters: "Aucune imprimante Windows détectée.",
    copies: "Copies",
    copiesHint: "Disponible lors de l'impression sur une imprimante physique.",
    sides: "Faces",
    oneSided: "Recto",
    twoSided: "Recto-verso",
    colorMode: "Mode couleur",
    color: "Couleur",
    grayscale: "Noir & Blanc",
    margins: "Marges",
    normal: "Normale",
    narrow: "Étroite",
    wide: "Large",
    scale: "Échelle",
    documentHeaderFooter: "En-tête et pied de page du document",
    resetSettings: "Réinitialiser les paramètres",
    print: "Imprimer",
    savePdf: "Enregistrer PDF",
    printing: "Impression...",
    savingPdf: "Enregistrement PDF...",
    openSystemPrint: "Ouvrir la boîte de dialogue d'impression système",
    reportDetails: "DÉTAILS DU RAPPORT",
    report: "Rapport",
    category: "Catégorie",
    entity: "Entité",
    period: "Période",
    generated: "Généré",
    printMode: "Mode d'impression",
    allWithActivity: "Tous avec activité",
    selected: "Sélectionné",
    printerHint: "L'imprimante, la destination, les copies et les options spécifiques à l'appareil sont sélectionnées dans la boîte de dialogue d'impression système.",
    showMore: "Afficher plus",
    showLess: "Afficher moins",
    refreshPrinters: "Actualiser les imprimantes",
    all: "Tous",
    reportSuffix: "RAPPORT",
    totalSales: "Ventes totales",
    payment: "Paiement",
    date: "Date",
    serial: "Série",
    product: "Produit",
    quantity: "Quantité",
    weight: "Poids",
    price: "Prix",
    total: "Total",
    history: "Historique",
    expense: "Dépense",
    account: "Compte",
    vehicle: "Véhicule",
    transfer: "Transfert",
    customers: "Clients",
    suppliers: "Fournisseurs",
    accounts: "Comptes",
    workers: "Employés",
    expenses: "Dépenses",
    vehicles: "Véhicules",
    pleaseSelectPrinter: "Veuillez sélectionner une imprimante.",
    noPrintersDetected: "Aucune imprimante détectée.",
    pdfGenerated: "PDF généré avec succès.",
    printSuccess: "Rapport envoyé à",
    successfully: "avec succès.",
    printFailed: "Échec de la tâche d'impression.",
  },
  ar: {
    loadingReports: "جارٍ تحميل التقارير...",
    printPreview: "معاينة الطباعة",
    reviewConfigure: "راجع وقم بتكوين التقرير قبل الطباعة.",
    goToDashboard: "الذهاب إلى لوحة التحكم",
    noActivity: "لا يوجد نشاط في هذه الفترة.",
    printSettings: "إعدادات الطباعة",
    paperSize: "حجم الورق",
    choosePrinter: "اختر الطابعة",
    loadingPrinters: "جارٍ تحميل الطابعات...",
    selectPrinter: "اختر الطابعة",
    windowsPrintersError: "تعذر تحميل طابعات Windows. الطباعة إلى PDF لا تزال متاحة.",
    retry: "إعادة المحاولة",
    noWindowsPrinters: "لم يتم اكتشاف طابعات Windows.",
    copies: "النسخ",
    copiesHint: "متاح عند الطباعة على طابعة فعلية.",
    sides: "الأوجه",
    oneSided: "وجه واحد",
    twoSided: "وجهان",
    colorMode: "وضع الألوان",
    color: "ألوان",
    grayscale: "أبيض وأسود",
    margins: "الهوامش",
    normal: "عادي",
    narrow: "ضيق",
    wide: "واسع",
    scale: "المقياس",
    documentHeaderFooter: "رأس وتذييل المستند",
    resetSettings: "إعادة تعيين الإعدادات",
    print: "طباعة",
    savePdf: "حفظ PDF",
    printing: "جارٍ الطباعة...",
    savingPdf: "جارٍ حفظ PDF...",
    openSystemPrint: "فتح مربع حوار الطباعة النظامي",
    reportDetails: "تفاصيل التقرير",
    report: "التقرير",
    category: "الفئة",
    entity: "الجهة",
    period: "الفترة",
    generated: "تم الإنشاء",
    printMode: "وضع الطباعة",
    allWithActivity: "الكل مع النشاط",
    selected: "المحدد",
    printerHint: "يتم اختيار الطابعة والوجهة والنسخ والخيارات الخاصة بالجهاز في مربع حوار الطباعة النظامي.",
    showMore: "عرض المزيد",
    showLess: "عرض أقل",
    refreshPrinters: "تحديث الطابعات",
    all: "الكل",
    reportSuffix: "تقرير",
    totalSales: "إجمالي المبيعات",
    payment: "الدفع",
    date: "التاريخ",
    serial: "التسلسل",
    product: "السلعة",
    quantity: "الكمية",
    weight: "الوزن",
    price: "السعر",
    total: "المجموع",
    history: "السجل",
    expense: "المصروف",
    account: "الحساب",
    vehicle: "المركبة",
    transfer: "التحويل",
    customers: "الزبائن",
    suppliers: "الممولين",
    accounts: "الحسابات البنكية",
    workers: "العمال",
    expenses: "المصاريف",
    vehicles: "المركبات",
    pleaseSelectPrinter: "الرجاء اختيار طابعة.",
    noPrintersDetected: "لم يتم اكتشاف طابعات.",
    pdfGenerated: "تم إنشاء PDF بنجاح.",
    printSuccess: "تم إرسال التقرير إلى",
    successfully: "بنجاح.",
    printFailed: "فشلت مهمة الطباعة.",
  },
} as const;

function serialForDate(date: number, index: number) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const seq = String(index + 1).padStart(3, "0");
  return `${dd}${mm}${yyyy}${seq}`;
}

function PrintPreviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = (searchParams.get("category") as Category) || "customers";
  const entityId = searchParams.get("entity") || "all";
  const fromDate = searchParams.get("from") || new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10);
  const toDate = searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const mode = (searchParams.get("mode") as "selected" | "all") || "selected";

  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [margins, setMargins] = useState<Margins>("normal");
  const [scale, setScale] = useState<number>(100);
  const [copies, setCopies] = useState<number>(1);
  const [sides, setSides] = useState<Sides>("one-sided");
  const [colorMode, setColorMode] = useState<ColorMode>("color");
  const [showHeaderFooter, setShowHeaderFooter] = useState(true);
  const [showMoreSettings, setShowMoreSettings] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [printersLoading, setPrintersLoading] = useState(true);
  const [printersError, setPrintersError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printFeedback, setPrintFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const t = TRANSLATIONS[language];
  const dir = getDirection(language);

  useEffect(() => {
    const checkTheme = () => {
      const dark = localStorage.getItem("hebrih-theme") === "dark" || document.documentElement.classList.contains("themeDark") || document.body.classList.contains("themeDark");
      setIsDark(dark);
    };
    checkTheme();
    window.addEventListener("hebrih-theme-change", checkTheme);
    window.addEventListener("storage", checkTheme);
    const obs = new MutationObserver(checkTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      window.removeEventListener("hebrih-theme-change", checkTheme);
      window.removeEventListener("storage", checkTheme);
      obs.disconnect();
    };
  }, []);

  useEffect(() => {
    async function loadSettingsAndLang() {
      const s = await settingsService.get();
      const lang = s?.language ?? DEFAULT_SETTINGS.language;
      const curr = s?.currency ?? DEFAULT_SETTINGS.currency;
      setLanguage(lang);
      setCurrency(curr);
      document.documentElement.lang = lang;
      document.documentElement.dir = getDirection(lang);
    }
    void loadSettingsAndLang();
    const handler = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if ((ce as any)?.detail) {
        const lang = (ce as any).detail.language ?? DEFAULT_SETTINGS.language;
        const curr = (ce as any).detail.currency ?? DEFAULT_SETTINGS.currency;
        setLanguage(lang);
        setCurrency(curr);
        document.documentElement.lang = lang;
        document.documentElement.dir = getDirection(lang);
        return;
      }
      void loadSettingsAndLang();
    };
    window.addEventListener(SETTINGS_EVENT, handler as EventListener);
    window.addEventListener("storage", handler as EventListener);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, handler as EventListener);
      window.removeEventListener("storage", handler as EventListener);
    };
  }, []);

  const APP_PDF_INFO: PrinterInfo = { name: APP_PDF_PRINTER, deviceId: APP_PDF_PRINTER, paperSizes: [], isDefault: false };

  const buildPrinterList = (windowsPrinters: PrinterInfo[], defaultPrinter: string | null): PrinterInfo[] => {
    const sortedWindows = [...windowsPrinters].sort((a, b) => {
      if (a.name === defaultPrinter) return -1;
      if (b.name === defaultPrinter) return 1;
      return a.name.localeCompare(b.name);
    });
    const seen = new Set<string>();
    const result: PrinterInfo[] = [];
    const add = (p: PrinterInfo) => {
      if (!seen.has(p.name)) {
        seen.add(p.name);
        result.push(p);
      }
    };
    add(APP_PDF_INFO);
    for (const p of sortedWindows) add(p);
    return result;
  };

  const loadPrinters = async () => {
    setPrintersLoading(true);
    setPrintersError(null);
    try {
      const data = await getPrinters();
      const windowsPrinters = data.printers || [];
      const combined = buildPrinterList(windowsPrinters, data.defaultPrinter);
      setPrinters(combined);
      if (data.defaultPrinter && windowsPrinters.some((p) => p.name === data.defaultPrinter)) {
        setSelectedPrinter(data.defaultPrinter);
      } else {
        setSelectedPrinter(APP_PDF_PRINTER);
      }
    } catch (e) {
      setPrinters([APP_PDF_INFO]);
      setSelectedPrinter(APP_PDF_PRINTER);
      setPrintersError(t.windowsPrintersError);
    } finally {
      setPrintersLoading(false);
    }
  };

  useEffect(() => {
    void loadPrinters();
  }, []);

  useEffect(() => {
    async function load() {
      const [sup, cust, acc, work, exp, veh, purch, sal, pay, trans, prod] = await Promise.all([
        supplierService.getAll(),
        customerService.getAll(),
        bankAccountService.getAll(),
        workerService.getAll(),
        expenseService.getAll(),
        vehicleService.getAll(),
        purchaseService.getAll(),
        saleService.getAll(),
        paymentService.getAll(),
        transferService.getAll(),
        productService.getAll(),
      ]);
      setSuppliers(sup);
      setCustomers(cust);
      setAccounts(acc);
      setWorkers(work);
      setExpenses(exp);
      setVehicles(veh);
      setPurchases(purch);
      setSales(sal);
      setPayments(pay);
      setTransfers(trans);
      setProducts(prod);
      setLoading(false);
    }
    void load();
  }, []);

  const fromTs = new Date(`${fromDate}T00:00:00`).getTime();
  const toTs = new Date(`${toDate}T23:59:59`).getTime();

  const filteredSales = sales.filter((s) => s.date >= fromTs && s.date <= toTs);
  const filteredPurchases = purchases.filter((p) => p.date >= fromTs && p.date <= toTs);
  const filteredPayments = payments.filter((p) => p.date >= fromTs && p.date <= toTs);
  const filteredExpenses = expenses.filter((e) => e.date >= fromTs && e.date <= toTs);
  const filteredTransfers = transfers.filter((tr) => tr.date >= fromTs && tr.date <= toTs);

  function getCategoryLabel(cat: Category) {
    if (cat === "customers") return t.customers;
    if (cat === "suppliers") return t.suppliers;
    if (cat === "accounts") return t.accounts;
    if (cat === "workers") return t.workers;
    if (cat === "expenses") return t.expenses;
    if (cat === "vehicles") return t.vehicles;
    return cat;
  }

  function getEntityDisplayName(id: string) {
    if (id === "all") return t.all;
    if (category === "customers") return customers.find((c) => c.id === id)?.name ?? id.slice(0, 8);
    if (category === "suppliers") return suppliers.find((s) => s.id === id)?.name ?? id.slice(0, 8);
    if (category === "accounts") return accounts.find((a) => a.id === id)?.name ?? id.slice(0, 8);
    if (category === "workers") return workers.find((w) => w.id === id)?.name ?? id.slice(0, 8);
    if (category === "vehicles") return vehicles.find((v) => v.id === id)?.name ?? id.slice(0, 8);
    return id.slice(0, 8);
  }

  function getEntityOptions() {
    if (category === "suppliers") return suppliers.map((s) => ({ id: s.id, name: s.name }));
    if (category === "customers") return customers.map((c) => ({ id: c.id, name: c.name }));
    if (category === "accounts") return accounts.map((a) => ({ id: a.id, name: a.name }));
    if (category === "workers") return workers.filter((w) => w.status === "active").map((w) => ({ id: w.id, name: w.name }));
    if (category === "expenses") return [{ id: "all", name: "Expenses" }];
    if (category === "vehicles") return vehicles.map((v) => ({ id: v.id, name: v.name }));
    return [];
  }

  function hasActivity(eId: string) {
    if (category === "customers") {
      return filteredSales.some((s) => s.customerId === eId) || filteredPayments.some((p) => p.entityType === "customer" && p.entityId === eId);
    }
    if (category === "suppliers") {
      return filteredPurchases.some((p) => p.supplierId === eId) || filteredPayments.some((p) => p.entityType === "supplier" && p.entityId === eId);
    }
    if (category === "accounts") {
      return filteredPayments.some((p) => p.accountId === eId) || filteredTransfers.some((tr) => tr.fromAccountId === eId || tr.toAccountId === eId) || filteredExpenses.some((e) => e.accountId === eId);
    }
    if (category === "workers") {
      return filteredPayments.some((p) => p.entityType === "worker" && p.entityId === eId);
    }
    if (category === "expenses") {
      return filteredExpenses.length > 0;
    }
    if (category === "vehicles") {
      return filteredExpenses.some((e) => e.note?.includes(eId) || e.note?.includes(vehicles.find((v) => v.id === eId)?.name ?? ""));
    }
    return false;
  }

  function productName(id: string) {
    return products.find((p) => p.id === id)?.name ?? id.slice(0, 6);
  }

  function renderPrintTableForEntity(eId: string) {
    if (category === "customers") {
      const salesForCustomer = eId === "all" ? [...filteredSales].sort((a, b) => a.date - b.date) : filteredSales.filter((s) => s.customerId === eId).sort((a, b) => a.date - b.date);
      const paymentsForCustomer = eId === "all" ? [...filteredPayments].filter((p) => p.entityType === "customer") : filteredPayments.filter((p) => p.entityType === "customer" && p.entityId === eId);
      if (salesForCustomer.length === 0 && paymentsForCustomer.length === 0) {
        return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
      }
      return (
        <div className={reportStyles.printTableWrapper}>
          <table className={reportStyles.printTable}>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.serial}</th>
                <th>{t.product}</th>
                <th>{t.quantity}</th>
                <th>{t.weight}</th>
                <th>{t.price}</th>
                <th>{t.total}</th>
              </tr>
            </thead>
            <tbody>
              {salesForCustomer.map((sale, sIdx) =>
                sale.items.map((item) => (
                  <tr key={`${sale.id}-${item.productId}`}>
                    <td>{formatDateLocalized(sale.date, language)}</td>
                    <td>{serialForDate(sale.date, sIdx)}</td>
                    <td>{productName(item.productId)}</td>
                    <td>{item.quantity}</td>
                    <td>{item.weightKg.toFixed(2)} kg</td>
                    <td>{formatCurrency(item.price, currency)}</td>
                    <td>{formatCurrency(item.total, currency)}</td>
                  </tr>
                )),
              )}
              {paymentsForCustomer.map((p) => (
                <tr key={p.id}>
                  <td>{formatDateLocalized(p.date, language)}</td>
                  <td>Payment</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{formatCurrency(p.amount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={reportStyles.printSummary}>
            <span>{t.totalSales}: {formatCurrency(salesForCustomer.reduce((s, sale) => s + sale.total, 0), currency)}</span>
            <span>{t.payment}: {formatCurrency(paymentsForCustomer.reduce((s, p) => s + p.amount, 0), currency)}</span>
          </div>
        </div>
      );
    }
    if (category === "suppliers") {
      const list = eId === "all" ? [...filteredPurchases] : filteredPurchases.filter((p) => p.supplierId === eId);
      if (list.length === 0) return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
      return (
        <div className={reportStyles.printTableWrapper}>
          <table className={reportStyles.printTable}>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.product}</th>
                <th>{t.quantity}</th>
                <th>{t.weight}</th>
                <th>{t.price}</th>
                <th>{t.total}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((pur) =>
                pur.items.map((item) => (
                  <tr key={`${pur.id}-${item.productId}`}>
                    <td>{formatDateLocalized(pur.date, language)}</td>
                    <td>{productName(item.productId)}</td>
                    <td>{item.quantity}</td>
                    <td>{item.weightKg.toFixed(2)} kg</td>
                    <td>{formatCurrency(item.price, currency)}</td>
                    <td>{formatCurrency(item.total, currency)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      );
    }
    if (category === "accounts") {
      const pays = eId === "all" ? [...filteredPayments] : filteredPayments.filter((p) => p.accountId === eId);
      const trans = eId === "all" ? [...filteredTransfers] : filteredTransfers.filter((tr) => tr.fromAccountId === eId || tr.toAccountId === eId);
      const exps = eId === "all" ? [...filteredExpenses] : filteredExpenses.filter((e) => e.accountId === eId);
      if (pays.length === 0 && trans.length === 0 && exps.length === 0) return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
      return (
        <div className={reportStyles.printTableWrapper}>
          <table className={reportStyles.printTable}>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.total}</th>
                <th>{t.history}</th>
              </tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}><td>{formatDateLocalized(p.date, language)}</td><td>{p.entityType} · {formatCurrency(p.amount, currency)}</td><td>{p.note ?? ""}</td></tr>
              ))}
              {trans.map((tr) => (
                <tr key={tr.id}><td>{formatDateLocalized(tr.date, language)}</td><td>Transfer {formatCurrency(tr.amount, currency)}</td><td>{tr.note ?? ""}</td></tr>
              ))}
              {exps.map((e) => (
                <tr key={e.id}><td>{formatDateLocalized(e.date, language)}</td><td>{e.name} · {formatCurrency(e.amount, currency)}</td><td>{e.note ?? ""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (category === "workers") {
      const pays = eId === "all" ? filteredPayments.filter((p) => p.entityType === "worker") : filteredPayments.filter((p) => p.entityType === "worker" && p.entityId === eId);
      if (pays.length === 0) return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
      return (
        <div className={reportStyles.printTableWrapper}>
          <table className={reportStyles.printTable}>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.total}</th>
                <th>{t.history}</th>
              </tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}><td>{formatDateLocalized(p.date, language)}</td><td>{formatCurrency(p.amount, currency)}</td><td>{p.note ?? ""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (category === "expenses") {
      if (filteredExpenses.length === 0) return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
      return (
        <div className={reportStyles.printTableWrapper}>
          <table className={reportStyles.printTable}>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.expense}</th>
                <th>{t.total}</th>
                <th>{t.account}</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((e) => (
                <tr key={e.id}><td>{formatDateLocalized(e.date, language)}</td><td>{e.name}</td><td>{formatCurrency(e.amount, currency)}</td><td>{accounts.find((a) => a.id === e.accountId)?.name ?? ""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (category === "vehicles") {
      const related = eId === "all" ? filteredExpenses.filter((e) => e.note?.startsWith("vehicle:")) : filteredExpenses.filter((e) => e.note?.includes(eId) || e.note?.includes(vehicles.find((v) => v.id === eId)?.name ?? ""));
      if (related.length === 0) return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
      return (
        <div className={reportStyles.printTableWrapper}>
          <table className={reportStyles.printTable}>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.vehicle}</th>
                <th>{t.total}</th>
              </tr>
            </thead>
            <tbody>
              {related.map((e) => (
                <tr key={e.id}><td>{formatDateLocalized(e.date, language)}</td><td>{e.name}</td><td>{formatCurrency(e.amount, currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
  }

  const renderPrintAllSections = () => {
    if (category === "expenses") {
      return (
        <div className={reportStyles.printEntitySection}>
          <h3 className={reportStyles.printEntityTitle}>Expenses</h3>
          {renderPrintTableForEntity("all")}
        </div>
      );
    }
    const ids = getEntityOptions().map((o) => o.id).filter((id) => id !== "all" && hasActivity(id));
    if (ids.length === 0) return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
    return (
      <>
        {ids.map((id) => (
          <div key={id} className={reportStyles.printEntitySection}>
            <h3 className={reportStyles.printEntityTitle}>{getEntityDisplayName(id)}</h3>
            {renderPrintTableForEntity(id)}
          </div>
        ))}
      </>
    );
  };

  const getPaperEntityIds = (): string[] => {
    if (category === "expenses") return ["all"];
    if (mode === "all") {
      const ids = getEntityOptions()
        .map((o) => o.id)
        .filter((id) => id !== "all" && hasActivity(id));
      return ids;
    }
    if (entityId === "all") {
      const ids = getEntityOptions()
        .map((o) => o.id)
        .filter((id) => id !== "all" && hasActivity(id));
      return ids.length ? ids : [];
    }
    return [entityId];
  };

  const isAppPdf = selectedPrinter === APP_PDF_PRINTER;

  const handlePrint = async () => {
    if (!selectedPrinter) {
      setPrintFeedback({ type: "error", message: t.pleaseSelectPrinter });
      return;
    }
    if (printers.length === 0) {
      setPrintFeedback({ type: "error", message: t.noPrintersDetected });
      return;
    }
    setPrinting(true);
    setPrintFeedback(null);
    try {
      if (isAppPdf) {
        await downloadReportPdf({
          category,
          entity: entityId,
          fromDate,
          toDate,
          mode,
          paperSize,
          margins,
          scale,
          colorMode,
          documentHeaderFooter: showHeaderFooter,
          repeatHeader: true,
        });
        setPrintFeedback({ type: "success", message: t.pdfGenerated });
      } else {
        const result = await printReport({
          printer: selectedPrinter,
          category,
          entity: entityId,
          fromDate,
          toDate,
          mode,
          paperSize,
          copies,
          sides,
          colorMode,
          margins,
          scale,
          documentHeaderFooter: showHeaderFooter,
          repeatHeader: true,
        });
        setPrintFeedback({ type: "success", message: result.message || `${t.printSuccess} ${result.printer || selectedPrinter} ${t.successfully}` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t.printFailed;
      setPrintFeedback({ type: "error", message: msg });
    } finally {
      setPrinting(false);
    }
  };

  const handleSystemPrint = () => {
    window.print();
  };

  const resetSettings = () => {
    setPaperSize("A4");
    setMargins("normal");
    setScale(100);
    setCopies(1);
    setSides("one-sided");
    setColorMode("color");
    setShowHeaderFooter(true);
  };

  if (loading) {
    return (
      <div dir={dir} className={`${styles.standalonePage} ${isDark ? "themeDark" : "themeLight"}`}>
        <main className={styles.reportsPage}>
          <div className={styles.statePanel}>
            <h2>{t.loadingReports}</h2>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`${styles.standalonePage} ${isDark ? "themeDark" : "themeLight"}`}>
      <div className={styles.printWorkspace}>
        <header className={styles.workspaceHeader}>
          <div className={styles.workspaceHeaderLeft}>
            <div className={styles.logo} aria-hidden="true">
              <img src="/chicken.jpg" alt="Hebrih logo" />
            </div>
            <div className={styles.workspaceTitle}>
              <h1>{t.printPreview}</h1>
              <p>{t.reviewConfigure}</p>
            </div>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={() => router.push("/")}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            Go to Dashboard
          </button>
        </header>

        <div className={styles.workspaceBody}>
          <div className={styles.previewArea}>
            <div className={styles.pagesStack}>
              {(() => {
                const ids = getPaperEntityIds();
                if (ids.length === 0) {
                  return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
                }
                return ids.map((eid) => (
                  <div
                    key={eid}
                    className={`${styles.paper} ${styles[`paper${paperSize}`]} ${styles["portrait"]} ${styles[`margins${margins.charAt(0).toUpperCase() + margins.slice(1)}`]} ${colorMode === "grayscale" ? styles.grayscale : ""} ${styles.entityPage}`}
                    style={{ transform: `scale(${scale / 100})`, transformOrigin: "top center" }}
                  >
                    {showHeaderFooter && (
                      <div className={reportStyles.printHeader}>
                        <div className={reportStyles.printLogo}>
                          <img src="/chicken.jpg" alt="Hebrih logo" />
                        </div>
                        <div className={reportStyles.printBrand}>
                          <h1>Hebrih Slaughter House</h1>
                          <span>Management System</span>
                        </div>
                      </div>
                    )}
                    <div className={reportStyles.printTitleBlock}>
                      <h2>{`${getCategoryLabel(category).toUpperCase()} ${t.reportSuffix}`}</h2>
                      <div className={reportStyles.printMeta}>
                        <span>{t.category}: {getCategoryLabel(category)}</span>
                        <span>{t.entity}: {eid === "all" ? t.all : getEntityDisplayName(eid)}</span>
                        <span>Period: {formatPeriodDate(fromDate, language)} → {formatPeriodDate(toDate, language)}</span>
                        <span>Generated: {formatGeneratedDate(language).split(" ")[0]} {formatGeneratedDate(language).split(" ")[1] || ""}</span>
                      </div>
                    </div>
                    <div className={`${reportStyles.printBody} ${!showHeaderFooter ? reportStyles.noHeaderFooter : ""}`}>
                      {renderPrintTableForEntity(eid)}
                    </div>
                    {showHeaderFooter && (
                      <div className={reportStyles.printFooter}>
                        <span>Hebrih Slaughter House Management System</span>
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>

          <aside className={styles.settingsPanel}>
            <h3>{t.printSettings}</h3>

            <label>
              <span>{t.paperSize}</span>
              <StyledSelect
                value={paperSize}
                onChange={(v) => setPaperSize(v as PaperSize)}
                placeholder={t.paperSize}
                ariaLabel={t.paperSize}
                options={[
                  { value: "A4", label: "A4" },
                  { value: "Letter", label: "Letter" },
                  { value: "Legal", label: "Legal" },
                ]}
              />
            </label>

            <label>
              <span>{t.choosePrinter}</span>
              <div className={styles.printerField}>
                <div className={styles.printerSelectWrap}>
                  {printersLoading ? (
                    <div className={styles.printerStatus}>{t.loadingPrinters}</div>
                  ) : (
                    <StyledSelect
                      value={selectedPrinter}
                      onChange={setSelectedPrinter}
                      placeholder={t.selectPrinter}
                      ariaLabel={t.choosePrinter}
                      options={printers.map((p) => ({ value: p.name, label: p.name === APP_PDF_PRINTER ? APP_PDF_LABEL : p.name }))}
                    />
                  )}
                </div>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={loadPrinters}
                  disabled={printersLoading}
                  aria-label={t.refreshPrinters}
                  title={t.refreshPrinters}
                >
                  <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
              {printersError && (
                <div className={styles.printerWarning}>
                  <span>{t.windowsPrintersError}</span>
                  <button type="button" className={styles.retryButton} onClick={loadPrinters}>{t.retry}</button>
                </div>
              )}
              {!printersError && !printersLoading && printers.length === 1 && printers[0]?.name === APP_PDF_PRINTER && (
                <div className={styles.printerMuted}>{t.noWindowsPrinters}</div>
              )}
            </label>

            <label>
              <span>{t.copies}</span>
              <input
                type="number"
                min={1}
                step={1}
                value={isAppPdf ? 1 : copies}
                onChange={(e) => {
                  if (isAppPdf) return;
                  const raw = e.target.value;
                  if (raw === "") {
                    setCopies(1);
                    return;
                  }
                  const n = Math.floor(Number(raw));
                  if (!Number.isFinite(n)) return;
                  setCopies(Math.max(1, n));
                }}
                onBlur={(e) => {
                  if (isAppPdf) return;
                  const n = Math.floor(Number(e.currentTarget.value));
                  if (!Number.isFinite(n) || n < 1) setCopies(1);
                }}
                className={styles.copiesInput}
                aria-label="Copies"
                disabled={isAppPdf}
                title={isAppPdf ? "{t.copiesHint}" : undefined}
                style={isAppPdf ? { opacity: 0.5 } : undefined}
              />
              {isAppPdf && <span className={styles.fieldHint}>{t.copiesHint}</span>}
            </label>

            <label>
              <span>{t.sides}</span>
              <div style={isAppPdf ? { opacity: 0.5, pointerEvents: isAppPdf ? "none" : undefined } as any : undefined}>
                <StyledSelect
                  value={sides}
                  onChange={(v) => setSides(v as Sides)}
                  placeholder={t.sides}
                  ariaLabel={t.sides}
                  options={[
                    { value: "one-sided", label: t.oneSided },
                    { value: "two-sided", label: t.twoSided },
                  ]}
                />
              </div>
              {isAppPdf && <span className={styles.fieldHint}>{t.copiesHint}</span>}
            </label>

            <label>
              <span>{t.colorMode}</span>
              <StyledSelect
                value={colorMode}
                onChange={(v) => setColorMode(v as ColorMode)}
                placeholder={t.colorMode}
                ariaLabel={t.colorMode}
                options={[
                  { value: "color", label: t.color },
                  { value: "grayscale", label: t.grayscale },
                ]}
              />
            </label>

            <button
              type="button"
              className={styles.showMoreButton}
              onClick={() => setShowMoreSettings((v) => !v)}
              aria-expanded={showMoreSettings}
              aria-label="Show more print settings"
            >
              <span>{showMoreSettings ? "Show less" : "Show more"}</span>
              {showMoreSettings ? <ChevronUp size={16} strokeWidth={2} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />}
            </button>

            {showMoreSettings && (
              <div className={styles.showMoreSection}>
            <label>
              <span>{t.margins}</span>
              <StyledSelect
                value={margins}
                onChange={(v) => setMargins(v as Margins)}
                placeholder={t.margins}
                ariaLabel={t.margins}
                options={[
                  { value: "normal", label: t.normal },
                  { value: "narrow", label: t.narrow },
                  { value: "wide", label: t.wide },
                ]}
              />
            </label>

            <label>
              <span>{t.scale}</span>
              <div className={styles.scaleControl}>
                <input
                  type="range"
                  min={70}
                  max={130}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                />
                <input
                  type="number"
                  min={70}
                  max={130}
                  value={scale}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 70 && v <= 130) setScale(v);
                  }}
                />
                <span>%</span>
              </div>
            </label>

            <label className={styles.toggleRow}>
              <span>{t.documentHeaderFooter}</span>
              <input type="checkbox" checked={showHeaderFooter} onChange={(e) => setShowHeaderFooter(e.target.checked)} />
            </label>
              </div>
            )}

            <button type="button" className={styles.secondaryButton} onClick={resetSettings}>
              Reset settings
            </button>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={handlePrint}
              disabled={printersLoading || !selectedPrinter || printing}
              style={{ width: "100%", opacity: printersLoading || !selectedPrinter || printing ? 0.6 : 1 }}
            >
              {printing ? (
                <>
                  <RefreshCw size={16} strokeWidth={2} aria-hidden="true" className={styles.spinIcon} />
                  {isAppPdf ? t.savingPdf : t.printing}
                </>
              ) : isAppPdf ? (
                <>
                  <FileDown size={16} strokeWidth={2} aria-hidden="true" />
                  Save PDF
                </>
              ) : (
                <>
                  <Printer size={16} strokeWidth={2} aria-hidden="true" />
                  Print
                </>
              )}
            </button>
            {printFeedback && (
              <div className={printFeedback.type === "success" ? styles.successBox : styles.errorBox} role="status">
                {printFeedback.message}
              </div>
            )}
            <button type="button" className={styles.fallbackButton} onClick={handleSystemPrint}>
              Open system print dialog
            </button>

            <div className={styles.reportDetailsBox}>
              <h4>{t.reportDetails}</h4>
              <div className={styles.detailRow}>
                <span>{t.report}</span>
                <strong>{getCategoryLabel(category)} Report</strong>
              </div>
              <div className={styles.detailRow}>
                <span>{t.category}</span>
                <strong>{getCategoryLabel(category)}</strong>
              </div>
              <div className={styles.detailRow}>
                <span>{t.entity}</span>
                <strong>{entityId === "all" ? "All" : getEntityDisplayName(entityId)}</strong>
              </div>
              <div className={styles.detailRow}>
                <span>{t.period}</span>
                <strong>{formatPeriodDate(fromDate, language)} → {formatPeriodDate(toDate, language)}</strong>
              </div>
              <div className={styles.detailRow}>
                <span>{t.printMode}</span>
                <strong>{mode === "all" ? t.allWithActivity : t.selected}</strong>
              </div>
            </div>
            <p className={styles.hint}>{t.printerHint}</p>
          </aside>
        </div>
      </div>

      <div className={reportStyles.printOnly} aria-hidden="true">
        {(() => {
          const ids = getPaperEntityIds();
          if (ids.length === 0) {
            return <div className={reportStyles.printEmpty}><p>{t.noActivity}</p></div>;
          }
          return ids.map((eid) => (
            <div key={eid} className={styles.printEntityPage}>
              {showHeaderFooter && (
                <div className={reportStyles.printHeader}>
                  <div className={reportStyles.printLogo}>
                    <img src="/chicken.jpg" alt="Hebrih logo" />
                  </div>
                  <div className={reportStyles.printBrand}>
                    <h1>Hebrih Slaughter House</h1>
                    <span>Management System</span>
                  </div>
                </div>
              )}
              <div className={reportStyles.printTitleBlock}>
                <h2>{getCategoryLabel(category).toUpperCase()} REPORT</h2>
                <div className={reportStyles.printMeta}>
                  <span>Category: {getCategoryLabel(category)}</span>
                  <span>Entity: {eid === "all" ? getCategoryLabel(category) : getEntityDisplayName(eid)}</span>
                  <span>Period: {formatPeriodDate(fromDate, language)} → {formatPeriodDate(toDate, language)}</span>
                  <span>Generated: {formatGeneratedDate(language).split(" ")[0]} {formatGeneratedDate(language).split(" ")[1] || ""}</span>
                </div>
              </div>
              <div className={`${reportStyles.printBody} ${!showHeaderFooter ? reportStyles.noHeaderFooter : ""}`}>
                {renderPrintTableForEntity(eid)}
              </div>
              {showHeaderFooter && (
                <div className={reportStyles.printFooter}>
                  <span>Hebrih Slaughter House Management System</span>
                </div>
              )}
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

export default function PrintPreviewPage() {
  return (
    <Suspense fallback={<div className={`${styles.standalonePage} themeLight`}><main className={styles.reportsPage}><div className={styles.statePanel}><h2>Loading reports...</h2></div></main></div>}>
      <PrintPreviewInner />
    </Suspense>
  );
}
