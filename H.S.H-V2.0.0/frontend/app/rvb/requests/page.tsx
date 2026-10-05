"use client";

import { formatTimestampToDisplay } from "../../../src/lib/date-format";

import { useCallback, useEffect, useMemo, useState } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import StyledSelect from "../../../src/components/common/StyledSelect";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS, formatCurrency } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { rvbRequestService, type NormalizedRequest, type RvbRequestDetail } from "../../../src/services/rvb-request.service";
import { Search, Inbox, Eye, X, CheckCircle, XCircle, Clock, FileQuestion, PackageCheck, Truck as TruckIcon } from "lucide-react";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    title: "Requests",
    subtitle: "Review and manage worker, supplier and customer requests.",
    searchPlaceholder: "Search by requester, @tag, request ID or description",
    kpi: { total: "Total Requests", underReview: "Under Review", accepted: "Accepted", rejected: "Rejected" },
    filters: {
      statusLabel: "Status",
      sourceLabel: "Source",
      typeLabel: "Type",
      statusAll: "All",
      statusUnderReview: "Under Review",
      statusAccepted: "Accepted",
      statusRejected: "Rejected",
      sourceAll: "All",
      sourceWorker: "Worker",
      sourceSupplier: "Supplier",
      sourceCustomer: "Customer",
      typeAll: "All",
      typePayment: "Payment Request",
      typeLoan: "Loan Application",
      typeNewSupply: "New Supply",
      typeInsertShipment: "Insert Shipment",
      typeDiscrepancy: "Discrepancy Report",
    },
    table: { requester: "Requester", type: "Type", details: "Details", submitted: "Submitted", status: "Status", access: "Access" },
    badges: { worker: "Worker", supplier: "Supplier", customer: "Customer" },
    statuses: { under_review: "Under Review", accepted: "Accepted", rejected: "Rejected" },
    types: {
      payment: "Payment Request",
      loan: "Loan Application",
      discrepancy: "Discrepancy Report",
      new_supply: "New Supply",
      insert_shipment: "Insert Shipment",
    },
    view: "Access",
    loading: "Loading requests...",
    error: "Failed to load requests",
    emptyAll: "No requests found.",
    emptyUnderReview: "No requests under review.",
    emptyWorker: "No Worker requests under review.",
    emptySupplier: "No Supplier requests under review.",
    emptyCustomer: "No Customer requests under review.",
    pagination: { prev: "Prev", next: "Next", page: "Page" },
    forbidden: "You do not have permission to view Requests.",
    detail: {
      requestId: "Request ID",
      requester: "Requester",
      submitted: "Submitted",
      status: "Status",
      reviewedBy: "Reviewed by",
      reviewedAt: "Reviewed at",
      response: "Management response",
      processedRef: "Processed reference",
      close: "Close",
      accept: "Accept",
      reject: "Reject",
      editThenAccept: "Edit then Accept",
      confirmEditAccept: "Confirm Edit & Accept",
      cancel: "Cancel",
      confirm: "Confirm",
      notesPlaceholder: "Optional note to requester...",
      confirmPayTitle: "Accept Payment Request",
      confirmPayDesc: "This will create a worker payment of",
      confirmLoanTitle: "Accept Loan Application",
      confirmLoanDesc: "This will credit worker balance by",
      confirmSupplyTitle: "Accept Supply Request",
      confirmSupplyDesc: "This will create a Purchase and update inventory and supplier balance.",
      confirmShipmentTitle: "Accept Shipment Request",
      confirmShipmentDesc: "This will create a Sale and update inventory and customer balance.",
      confirmDiscrepancyTitle: "Review Discrepancy",
      confirmDiscrepancyDesc: "This will mark the discrepancy as reviewed. No accounting changes will occur.",
      continue: "Continue?",
      currentCredit: "Current credit",
      requestedAmount: "Requested amount",
      reason: "Reason / Description",
      topic: "Topic",
      related: "Related record",
      supplyDate: "Supply date",
      products: "Products",
      calculation: "Calculation details",
      total: "Total",
      quantity: "Quantity",
      weight: "Weight",
      price: "Price",
      amount: "Amount",
      date: "Date",
      noProducts: "No products",
      insufficientStock: "Insufficient stock will block acceptance.",
      needsRevalidation: "Credit will be revalidated at acceptance time.",
      original: "Original submission preserved",
      edited: "Edited values will be processed",
      loanGap: "Loan acceptance will credit worker balance. Ensure loan policy is authoritative.",
    },
  },
  fr: {
    title: "Demandes",
    subtitle: "Examinez et gérez les demandes travailleurs, fournisseurs et clients.",
    searchPlaceholder: "Rechercher par demandeur, @tag, ID ou description",
    kpi: { total: "Total Demandes", underReview: "En Examen", accepted: "Acceptées", rejected: "Rejetées" },
    filters: {
      statusLabel: "Statut",
      sourceLabel: "Source",
      typeLabel: "Type",
      statusAll: "Tous",
      statusUnderReview: "En Examen",
      statusAccepted: "Acceptée",
      statusRejected: "Rejetée",
      sourceAll: "Tous",
      sourceWorker: "Travailleur",
      sourceSupplier: "Fournisseur",
      sourceCustomer: "Client",
      typeAll: "Tous",
      typePayment: "Demande de Paiement",
      typeLoan: "Demande de Prêt",
      typeNewSupply: "Nouvel Approvisionnement",
      typeInsertShipment: "Insertion Expédition",
      typeDiscrepancy: "Rapport d'Écart",
    },
    table: { requester: "Demandeur", type: "Type", details: "Détails", submitted: "Soumis", status: "Statut", access: "Accéder" },
    badges: { worker: "Travailleur", supplier: "Fournisseur", customer: "Client" },
    statuses: { under_review: "En Examen", accepted: "Acceptée", rejected: "Rejetée" },
    types: {
      payment: "Demande de Paiement",
      loan: "Demande de Prêt",
      discrepancy: "Rapport d'Écart",
      new_supply: "Nouvel Approvisionnement",
      insert_shipment: "Insertion Expédition",
    },
    view: "Accéder",
    loading: "Chargement...",
    error: "Échec chargement",
    emptyAll: "Aucune demande trouvée.",
    emptyUnderReview: "Aucune demande en examen.",
    emptyWorker: "Aucune demande Travailleur en examen.",
    emptySupplier: "Aucune demande Fournisseur en examen.",
    emptyCustomer: "Aucune demande Client en examen.",
    pagination: { prev: "Préc.", next: "Suiv.", page: "Page" },
    forbidden: "Vous n'avez pas la permission de voir les demandes.",
    detail: {
      requestId: "ID Demande",
      requester: "Demandeur",
      submitted: "Soumis",
      status: "Statut",
      reviewedBy: "Examiné par",
      reviewedAt: "Examiné le",
      response: "Réponse direction",
      processedRef: "Référence traitée",
      close: "Fermer",
      accept: "Accepter",
      reject: "Rejeter",
      editThenAccept: "Modifier puis accepter",
      confirmEditAccept: "Confirmer modification & accepter",
      cancel: "Annuler",
      confirm: "Confirmer",
      notesPlaceholder: "Note optionnelle au demandeur...",
      confirmPayTitle: "Accepter demande de paiement",
      confirmPayDesc: "Cela créera un paiement travailleur de",
      confirmLoanTitle: "Accepter demande de prêt",
      confirmLoanDesc: "Cela créditera le solde travailleur de",
      confirmSupplyTitle: "Accepter approvisionnement",
      confirmSupplyDesc: "Cela créera un achat et mettra à jour stock et solde fournisseur.",
      confirmShipmentTitle: "Accepter expédition",
      confirmShipmentDesc: "Cela créera une vente et mettra à jour stock et solde client.",
      confirmDiscrepancyTitle: "Examiner écart",
      confirmDiscrepancyDesc: "Cela marquera l'écart comme examiné. Aucune modification comptable.",
      continue: "Continuer ?",
      currentCredit: "Crédit actuel",
      requestedAmount: "Montant demandé",
      reason: "Motif / Description",
      topic: "Sujet",
      related: "Enregistrement lié",
      supplyDate: "Date d'approvisionnement",
      products: "Produits",
      calculation: "Détails calcul",
      total: "Total",
      quantity: "Quantité",
      weight: "Poids",
      price: "Prix",
      amount: "Montant",
      date: "Date",
      noProducts: "Aucun produit",
      insufficientStock: "Stock insuffisant bloquera l'acceptation.",
      needsRevalidation: "Le crédit sera revalidé à l'acceptation.",
      original: "Soumission originale préservée",
      edited: "Valeurs modifiées seront traitées",
      loanGap: "L'acceptation créditera le solde. Vérifiez la politique prêt.",
    },
  },
  ar: {
    title: "الطلبات",
    subtitle: "مراجعة وإدارة طلبات العمال والموردين والزبائن.",
    searchPlaceholder: "ابحث بالطالب، @tag، المعرف أو الوصف",
    kpi: { total: "إجمالي الطلبات", underReview: "قيد المراجعة", accepted: "مقبولة", rejected: "مرفوضة" },
    filters: {
      statusLabel: "الحالة",
      sourceLabel: "المصدر",
      typeLabel: "النوع",
      statusAll: "الكل",
      statusUnderReview: "قيد المراجعة",
      statusAccepted: "مقبولة",
      statusRejected: "مرفوضة",
      sourceAll: "الكل",
      sourceWorker: "عامل",
      sourceSupplier: "مورد",
      sourceCustomer: "زبون",
      typeAll: "الكل",
      typePayment: "طلب دفع",
      typeLoan: "طلب قرض",
      typeNewSupply: "توريد جديد",
      typeInsertShipment: "إدراج شحنة",
      typeDiscrepancy: "بلاغ اختلاف",
    },
    table: { requester: "الطالب", type: "النوع", details: "التفاصيل", submitted: "مرسل", status: "الحالة", access: "دخول" },
    badges: { worker: "عامل", supplier: "مورد", customer: "زبون" },
    statuses: { under_review: "قيد المراجعة", accepted: "مقبولة", rejected: "مرفوضة" },
    types: {
      payment: "طلب دفع",
      loan: "طلب قرض",
      discrepancy: "بلاغ اختلاف",
      new_supply: "توريد جديد",
      insert_shipment: "إدراج شحنة",
    },
    view: "دخول",
    loading: "جارٍ التحميل...",
    error: "فشل التحميل",
    emptyAll: "لا توجد طلبات.",
    emptyUnderReview: "لا توجد طلبات قيد المراجعة.",
    emptyWorker: "لا توجد طلبات عمال قيد المراجعة.",
    emptySupplier: "لا توجد طلبات موردين قيد المراجعة.",
    emptyCustomer: "لا توجد طلبات زبائن قيد المراجعة.",
    pagination: { prev: "السابق", next: "التالي", page: "صفحة" },
    forbidden: "ليس لديك صلاحية عرض الطلبات.",
    detail: {
      requestId: "معرف الطلب",
      requester: "الطالب",
      submitted: "مرسل",
      status: "الحالة",
      reviewedBy: "راجع من قبل",
      reviewedAt: "راجع في",
      response: "رد الإدارة",
      processedRef: "المرجع المعالج",
      close: "إغلاق",
      accept: "قبول",
      reject: "رفض",
      editThenAccept: "تعديل ثم قبول",
      confirmEditAccept: "تأكيد التعديل والقبول",
      cancel: "إلغاء",
      confirm: "تأكيد",
      notesPlaceholder: "ملاحظة اختيارية للطالب...",
      confirmPayTitle: "قبول طلب الدفع",
      confirmPayDesc: "سيؤدي هذا إلى إنشاء دفعة للعامل بمبلغ",
      confirmLoanTitle: "قبول طلب القرض",
      confirmLoanDesc: "سيؤدي هذا إلى إضافة رصيد للعامل بمبلغ",
      confirmSupplyTitle: "قبول طلب التوريد",
      confirmSupplyDesc: "سيؤدي هذا إلى إنشاء عملية شراء وتحديث المخزون ورصيد المورد.",
      confirmShipmentTitle: "قبول طلب الشحنة",
      confirmShipmentDesc: "سيؤدي هذا إلى إنشاء عملية بيع وتحديث المخزون ورصيد الزبون.",
      confirmDiscrepancyTitle: "مراجعة بلاغ اختلاف",
      confirmDiscrepancyDesc: "سيتم وضع علامة المراجعة. لن يحدث تغيير محاسبي.",
      continue: "متابعة؟",
      currentCredit: "الرصيد الحالي",
      requestedAmount: "المبلغ المطلوب",
      reason: "السبب / الوصف",
      topic: "الموضوع",
      related: "سجل مرتبط",
      supplyDate: "تاريخ التوريد",
      products: "المنتجات",
      calculation: "تفاصيل الحساب",
      total: "الإجمالي",
      quantity: "الكمية",
      weight: "الوزن",
      price: "السعر",
      amount: "المبلغ",
      date: "التاريخ",
      noProducts: "لا توجد منتجات",
      insufficientStock: "نقص المخزون سيمنع القبول.",
      needsRevalidation: "سيتم إعادة التحقق من الرصيد عند القبول.",
      original: "التقديم الأصلي محفوظ",
      edited: "سيتم معالجة القيم المعدلة",
      loanGap: "سيتم إضافة الرصيد. تأكد من سياسة القرض.",
    },
  },
} as const;

