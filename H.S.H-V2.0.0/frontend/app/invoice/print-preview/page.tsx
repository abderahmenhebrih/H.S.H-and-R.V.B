"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, FileDown, Printer, RefreshCw } from "lucide-react";
import StyledSelect from "../../../src/components/common/StyledSelect";
import FormalInvoiceDocument from "../../../src/components/invoice/FormalInvoiceDocument";
import { getPrinters, printInvoice, downloadInvoicePdf, APP_PDF_PRINTER, APP_PDF_LABEL } from "../../../src/services/printing.service";
import type { PrinterInfo } from "../../../src/services/printing.service";
import { invoiceService } from "../../../src/services/invoice.service";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, formatCurrency, getDirection, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Invoice } from "../../../src/types/entities/invoice";
import type { Currency, Language } from "../../../src/types/settings/settings";
import styles from "./page.module.css";
import invoiceStyles from "../page.module.css";

type PaperSize = "A4" | "Letter" | "Legal";
type Margins = "normal" | "narrow" | "wide";
type ColorMode = "color" | "grayscale";
type Sides = "one-sided" | "two-sided";

const TRANSLATIONS = {
  en: {
    loadingInvoice: "Loading invoice...",
    notFound: "Invoice not found",
    invoicePrintPreview: "Invoice Print Preview",
    reviewConfigure: "Review and configure the invoice before printing.",
    goToDashboard: "Go to Dashboard",
    backToInvoice: "Back to Invoices",
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
    pleaseSelectPrinter: "Please select a printer.",
    noPrintersDetected: "No printers detected.",
    pdfGenerated: "PDF generated successfully.",
    printSuccess: "Invoice sent to",
    successfully: "successfully.",
    printFailed: "Print job failed.",
    showMore: "Show more",
    showLess: "Show less",
    refreshPrinters: "Refresh printers",
    invoiceDetails: "INVOICE DETAILS",
    invoiceNo: "Invoice No.",
    customer: "Customer",
    seller: "Seller",
    status: "Status",
  },
  fr: {
    loadingInvoice: "Chargement de la facture...",
    notFound: "Facture introuvable",
    invoicePrintPreview: "Aperçu de la facture",
    reviewConfigure: "Vérifiez et configurez la facture avant d'imprimer.",
    goToDashboard: "Aller au tableau de bord",
    backToInvoice: "Retour aux factures",
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
    pleaseSelectPrinter: "Veuillez sélectionner une imprimante.",
    noPrintersDetected: "Aucune imprimante détectée.",
    pdfGenerated: "PDF généré avec succès.",
    printSuccess: "Facture envoyée à",
    successfully: "avec succès.",
    printFailed: "Échec de la tâche d'impression.",
    showMore: "Afficher plus",
    showLess: "Afficher moins",
    refreshPrinters: "Actualiser les imprimantes",
    invoiceDetails: "DÉTAILS DE LA FACTURE",
    invoiceNo: "N° Facture",
    customer: "Client",
    seller: "Vendeur",
    status: "Statut",
  },
  ar: {
    loadingInvoice: "جارٍ تحميل الفاتورة...",
    notFound: "الفاتورة غير موجودة",
    invoicePrintPreview: "معاينة الفاتورة",
    reviewConfigure: "راجع وقم بتكوين الفاتورة قبل الطباعة.",
    goToDashboard: "الذهاب إلى لوحة التحكم",
    backToInvoice: "العودة إلى الفواتير",
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
    pleaseSelectPrinter: "الرجاء اختيار طابعة.",
    noPrintersDetected: "لم يتم اكتشاف طابعات.",
    pdfGenerated: "تم إنشاء PDF بنجاح.",
    printSuccess: "تم إرسال الفاتورة إلى",
    successfully: "بنجاح.",
    printFailed: "فشلت مهمة الطباعة.",
    showMore: "عرض المزيد",
    showLess: "عرض أقل",
    refreshPrinters: "تحديث الطابعات",
    invoiceDetails: "تفاصيل الفاتورة",
    invoiceNo: "رقم الفاتورة",
    customer: "الزبون",
    seller: "البائع",
    status: "الحالة",
  },
} as const;

function PrintPreviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get("invoiceId") || "";
  const downloadParam = searchParams.get("download") === "1";

  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [documentDefaults, setDocumentDefaults] = useState<any>(null);

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
  const [autoDownloadDone, setAutoDownloadDone] = useState(false);

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
      const s: any = await settingsService.get();
      const lang = s?.language ?? DEFAULT_SETTINGS.language;
      const curr = s?.currency ?? DEFAULT_SETTINGS.currency;
      setLanguage(lang);
      setCurrency(curr);
      setDocumentDefaults(s?.invoiceDocumentDefaults || null);
      document.documentElement.lang = lang;
      document.documentElement.dir = getDirection(lang);
    }
    void loadSettingsAndLang();
    const handler = (e: Event) => {
      const ce = e as CustomEvent<any>;
      if ((ce as any)?.detail) {
        const lang = (ce as any).detail.language ?? DEFAULT_SETTINGS.language;
        const curr = (ce as any).detail.currency ?? DEFAULT_SETTINGS.currency;
        setLanguage(lang);
        setCurrency(curr);
        setDocumentDefaults((ce as any).detail.invoiceDocumentDefaults || null);
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
    async function loadInvoice() {
      if (!invoiceId) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      try {
        const inv = await invoiceService.getById(invoiceId);
        if (!inv) {
          setNotFound(true);
        } else {
          setInvoice(inv as Invoice);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    void loadInvoice();
  }, [invoiceId]);

  // Auto-download if ?download=1 (Export action calls this directly, but also honor query)
  useEffect(() => {
    if (downloadParam && invoice && !autoDownloadDone && !loading) {
      setAutoDownloadDone(true);
      void (async () => {
        try {
          await downloadInvoicePdf({
            invoiceId: invoice.id,
            paperSize,
            margins,
            scale,
            colorMode,
            documentHeaderFooter: showHeaderFooter,
          });
        } catch (e) {
          console.error(e);
        }
      })();
    }
  }, [downloadParam, invoice, autoDownloadDone, loading, paperSize, margins, scale, colorMode, showHeaderFooter]);

  const isAppPdf = selectedPrinter === APP_PDF_PRINTER;

  const handlePrint = async () => {
    if (!invoice) return;
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
        await downloadInvoicePdf({
          invoiceId: invoice.id,
          paperSize,
          margins,
          scale,
          colorMode,
          documentHeaderFooter: showHeaderFooter,
        });
        setPrintFeedback({ type: "success", message: t.pdfGenerated });
      } else {
        const result = await printInvoice({
          printer: selectedPrinter,
          invoiceId: invoice.id,
          paperSize,
          copies,
          sides,
          colorMode,
          margins,
          scale,
          documentHeaderFooter: showHeaderFooter,
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
            <h2>{t.loadingInvoice}</h2>
          </div>
        </main>
      </div>
    );
  }

  if (notFound || !invoice) {
    return (
      <div dir={dir} className={`${styles.standalonePage} ${isDark ? "themeDark" : "themeLight"}`}>
        <main className={styles.reportsPage}>
          <div className={styles.statePanel}>
            <h2>{t.notFound}</h2>
            <button type="button" className={styles.secondaryButton} onClick={() => router.push("/invoice")}>
              <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
              {t.backToInvoice}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div dir={dir} className={`${styles.standalonePage} ${isDark ? "themeDark" : "themeLight"}`}>
      <div className={styles.printWorkspace}>
        <header className={styles.workspaceHeader}>
          <div className={styles.workspaceHeaderLeft}>
            <div className={styles.logo} aria-hidden="true">
              <img src="/chicken.jpg" alt="Hebrih logo" />
            </div>
            <div className={styles.workspaceTitle}>
              <h1>{t.invoicePrintPreview}</h1>
              <p>{t.reviewConfigure}</p>
            </div>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={() => router.push("/invoice")}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
            {t.backToInvoice}
          </button>
        </header>

        <div className={styles.workspaceBody}>
          <div className={styles.previewArea}>
            <div className={styles.pagesStack}>
              <div
                key={invoice.id}
                className={`${styles.paper} ${styles[`paper${paperSize}`]} ${styles["portrait"]} ${styles[`margins${margins.charAt(0).toUpperCase() + margins.slice(1)}`]} ${colorMode === "grayscale" ? styles.grayscale : ""} ${styles.entityPage}`}
                style={{ transform: `scale(${scale / 100})`, transformOrigin: "top center" }}
              >
                <FormalInvoiceDocument invoice={invoice} documentDefaults={documentDefaults} showHeaderFooter={showHeaderFooter} />
              </div>
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
                title={isAppPdf ? t.copiesHint : undefined}
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
              <span>{showMoreSettings ? t.showLess : t.showMore}</span>
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
              {t.resetSettings}
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
                  {t.savePdf}
                </>
              ) : (
                <>
                  <Printer size={16} strokeWidth={2} aria-hidden="true" />
                  {t.print}
                </>
              )}
            </button>
            {printFeedback && (
              <div className={printFeedback.type === "success" ? styles.successBox : styles.errorBox} role="status">
                {printFeedback.message}
              </div>
            )}
            <button type="button" className={styles.fallbackButton} onClick={handleSystemPrint}>
              {t.openSystemPrint}
            </button>

            <div className={styles.reportDetailsBox}>
              <h4>{t.invoiceDetails}</h4>
              <div className={styles.detailRow}>
                <span>{t.invoiceNo}</span>
                <strong>{invoice.invoiceNumber || t.notFound}</strong>
              </div>
              <div className={styles.detailRow}>
                <span>{t.customer}</span>
                <strong>{invoice.customerSnapshot.name}</strong>
              </div>
              <div className={styles.detailRow}>
                <span>{t.seller}</span>
                <strong>{invoice.sellerSnapshot.commercialName}</strong>
              </div>
              <div className={styles.detailRow}>
                <span>{t.status}</span>
                <strong>{invoice.status}</strong>
              </div>
            </div>
            <p className={styles.hint}>Printer, destination, copies, and device-specific options are selected in the system print dialog.</p>
          </aside>
        </div>
      </div>

      <div className={styles.printOnly} aria-hidden="true">
        <div className={styles.printEntityPage}>
          <FormalInvoiceDocument invoice={invoice} documentDefaults={documentDefaults} showHeaderFooter={showHeaderFooter} />
        </div>
      </div>
    </div>
  );
}

export default function InvoicePrintPreviewPage() {
  return (
    <Suspense fallback={<div className={`${styles.standalonePage} themeLight`}><main className={styles.reportsPage}><div className={styles.statePanel}><h2>Loading invoice...</h2></div></main></div>}>
      <PrintPreviewInner />
    </Suspense>
  );
}