function formatDate(ts: number | null | undefined, lang: string) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const locale = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", numberingSystem: "latn" } as any).format(d);
  } catch {
    return new Date(ts!).toLocaleString();
  }
}
function formatDateShort(ts: number | null | undefined, lang: string) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    const locale = lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB";
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", numberingSystem: "latn" } as any).format(d);
  } catch {
    return formatTimestampToDisplay(ts);
  }
}
function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function getTypeLabel(raw: string, source: string, t: any): string {
  const map: Record<string, string> = {
    payment: t.types.payment,
    loan: t.types.loan,
    discrepancy: t.types.discrepancy,
    new_supply: t.types.new_supply,
    insert_shipment: t.types.insert_shipment,
  };
  return map[raw] || raw;
}

function RvbRequestsGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRvbAuth();
  if (loading) {
    return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "var(--muted)" }}><Clock size={20} style={{ animation: "spin 0.8s linear infinite" } as any} /></div>;
  }
  if (!user) return <>{children}</>;
  const allowed = ["manager", "admin", "supervisor"].includes(user.role);
  if (!allowed) {
    return (
      <RvbShell activePage="requests">
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
          <FileQuestion size={32} style={{ margin: "0 auto 12px", display: "block" }} />
          <strong>403 — Forbidden</strong>
          <p style={{ marginTop: 8 }}>{(TR as any)["en"].forbidden}</p>
        </div>
      </RvbShell>
    );
  }
  return <>{children}</>;
}

function RequestsInner() {
  const { user } = useRvbAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [requests, setRequests] = useState<NormalizedRequest[]>([]);
  const [kpi, setKpi] = useState<{ total: number; underReview: number; accepted: number; rejected: number } | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("under_review");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<{ source: string; id: string } | null>(null);
  const [detail, setDetail] = useState<RvbRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewDialog, setReviewDialog] = useState<{ status: "accepted" | "rejected"; notes: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;
  const isRtl = lang === "ar";

  // Settings listener
  useEffect(() => {
    rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); });
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
      else rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); });
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h as any);
    return () => window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h as any);
  }, []);

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [statusFilter, sourceFilter, typeFilter, debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await rvbRequestService.list({
        status: statusFilter,
        source: sourceFilter,
        type: typeFilter,
        search: debouncedSearch || undefined,
        page,
        limit: 25,
      });
      setRequests(Array.isArray(res.requests) ? res.requests : []);
      setKpi(res.kpi || null);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (e: any) {
      setError(e?.data?.code || e?.message || t.error);
      setRequests([]);
    } finally { setLoading(false); }
  }, [statusFilter, sourceFilter, typeFilter, debouncedSearch, page, t.error]);

  useEffect(() => { void load(); }, [load]);

  // Detail fetch
  useEffect(() => {
    if (!selected) { setDetail(null); setIsEditing(false); return; }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      try {
        const d = await rvbRequestService.getDetail(selected.source, selected.id);
        if (!cancelled) {
          setDetail(d);
          setIsEditing(false);
          setEditedItems(Array.isArray(d.items) ? d.items.map((it: any) => ({ ...it, quantity: Number(it.quantity), weightKg: Number(it.weightKg), price: Number(it.price), total: Number(it.total) })) : []);
        }
      } catch (e: any) {
        if (!cancelled) setDetail(null);
      } finally { if (!cancelled) setDetailLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  // Scroll lock for drawer
  useEffect(() => {
    if (!selected && !reviewDialog) return;
    const body = document.body;
    const html = document.documentElement;
    const prevBody = body.style.overflow;
    const prevHtml = html.style.overflow;
    const prevPad = body.style.paddingRight;
    const sw = window.innerWidth - html.clientWidth;
    if (sw > 0) body.style.paddingRight = `${sw}px`;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => { body.style.overflow = prevBody; html.style.overflow = prevHtml; body.style.paddingRight = prevPad; };
  }, [selected, reviewDialog]);

  const typeOptions = useMemo(() => {
    const all = [
      { value: "all", label: t.filters.typeAll },
      { value: "payment", label: t.filters.typePayment },
      { value: "loan", label: t.filters.typeLoan },
      { value: "new_supply", label: t.filters.typeNewSupply },
      { value: "insert_shipment", label: t.filters.typeInsertShipment },
      { value: "discrepancy", label: t.filters.typeDiscrepancy },
    ];
    if (sourceFilter === "worker") return [all[0], all[1], all[2], all[5]];
    if (sourceFilter === "supplier") return [all[0], all[3], all[5]];
    if (sourceFilter === "customer") return [all[0], all[4], all[5]];
    return all;
  }, [sourceFilter, t]);

  const emptyTitle = useMemo(() => {
    if (loading) return "";
    if (statusFilter === "all") return t.emptyAll;
    if (statusFilter === "under_review") {
      if (sourceFilter === "worker") return t.emptyWorker;
      if (sourceFilter === "supplier") return t.emptySupplier;
      if (sourceFilter === "customer") return t.emptyCustomer;
      return t.emptyUnderReview;
    }
    return t.emptyAll;
  }, [loading, statusFilter, sourceFilter, t]);

  const kpiCards = useMemo(() => {
    const totalV = kpi ? String(kpi.total) : loading ? "—" : "0";
    const underV = kpi ? String(kpi.underReview) : loading ? "—" : "0";
    const accV = kpi ? String(kpi.accepted) : loading ? "—" : "0";
    const rejV = kpi ? String(kpi.rejected) : loading ? "—" : "0";
    return { totalV, underV, accV, rejV };
  }, [kpi, loading]);

  const handleReview = async (status: "accepted" | "rejected", notes?: string) => {
    if (!selected || !detail) return;
    setActionLoading(true);
    try {
      const edited = isEditing && (detail.type === "new_supply" || detail.type === "insert_shipment") ? {
        items: editedItems.map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          weightKg: Number(it.weightKg),
          price: Number(it.price),
          total: Number(it.quantity) * Number(it.price) || Number(it.total),
        })),
        total: editedItems.reduce((s: number, it: any) => s + (Number(it.quantity) * Number(it.price) || 0), 0),
      } : undefined;
      // Confirmation consequence handling already done via dialog
      await rvbRequestService.review(selected.source, selected.id, status, notes, edited as any);
      setReviewDialog(null);
      // Reload list and detail
      await load();
      // Re-fetch detail to show reviewed state
      const d = await rvbRequestService.getDetail(selected.source, selected.id);
      setDetail(d);
      setIsEditing(false);
    } catch (e: any) {
      alert(e?.data?.code || e?.message || "Review failed");
    } finally { setActionLoading(false); }
  };

  const isSupervisor = user?.role === "supervisor";

  // Restrict source options for supervisor visually
  const sourceOptionsFiltered = useMemo(() => {
    const opts = [
      { value: "all", label: t.filters.sourceAll },
      { value: "worker", label: t.filters.sourceWorker },
      { value: "supplier", label: t.filters.sourceSupplier },
      { value: "customer", label: t.filters.sourceCustomer },
    ];
    if (isSupervisor) return [opts[0], opts[3]]; // only all (customer) and customer
    return opts;
  }, [t, isSupervisor]);

  const renderDetailsSummary = (r: NormalizedRequest) => {
    // Compact summary with currency respected
    const cur = (settings.currency as any) || "DA";
    if (r.type === "payment" || r.type === "loan") {
      const amt = r.amount ?? r.total;
      return amt != null ? formatCurrency(Number(amt), cur) : r.summary;
    }
    if (r.type === "new_supply" || r.type === "insert_shipment") {
      const cnt = Array.isArray(r.items) ? r.items.length : 0;
      const tot = r.total ?? r.amount;
      const totStr = tot != null ? formatCurrency(Number(tot), cur) : "";
      if (r.type === "insert_shipment" && r.items) {
        const w = r.items.reduce((s: number, it: any) => s + (Number(it.weightKg) || 0), 0);
        return `${cnt} items${w ? ` · ${w} kg` : ""}${totStr ? ` · ${totStr}` : ""}`;
      }
      return `${cnt} products${totStr ? ` · ${totStr}` : ""}`;
    }
    // discrepancy
    return (r.description || r.summary || "").slice(0, 64) + ((r.description || "").length > 64 ? "…" : "");
  };

  const canReview = detail && detail.status === "under_review" && (isSupervisor ? detail.source === "customer" : true);

  const reviewConfirmText = useMemo(() => {
    if (!detail || !reviewDialog) return "";
    if (reviewDialog.status === "rejected") return "";
    if (detail.type === "payment") return `${t.detail.confirmPayDesc} ${formatCurrency(Number(detail.amount || detail.total || 0), (settings.currency as any) || "DA")} — ${t.detail.needsRevalidation}`;
    if (detail.type === "loan") return `${t.detail.confirmLoanDesc} ${formatCurrency(Number(detail.amount || detail.total || 0), (settings.currency as any) || "DA")}. ${t.detail.loanGap}`;
    if (detail.type === "new_supply") return t.detail.confirmSupplyDesc;
    if (detail.type === "insert_shipment") return t.detail.confirmShipmentDesc;
    return t.detail.confirmDiscrepancyDesc;
  }, [detail, reviewDialog, t, settings.currency]);

  return (
    <RvbShell activePage="requests">
      <div className={styles.rvbAccountsRoot} dir={isRtl ? "rtl" : "ltr"}>
        <div className={styles.headerWrap}>
          <h1 className={styles.headerTitle}>{t.title}</h1>
          <p className={styles.headerSubtitle}>{t.subtitle}</p>
        </div>

        {/* KPI Cards */}
        <div className={styles.kpiRow}>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", color: "var(--accent)", flex: "0 0 44px" }}><Inbox size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.total}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{kpiCards.totalV}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(175,149,75,0.11)", border: "1px solid rgba(175,149,75,0.16)", color: "#8a6d1b", flex: "0 0 44px" }}><Clock size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.underReview}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{kpiCards.underV}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(58,125,82,0.10)", border: "1px solid rgba(58,125,82,0.18)", color: "#3A7D52", flex: "0 0 44px" }}><CheckCircle size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.accepted}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{kpiCards.accV}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(185,58,66,0.09)", border: "1px solid rgba(185,58,66,0.12)", color: "#C0392B", flex: "0 0 44px" }}><XCircle size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.kpi.rejected}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{kpiCards.rejV}</strong></div>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span aria-hidden="true"><Search size={18} /></span>
            <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder} />
          </div>
          <div className={styles.filterGroup}>
            <div style={{ minWidth: 150 }}>
              <StyledSelect value={statusFilter} onChange={setStatusFilter} options={[
                { value: "under_review", label: t.filters.statusUnderReview },
                { value: "all", label: t.filters.statusAll },
                { value: "accepted", label: t.filters.statusAccepted },
                { value: "rejected", label: t.filters.statusRejected },
              ]} placeholder={t.filters.statusLabel} ariaLabel={t.filters.statusLabel} />
            </div>
            <div style={{ minWidth: 150 }}>
              <StyledSelect value={sourceFilter} onChange={(v) => { setSourceFilter(v); setTypeFilter("all"); }} options={sourceOptionsFiltered} placeholder={t.filters.sourceLabel} ariaLabel={t.filters.sourceLabel} />
            </div>
            <div style={{ minWidth: 170 }}>
              <StyledSelect value={typeFilter} onChange={setTypeFilter} options={typeOptions} placeholder={t.filters.typeLabel} ariaLabel={t.filters.typeLabel} />
            </div>
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.card}>
          {loading ? (
            <div className={styles.loadingBox}><div className={styles.loadingPulse} /><strong style={{ fontSize: 13, color: "var(--muted)" }}>{t.loading}</strong></div>
          ) : requests.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true"><Inbox size={26} /></div>
              <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
              <p className={styles.emptyDesc} style={{ maxWidth: 480 }}>
                {statusFilter === "under_review" ? (sourceFilter !== "all" ? "" : t.emptyUnderReview) : ""}
              </p>
            </div>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table} role="table" aria-label={t.title}>
                  <thead className={styles.tableHead}>
                    <tr>
                      <th>{t.table.requester}</th>
                      <th>{t.table.type}</th>
                      <th>{t.table.details}</th>
                      <th>{t.table.submitted}</th>
                      <th>{t.table.status}</th>
                      <th style={{ textAlign: "center" }}>{t.table.access}</th>
                    </tr>
                  </thead>
                  <tbody className={styles.tableBody}>
                    {requests.map((r) => (
                      <tr key={`${r.source}:${r.id}`}>
                        <td>
                          <div className={styles.accountCell} style={{ gap: 10 }}>
                            <span className={styles.avatar} aria-hidden="true">{initials(r.requesterName)}</span>
                            <span className={styles.accountName} style={{ minWidth: 0 }}>
                              <strong title={r.requesterName} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.requesterName}</strong>
                              {r.tag ? (
                                <small dir="ltr" style={{ display: "block", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>@{r.tag}</small>
                              ) : (
                                <small style={{ display: "block", fontSize: 11, color: "var(--subtle)" }}>{(t.badges as any)[r.source] ?? r.source}</small>
                              )}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }} title={getTypeLabel(r.type, r.source, t)}>{getTypeLabel(r.type, r.source, t)}</span>
                            <span className={`${styles.badge} ${styles.badgeRole}`} style={{ fontSize: 10, padding: "2px 6px" }}>{(t.badges as any)[r.source] ?? r.source}</span>
                          </div>
                        </td>
                        <td>
                          <span title={renderDetailsSummary(r)} style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{renderDetailsSummary(r)}</span>
                        </td>
                        <td title={formatDate(r.submittedAt, lang)} style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatDateShort(r.submittedAt, lang)}</td>
                        <td>
                          <span className={`${styles.badge} ${r.status === "under_review" ? styles.badgeOnboardingPending : r.status === "accepted" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>
                            {(t.statuses as any)[r.status] ?? r.status}
                          </span>
                        </td>
                        <td>
                          <div className={styles.actionsCell} style={{ justifyContent: "center" }}>
                            <button type="button" className={styles.viewButton} onClick={() => setSelected({ source: r.source, id: r.id })} aria-label={`${t.view} ${r.id}`}>
                              <Eye size={14} aria-hidden="true" />{t.view}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderTop: "1px solid var(--border)", background: "var(--panel)", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{total} total · {t.pagination.page} {page}/{totalPages}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className={styles.secondaryButton} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}>{t.pagination.prev}</button>
                  <button type="button" className={styles.secondaryButton} disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ minHeight: 32, padding: "0 12px", fontSize: 12 }}>{t.pagination.next}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Review Drawer */}
      {selected && (
        <div className={styles.drawerBackdrop} onClick={() => setSelected(null)}>
          <section className={styles.drawer} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"} style={{ width: "min(720px, 100vw)", maxWidth: "100vw" }}>
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {detail ? getTypeLabel(detail.type, detail.source, t) : "Request"}
                <small style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, fontFamily: "ui-monospace" }}>{selected.id.slice(0, 12)}…</small>
                {detail && <span className={`${styles.badge} ${detail.status === "under_review" ? styles.badgeOnboardingPending : detail.status === "accepted" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>{(t.statuses as any)[detail.status] ?? detail.status}</span>}
              </h2>
              <button type="button" className={styles.closeButton} onClick={() => setSelected(null)} aria-label="Close"><X size={16} /></button>
            </div>

            <div className={styles.drawerBody}>
              {detailLoading ? (
                <div className={styles.loadingBox}><div className={styles.loadingPulse} /><strong style={{ fontSize: 13, color: "var(--muted)" }}>{t.loading}</strong></div>
              ) : !detail ? (
                <div className={styles.errorBox}>{t.error}</div>
              ) : (
                <>
                  {/* Identity & meta */}
                  <div className={styles.identityCard}>
                    <span className={styles.identityAvatar} aria-hidden="true">{initials(detail.entity?.name || detail.account?.displayName || "R")}</span>
                    <span className={styles.identityInfo}>
                      <strong>{detail.entity?.name || detail.account?.displayName || detail.entityId.slice(0, 8)}</strong>
                      <small dir="ltr" style={{ color: "var(--muted)", fontSize: 12 }}>@{detail.account?.tag || "no-tag"} · {(t.badges as any)[detail.source] ?? detail.source}</small>
                      <span style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        <span className={`${styles.badge} ${styles.badgeRole}`}>{getTypeLabel(detail.type, detail.source, t)}</span>
                        <span className={`${styles.badge} ${detail.status === "under_review" ? styles.badgeOnboardingPending : detail.status === "accepted" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>{(t.statuses as any)[detail.status]}</span>
                      </span>
                    </span>
                  </div>

                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>{t.detail.requestId}</h3>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.requestId}</span><span className={styles.detailValue} dir="ltr" style={{ fontFamily: "ui-monospace", fontSize: 12 }}>{detail.id}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.requester}</span><span className={styles.detailValue}>{detail.entity?.name || detail.entityId}</span></div>
                      {detail.account && <div className={styles.detailRow}><span className={styles.detailLabel}>@tag</span><span className={styles.detailValue} dir="ltr">@{detail.account.tag}</span></div>}
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.submitted}</span><span className={styles.detailValue} title={String(detail.submittedAt)}>{formatDate(detail.submittedAt, lang)}</span></div>
                      <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.status}</span><span className={`${styles.badge} ${detail.status === "under_review" ? styles.badgeOnboardingPending : detail.status === "accepted" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>{(t.statuses as any)[detail.status]}</span></div>
                      {detail.status !== "under_review" && (
                        <>
                          <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.reviewedBy}</span><span className={styles.detailValue} dir="ltr">{detail.reviewer?.tag ? `@${detail.reviewer.tag}` : detail.reviewedBy ? detail.reviewedBy.slice(0, 8) : "—"}</span></div>
                          <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.reviewedAt}</span><span className={styles.detailValue}>{formatDate(detail.reviewedAt, lang)}</span></div>
                          {detail.notes && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.response}</span><span className={styles.detailValueWrap}>{detail.notes}</span></div>}
                          {(detail.purchaseId || detail.paymentId || detail.saleId) && (
                            <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.processedRef}</span><span className={styles.detailValue} dir="ltr" style={{ fontFamily: "ui-monospace", fontSize: 11 }}>{detail.purchaseId || detail.paymentId || detail.saleId}</span></div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Type-specific content */}
                  {detail.source === "worker" && detail.type === "payment" && (
                    <div className={styles.detailSection}>
                      <h3 className={styles.detailSectionTitle}>{t.types.payment}</h3>
                      <div className={styles.detailGrid}>
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.requestedAmount}</span><span className={styles.detailValue} style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(Number(detail.amount || 0), (settings.currency as any) || "DA")}</span></div>
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.currentCredit}</span><span className={styles.detailValue} style={{ fontWeight: 800, color: Number(detail.entity?.balance) > 0 ? "#3A7D52" : "var(--muted)" }}>{formatCurrency(Number(detail.entity?.balance || 0), (settings.currency as any) || "DA")}</span></div>
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.date}</span><span className={styles.detailValue}>{formatDate(detail.raw?.submittedAt || detail.submittedAt, lang)}</span></div>
                        {detail.description && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.reason}</span><span className={styles.detailValueWrap}>{detail.description}</span></div>}
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.status}</span><span className={`${styles.badge} ${detail.status === "under_review" ? styles.badgeOnboardingPending : detail.status === "accepted" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>{(t.statuses as any)[detail.status]}</span></div>
                        {detail.status === "under_review" && <div style={{ padding: 10, border: "1px solid rgba(175,149,75,0.16)", background: "rgba(175,149,75,0.08)", borderRadius: 8, fontSize: 11, color: "#8a6d1b" }}>{t.detail.needsRevalidation}</div>}
                      </div>
                    </div>
                  )}

                  {detail.source === "worker" && detail.type === "loan" && (
                    <div className={styles.detailSection}>
                      <h3 className={styles.detailSectionTitle}>{t.types.loan}</h3>
                      <div className={styles.detailGrid}>
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.requestedAmount}</span><span className={styles.detailValue}>{formatCurrency(Number(detail.amount || 0), (settings.currency as any) || "DA")}</span></div>
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.currentCredit}</span><span className={styles.detailValue}>{formatCurrency(Number(detail.entity?.balance || 0), (settings.currency as any) || "DA")}</span></div>
                        {detail.description && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.reason}</span><span className={styles.detailValueWrap}>{detail.description}</span></div>}
                        <div style={{ padding: 10, border: "1px solid var(--border)", background: "var(--panel-hover)", borderRadius: 8, fontSize: 11, color: "var(--muted)" }}>{t.detail.loanGap}</div>
                      </div>
                    </div>
                  )}

                  {detail.type === "discrepancy" && (
                    <div className={styles.detailSection}>
                      <h3 className={styles.detailSectionTitle}>{t.types.discrepancy}</h3>
                      <div className={styles.detailGrid}>
                        {detail.description && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.reason}</span><span className={styles.detailValueWrap}>{detail.description}</span></div>}
                        {detail.raw?.relatedId && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.related}</span><span className={styles.detailValue}>{detail.raw.relatedId}</span></div>}
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.submitted}</span><span className={styles.detailValue}>{formatDate(detail.submittedAt, lang)}</span></div>
                      </div>
                      {detail.status === "under_review" && <div style={{ padding: 10, border: "1px solid var(--border)", background: "var(--panel-hover)", borderRadius: 8, fontSize: 11, color: "var(--muted)" }}>{t.detail.confirmDiscrepancyDesc}</div>}
                    </div>
                  )}

                  {detail.source === "supplier" && detail.type === "new_supply" && (
                    <div className={styles.detailSection}>
                      <h3 className={styles.detailSectionTitle}>{t.filters.typeNewSupply} — {detail.entity?.name}</h3>
                      <div className={styles.detailGrid}>
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.supplyDate}</span><span className={styles.detailValue}>{formatDate(detail.date, lang)}</span></div>
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.total}</span><span className={styles.detailValue}>{formatCurrency(Number(detail.total || 0), (settings.currency as any) || "DA")}</span></div>
                        {detail.notes && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.response}</span><span className={styles.detailValueWrap}>{detail.notes}</span></div>}
                        {detail.originalItems && <div style={{ padding: 8, border: "1px dashed var(--border)", borderRadius: 8, fontSize: 11, color: "var(--muted)" }}>{t.detail.original}: {(detail.originalItems as any[]).length} items preserved</div>}
                      </div>

                      <h4 style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{t.detail.products}</h4>
                      {!isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {(detail.items || []).length === 0 ? (
                            <div style={{ padding: 12, border: "1px dashed var(--border)", borderRadius: 8, textAlign: "center", fontSize: 12, color: "var(--muted)" }}>{t.detail.noProducts}</div>
                          ) : (
                            (detail.items || []).map((it: any, idx: number) => (
                              <div key={idx} className={styles.detailRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                  <strong style={{ fontSize: 12 }}>{it.product?.name || it.productId.slice(0, 8)}</strong>
                                  <span style={{ fontSize: 12, fontWeight: 700 }}>{formatCurrency(Number(it.total || 0), (settings.currency as any) || "DA")}</span>
                                </div>
                                <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--muted)", flexWrap: "wrap" }}>
                                  <span>{t.detail.quantity}: {it.quantity}</span>
                                  <span>{t.detail.weight}: {it.weightKg} kg</span>
                                  <span>{t.detail.price}: {formatCurrency(Number(it.price || 0), (settings.currency as any) || "DA")}</span>
                                </div>
                              </div>
                            ))
                          )}
                          {detail.calculation && (
                            <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.calculation}</span><span className={styles.detailValueWrap} style={{ fontSize: 11 }}>{JSON.stringify(detail.calculation).slice(0, 160)}</span></div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10, border: "1px solid var(--accent-ring)", borderRadius: 10, background: "var(--accent-soft)" }}>
                          <small style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>{t.detail.edited}</small>
                          {editedItems.map((it: any, idx: number) => (
                            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, alignItems: "end", padding: 8, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)" }}>
                              <div className={styles.field} style={{ margin: 0 }}>
                                <label style={{ fontSize: 11 }}>{t.detail.quantity}</label>
                                <input type="number" min="0" value={it.quantity} onChange={(e) => setEditedItems((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: Number(e.target.value), total: Number(e.target.value) * Number(p.price) } : p))} style={{ minHeight: 32, padding: "6px 8px" }} />
                                <small style={{ fontSize: 10, color: "var(--muted)" }}>{it.product?.name || it.productId.slice(0, 6)}</small>
                              </div>
                              <div className={styles.field} style={{ margin: 0 }}>
                                <label style={{ fontSize: 11 }}>{t.detail.weight} (kg)</label>
                                <input type="number" min="0" step="0.01" value={it.weightKg} onChange={(e) => setEditedItems((prev) => prev.map((p, i) => i === idx ? { ...p, weightKg: Number(e.target.value) } : p))} style={{ minHeight: 32, padding: "6px 8px" }} />
                              </div>
                              <div className={styles.field} style={{ margin: 0 }}>
                                <label style={{ fontSize: 11 }}>{t.detail.price}</label>
                                <input type="number" min="0" step="0.01" value={it.price} onChange={(e) => setEditedItems((prev) => prev.map((p, i) => i === idx ? { ...p, price: Number(e.target.value), total: Number(p.quantity) * Number(e.target.value) } : p))} style={{ minHeight: 32, padding: "6px 8px" }} />
                                <small style={{ fontSize: 10 }}>{formatCurrency(Number(it.quantity || 0) * Number(it.price || 0), (settings.currency as any) || "DA")}</small>
                              </div>
                            </div>
                          ))}
                          <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.total} (edited)</span><span className={styles.detailValue}>{formatCurrency(editedItems.reduce((s: number, it: any) => s + (Number(it.quantity) * Number(it.price) || 0), 0), (settings.currency as any) || "DA")}</span></div>
                        </div>
                      )}
                    </div>
                  )}

                  {detail.source === "customer" && detail.type === "insert_shipment" && (
                    <div className={styles.detailSection}>
                      <h3 className={styles.detailSectionTitle}>{t.filters.typeInsertShipment} — {detail.entity?.name}</h3>
                      <div className={styles.detailGrid}>
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.date}</span><span className={styles.detailValue}>{formatDate(detail.date, lang)}</span></div>
                        <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.total}</span><span className={styles.detailValue}>{formatCurrency(Number(detail.total || 0), (settings.currency as any) || "DA")}</span></div>
                        {detail.description && <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.reason}</span><span className={styles.detailValueWrap}>{detail.description}</span></div>}
                        {detail.originalItems && <div style={{ padding: 8, border: "1px dashed var(--border)", borderRadius: 8, fontSize: 11, color: "var(--muted)" }}>{t.detail.original}: {(detail.originalItems as any[]).length} items</div>}
                        <div style={{ fontSize: 11, color: "var(--muted)", padding: "6px 0" }}>{t.detail.insufficientStock}</div>
                      </div>
                      <h4 style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{t.detail.products}</h4>
                      {!isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {(detail.items || []).length === 0 ? (
                            <div style={{ padding: 12, border: "1px dashed var(--border)", borderRadius: 8, textAlign: "center", fontSize: 12, color: "var(--muted)" }}>{t.detail.noProducts}</div>
                          ) : (
                            (detail.items || []).map((it: any, idx: number) => (
                              <div key={idx} className={styles.detailRow} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                  <strong style={{ fontSize: 12 }}>{it.product?.name || it.productId.slice(0, 8)}</strong>
                                  <span style={{ fontSize: 12, fontWeight: 700 }}>{formatCurrency(Number(it.total || 0), (settings.currency as any) || "DA")}</span>
                                </div>
                                <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--muted)", flexWrap: "wrap" }}>
                                  <span>{t.detail.quantity}: {it.quantity}</span>
                                  <span>{t.detail.weight}: {it.weightKg} kg</span>
                                  <span>{t.detail.price}: {formatCurrency(Number(it.price || 0), (settings.currency as any) || "DA")}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10, border: "1px solid var(--accent-ring)", borderRadius: 10, background: "var(--accent-soft)" }}>
                          <small style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>{t.detail.edited}</small>
                          {editedItems.map((it: any, idx: number) => (
                            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, alignItems: "end", padding: 8, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)" }}>
                              <div className={styles.field} style={{ margin: 0 }}>
                                <label style={{ fontSize: 11 }}>{t.detail.quantity}</label>
                                <input type="number" min="0" value={it.quantity} onChange={(e) => setEditedItems((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: Number(e.target.value), total: Number(e.target.value) * Number(p.price) } : p))} style={{ minHeight: 32, padding: "6px 8px" }} />
                                <small style={{ fontSize: 10 }}>{it.product?.name || it.productId.slice(0, 6)}</small>
                              </div>
                              <div className={styles.field} style={{ margin: 0 }}>
                                <label style={{ fontSize: 11 }}>{t.detail.weight} (kg)</label>
                                <input type="number" min="0" step="0.01" value={it.weightKg} onChange={(e) => setEditedItems((prev) => prev.map((p, i) => i === idx ? { ...p, weightKg: Number(e.target.value) } : p))} style={{ minHeight: 32, padding: "6px 8px" }} />
                              </div>
                              <div className={styles.field} style={{ margin: 0 }}>
                                <label style={{ fontSize: 11 }}>{t.detail.price}</label>
                                <input type="number" min="0" step="0.01" value={it.price} onChange={(e) => setEditedItems((prev) => prev.map((p, i) => i === idx ? { ...p, price: Number(e.target.value), total: Number(p.quantity) * Number(e.target.value) } : p))} style={{ minHeight: 32, padding: "6px 8px" }} />
                                <small style={{ fontSize: 10 }}>{formatCurrency(Number(it.quantity || 0) * Number(it.price || 0), (settings.currency as any) || "DA")}</small>
                              </div>
                            </div>
                          ))}
                          <div className={styles.detailRow}><span className={styles.detailLabel}>{t.detail.total} (edited)</span><span className={styles.detailValue}>{formatCurrency(editedItems.reduce((s: number, it: any) => s + (Number(it.quantity) * Number(it.price) || 0), 0), (settings.currency as any) || "DA")}</span></div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action bar */}
                  {canReview ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                      {!isEditing && (detail.type === "new_supply" || detail.type === "insert_shipment") && (
                        <button type="button" className={styles.secondaryButton} onClick={() => setIsEditing(true)} style={{ flex: "1 1 160px" }}>{t.detail.editThenAccept}</button>
                      )}
                      {isEditing && (
                        <button type="button" className={styles.primaryButton} onClick={() => setReviewDialog({ status: "accepted", notes: "" })} disabled={actionLoading} style={{ flex: "1 1 160px", background: "#3A7D52", borderColor: "#3A7D52" }}>{t.detail.confirmEditAccept}</button>
                      )}
                      {!isEditing && (
                        <>
                          <button type="button" className={styles.primaryButton} onClick={() => setReviewDialog({ status: "accepted", notes: "" })} disabled={actionLoading} style={{ flex: "1 1 120px", background: "#3A7D52", borderColor: "#3A7D52" }}>{t.detail.accept}</button>
                          <button type="button" className={styles.secondaryButton} onClick={() => setReviewDialog({ status: "rejected", notes: "" })} disabled={actionLoading} style={{ flex: "1 1 120px" }}>{t.detail.reject}</button>
                        </>
                      )}
                      {isEditing && (
                        <button type="button" className={styles.secondaryButton} onClick={() => setIsEditing(false)} disabled={actionLoading} style={{ flex: "1 1 120px" }}>{t.detail.cancel}</button>
                      )}
                    </div>
                  ) : detail.status !== "under_review" ? (
                    <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-hover)", textAlign: "center", fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                      {t.detail.reviewedBy}: {detail.reviewer?.tag ? `@${detail.reviewer.tag}` : detail.reviewedBy?.slice(0, 8)} · {formatDate(detail.reviewedAt, lang)}
                    </div>
                  ) : isSupervisor && detail.source !== "customer" ? (
                    <div style={{ padding: 12, border: "1px solid var(--danger-border)", background: "var(--danger-soft)", borderRadius: 10, color: "var(--danger)", fontSize: 12, textAlign: "center" }}>403 — Not authorized for this source</div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Review confirm dialog */}
      {reviewDialog && detail && (
        <div className={styles.backdrop} onClick={() => !actionLoading && setReviewDialog(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"} style={{ maxWidth: 480 }}>
            <div className={styles.modalHeader}>
              <h2 style={{ fontSize: 15, fontWeight: 800 }}>
                {reviewDialog.status === "accepted"
                  ? detail.type === "payment" ? t.detail.confirmPayTitle : detail.type === "loan" ? t.detail.confirmLoanTitle : detail.type === "new_supply" ? t.detail.confirmSupplyTitle : detail.type === "insert_shipment" ? t.detail.confirmShipmentTitle : t.detail.confirmDiscrepancyTitle
                  : t.detail.reject}
              </h2>
              <button type="button" className={styles.closeButton} onClick={() => setReviewDialog(null)} disabled={actionLoading}><X size={16} /></button>
            </div>
            <div className={styles.formBody}>
              {reviewDialog.status === "accepted" && reviewConfirmText && (
                <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-hover)", fontSize: 12, lineHeight: 1.5, color: "var(--text)" }}>
                  {reviewConfirmText} {t.detail.continue}
                </div>
              )}
              {reviewDialog.status === "rejected" && (
                <div style={{ padding: 12, border: "1px solid var(--danger-border)", background: "var(--danger-soft)", borderRadius: 10, fontSize: 12, color: "var(--danger)" }}>
                  Reject — optional management note will be visible to requester.
                </div>
              )}
              <div className={styles.field}>
                <label>{t.detail.response} <small style={{ color: "var(--muted)", fontWeight: 500 }}>(optional)</small></label>
                <textarea value={reviewDialog.notes} onChange={(e) => setReviewDialog({ ...reviewDialog, notes: e.target.value })} placeholder={t.detail.notesPlaceholder} rows={3} style={{ width: "100%", padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)", color: "var(--text)", fontFamily: "inherit", fontSize: 13 }} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setReviewDialog(null)} disabled={actionLoading}>{t.detail.cancel}</button>
              <button type="button" className={styles.primaryButton} onClick={() => handleReview(reviewDialog.status, reviewDialog.notes)} disabled={actionLoading} style={reviewDialog.status === "accepted" ? { background: "#3A7D52", borderColor: "#3A7D52" } : {}}>
                {actionLoading ? "..." : reviewDialog.status === "accepted" ? t.detail.confirm : t.detail.reject}
              </button>
            </div>
          </section>
        </div>
      )}
    </RvbShell>
  );
}

export default function RvbRequestsPage() {
  return (
    <RvbAuthGuard>
      <RvbRequestsGuard>
        <RequestsInner />
      </RvbRequestsGuard>
    </RvbAuthGuard>
  );
}

