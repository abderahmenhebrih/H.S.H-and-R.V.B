"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import {
  AlertTriangle,
  ChevronDown,
  Layers,
  Pencil,
  Plus,
  Receipt,
  Search,
  Snowflake,
  Tags,
  Trash2,
  Truck,
  X,
} from "lucide-react";

import AppShell from "../../src/components/layout/AppShell";
import StyledSelect from "../../src/components/common/StyledSelect";
import { vehicleService } from "../../src/services/vehicle.service";
import { vehicleEditOperation } from "../../src/services/operations/vehicle-edit.operation";
import { vehicleDeleteOperation } from "../../src/services/operations/vehicle-delete.operation";
import { expenseService } from "../../src/services/expense.service";
import { settingsService } from "../../src/services/settings.service";
import { DEFAULT_SETTINGS, formatCurrency, SETTINGS_EVENT } from "../../src/lib/settings";
import type { Vehicle } from "../../src/types/entities/vehicle";
import type { Currency, Language } from "../../src/types/settings/settings";
import type { Expense } from "../../src/types/entities/expense";
import styles from "./page.module.css";

type FormState = {
  name: string;
  registrationNumber: string;
  image: string;
  imageName: string;
  type: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  registrationNumber: "",
  image: "",
  imageName: "",
  type: "",
  notes: "",
};

const TRANSLATIONS = {
  en: {
    title: "Vehicles",
    subtitle: "Manage vehicles, types, registrations and operational transport information.",
    search: "Search vehicles...",
    searchPlaceholder: "Search vehicles by name, registration, type...",
    vehicle: "Vehicle",
    vehicles: "vehicles",
    vehicleSingular: "vehicle",
    plate: "Plate",
    type: "Type",
    actions: "Actions",
    allTypes: "All Types",
    addVehicle: "Add Vehicle",
    edit: "Edit",
    delete: "Delete",
    loading: "Loading vehicles...",
    noVehicles: "No vehicles yet",
    noVehiclesFound: "No vehicles found",
    addFirst: "Add your first vehicle to begin.",
    tryAnother: "Try another search term.",
    newVehicle: "NEW VEHICLE",
    editVehicle: "EDIT VEHICLE",
    addVehicleTitle: "Add Vehicle",
    editVehicleTitle: "Edit Vehicle",
    name: "Vehicle Name",
    registrationNumber: "License Plate",
    image: "Image",
    changeImage: "Change image",
    removeImage: "Remove",
    selectImage: "Click to select image",
    imageHint: "PNG, JPG, WEBP",
    imageInvalidType: "Only PNG, JPG and WEBP images are allowed.",
    imageTooLarge: "Image is too large.",
    notes: "Notes",
    required: "Required",
    optional: "Optional",
    saving: "Saving...",
    create: "Create Vehicle",
    save: "Save Changes",
    cancel: "Cancel",
    deleteVehicle: "Delete Vehicle",
    deleteQuestion: "Are you sure you want to delete this vehicle?",
    deleteWarning: "Protected deletion. Vehicle history and expenses will remain but vehicle will be removed.",
    confirmDelete: "Delete",
    deleting: "Deleting...",
    deleteAvailable: "Confirm available in",
    selectType: "Select type",
    noTypes: "No vehicle types configured in Settings.",
    failedLoad: "Failed to load vehicles.",
    failedSave: "Failed to save vehicle.",
    totalVehicles: "Total Vehicles",
    totalVehiclesSub: "Registered vehicles",
    vehicleExpenses: "Vehicle Expenses",
    vehicleExpensesSub: "This month",
    vehicleTypes: "Vehicle Types",
    vehicleTypesSub: "Defined types",
    typesInUse: "Types in Use",
    typesInUseSub: "Active categories",
  },
  fr: {
    title: "Véhicules",
    subtitle: "Gérer les véhicules, les types, les immatriculations et les informations de transport opérationnel.",
    search: "Rechercher des véhicules...",
    searchPlaceholder: "Rechercher par nom, plaque, type...",
    vehicle: "Véhicule",
    vehicles: "véhicules",
    vehicleSingular: "véhicule",
    plate: "Plaque",
    type: "Type",
    actions: "Actions",
    allTypes: "Tous les types",
    addVehicle: "Ajouter un véhicule",
    edit: "Modifier",
    delete: "Supprimer",
    loading: "Chargement des véhicules...",
    noVehicles: "Aucun véhicule pour le moment",
    noVehiclesFound: "Aucun véhicule trouvé",
    addFirst: "Ajoutez votre premier véhicule pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    newVehicle: "NOUVEAU VÉHICULE",
    editVehicle: "MODIFIER LE VÉHICULE",
    addVehicleTitle: "Ajouter un véhicule",
    editVehicleTitle: "Modifier le véhicule",
    name: "Nom du véhicule",
    registrationNumber: "Plaque d'immatriculation",
    image: "Image",
    changeImage: "Changer l'image",
    removeImage: "Supprimer",
    selectImage: "Cliquez pour sélectionner une image",
    imageHint: "PNG, JPG, WEBP",
    imageInvalidType: "Seuls les images PNG, JPG et WEBP sont autorisées.",
    imageTooLarge: "L'image est trop volumineuse.",
    notes: "Notes",
    required: "Obligatoire",
    optional: "Facultatif",
    saving: "Enregistrement...",
    create: "Créer le véhicule",
    save: "Enregistrer",
    cancel: "Annuler",
    deleteVehicle: "Supprimer le véhicule",
    deleteQuestion: "Voulez-vous vraiment supprimer ce véhicule ?",
    deleteWarning: "Suppression protégée. L'historique restera mais le véhicule sera supprimé.",
    confirmDelete: "Supprimer",
    deleting: "Suppression...",
    deleteAvailable: "Confirmation disponible dans",
    selectType: "Sélectionner le type",
    noTypes: "Aucun type de véhicule configuré dans les paramètres.",
    failedLoad: "Échec du chargement des véhicules.",
    failedSave: "Échec de l'enregistrement du véhicule.",
    totalVehicles: "Total Véhicules",
    totalVehiclesSub: "Véhicules enregistrés",
    vehicleExpenses: "Dépenses Véhicules",
    vehicleExpensesSub: "Ce mois-ci",
    vehicleTypes: "Types de Véhicules",
    vehicleTypesSub: "Types définis",
    typesInUse: "Types Utilisés",
    typesInUseSub: "Catégories actives",
  },
  ar: {
    title: "المركبات",
    subtitle: "إدارة المركبات والأنواع والترقيم ومعلومات النقل والتشغيل.",
    search: "البحث عن المركبات...",
    searchPlaceholder: "البحث بالاسم أو اللوحة أو النوع...",
    vehicle: "المركبة",
    vehicles: "مركبات",
    vehicleSingular: "مركبة",
    plate: "اللوحة",
    type: "النوع",
    actions: "الإجراءات",
    allTypes: "جميع الأنواع",
    addVehicle: "إضافة مركبة",
    edit: "تعديل",
    delete: "حذف",
    loading: "جارٍ تحميل المركبات...",
    noVehicles: "لا توجد مركبات بعد",
    noVehiclesFound: "لم يتم العثور على مركبات",
    addFirst: "أضف أول مركبة للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    newVehicle: "مركبة جديدة",
    editVehicle: "تعديل المركبة",
    addVehicleTitle: "إضافة مركبة",
    editVehicleTitle: "تعديل المركبة",
    name: "اسم المركبة",
    registrationNumber: "رقم اللوحة",
    image: "الصورة",
    changeImage: "تغيير الصورة",
    removeImage: "إزالة",
    selectImage: "انقر لاختيار صورة",
    imageHint: "PNG, JPG, WEBP",
    imageInvalidType: "يسمح فقط بصور PNG و JPG و WEBP.",
    imageTooLarge: "الصورة كبيرة جداً.",
    notes: "ملاحظات",
    required: "مطلوب",
    optional: "اختياري",
    saving: "جارٍ الحفظ...",
    create: "إنشاء المركبة",
    save: "حفظ التغييرات",
    cancel: "إلغاء",
    deleteVehicle: "حذف المركبة",
    deleteQuestion: "هل أنت متأكد من رغبتك في حذف هذه المركبة؟",
    deleteWarning: "حذف محمي. سيبقى السجل لكن ستتم إزالة المركبة.",
    confirmDelete: "حذف",
    deleting: "جارٍ الحذف...",
    deleteAvailable: "يمكن التأكيد بعد",
    selectType: "اختر النوع",
    noTypes: "لا توجد أنواع مركبات مهيأة في الإعدادات.",
    failedLoad: "فشل تحميل المركبات.",
    failedSave: "فشل حفظ المركبة.",
    totalVehicles: "إجمالي المركبات",
    totalVehiclesSub: "مركبات مسجلة",
    vehicleExpenses: "مصاريف المركبات",
    vehicleExpensesSub: "هذا الشهر",
    vehicleTypes: "أنواع المركبات",
    vehicleTypesSub: "أنواع محددة",
    typesInUse: "الأنواع المستخدمة",
    typesInUseSub: "فئات نشطة",
  },
} as const;

function TypeFilter({
  value,
  onChange,
  types,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  types: string[];
  t: { allTypes: string };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const label = value || t.allTypes;

  return (
    <div className={styles.filterDropdown} ref={ref}>
      <button
        type="button"
        className={`${styles.filterTrigger} ${open ? styles.filterTriggerOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <span className={`${styles.filterChevron} ${open ? styles.filterChevronOpen : ""}`} aria-hidden="true">
          <ChevronDown size={14} strokeWidth={2} />
        </span>
      </button>
      {open && (
        <div className={styles.filterMenu} role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`${styles.filterOption} ${!value ? styles.filterOptionActive : ""}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {t.allTypes}
          </button>
          {types.map((type) => (
            <button
              key={type}
              type="button"
              role="option"
              aria-selected={value === type}
              className={`${styles.filterOption} ${value === type ? styles.filterOptionActive : ""}`}
              onClick={() => {
                onChange(type);
                setOpen(false);
              }}
            >
              {type}
            </button>
          ))}
          {types.length === 0 && (
            <span style={{ padding: "8px 12px", color: "var(--muted)", fontSize: "12px" }}>{t.allTypes}</span>
          )}
        </div>
      )}
    </div>
  );
}

function isRefrigerated(type: string) {
  const t = (type ?? "").toLowerCase();
  return (
    t.includes("refriger") ||
    t.includes("freez") ||
    t.includes("froid") ||
    t.includes("congél") ||
    t.includes("congel") ||
    t.includes("cold") ||
    t.includes("frigo") ||
    t.includes("ثلاج") ||
    t.includes("تبريد")
  );
}

function getMonthBounds(date: Date): { start: number; end: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0).getTime();
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  return { start, end };
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState(3.5);
  const [deleting, setDeleting] = useState(false);
  const deleteStartRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const t = TRANSLATIONS[language];

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    const allowedExt = [".png", ".jpg", ".jpeg", ".webp"];
    if (!allowedTypes.includes(file.type) && !allowedExt.includes(ext)) {
      setImageError(t.imageInvalidType);
      e.target.value = "";
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setImageError(t.imageTooLarge);
      e.target.value = "";
      return;
    }
    setImageError("");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setForm((c) => ({ ...c, image: result, imageName: file.name }));
    };
    reader.onerror = () => {
      setImageError(t.failedSave);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function loadSettings() {
    const s = await settingsService.get();
    setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
    setCurrency(s?.currency ?? DEFAULT_SETTINGS.currency);
    setVehicleTypes(s?.vehicleTypes ?? []);
  }

  async function loadVehicles() {
    setLoading(true);
    try {
      setVehicles(await vehicleService.getAll());
    } catch {
      setError(t.failedLoad);
    } finally {
      setLoading(false);
    }
  }

  async function loadExpenses() {
    try {
      setExpenses(await expenseService.getAll());
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadVehicles();
    void loadExpenses();
    const h = () => void loadSettings();
    window.addEventListener(SETTINGS_EVENT, h);
    const onFocus = () => void loadExpenses();
    window.addEventListener("focus", onFocus);
    window.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, h);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  useDbSync(() => {
    void loadVehicles();
    void loadExpenses();
  }, []);

  useEffect(() => {
    if (!deleteTarget) {
      deleteStartRef.current = null;
      return;
    }
    deleteStartRef.current = Date.now();
    setDeleteCountdown(3.5);
    const interval = window.setInterval(() => {
      if (deleteStartRef.current === null) return;
      const elapsed = Date.now() - deleteStartRef.current;
      const remaining = Math.max(0, 3.5 - elapsed / 1000);
      const display = Math.ceil(remaining * 10) / 10;
      setDeleteCountdown(display > 0 ? display : 0);
      if (remaining <= 0) window.clearInterval(interval);
    }, 50);
    return () => window.clearInterval(interval);
  }, [deleteTarget]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = vehicles;
    if (typeFilter) {
      result = result.filter((v) => v.type === typeFilter);
    }
    if (!q) return result;
    return vehicles.filter((v) => [v.name, v.registrationNumber, v.type, v.notes].some((val) => String(val ?? "").toLowerCase().includes(q)));
  }, [vehicles, search, typeFilter]);

  const totalVehicles = vehicles.length;
  const vehicleTypesCount = vehicleTypes.length;
  const typesInUse = useMemo(() => new Set(vehicles.map((v) => v.type).filter(Boolean)).size, [vehicles]);
  const { start: monthStart, end: monthEnd } = useMemo(() => getMonthBounds(new Date()), []);
  const vehicleExpensesThisMonth = useMemo(() => {
    return expenses
      .filter((e) => e.note?.startsWith("vehicle:") && e.date >= monthStart && e.date <= monthEnd)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses, monthStart, monthEnd]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, type: vehicleTypes[0] ?? "" });
    setError("");
    setImageError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowForm(true);
  }

  function openEdit(v: Vehicle) {
    setEditingId(v.id);
    setForm({
      name: v.name,
      registrationNumber: v.registrationNumber,
      image: v.image ?? "",
      imageName: (v as Vehicle & { imageName?: string }).imageName ?? "",
      type: v.type,
      notes: v.notes ?? "",
    });
    setError("");
    setImageError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setImageError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function saveVehicle() {
    if (!form.name.trim() || !form.registrationNumber.trim()) {
      setError(t.failedSave);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const normalizedPlate = form.registrationNumber.trim().toUpperCase();
      const normalizedImage = form.image.trim() || undefined;
      const normalizedImageName = normalizedImage ? form.imageName.trim() || undefined : undefined;
      if (editingId) {
        await vehicleEditOperation.edit({
          vehicleId: editingId,
          name: form.name.trim(),
          registrationNumber: normalizedPlate,
          image: normalizedImage,
          imageName: normalizedImageName,
          type: form.type.trim(),
          notes: form.notes.trim() || undefined,
        });
      } else {
        await vehicleService.create({
          name: form.name.trim(),
          registrationNumber: normalizedPlate,
          image: normalizedImage,
          imageName: normalizedImageName,
          type: form.type.trim(),
          notes: form.notes.trim() || undefined,
        });
      }
      await loadVehicles();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) return;
    } else if (deleteCountdown > 0) return;
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await vehicleDeleteOperation.delete(deleteTarget.id);
      setVehicles((c) => c.filter((v) => v.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteCountdown(3.5);
      deleteStartRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failedSave);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell activePage="vehicles" showHeader={false}>
      <main className={styles.vehiclesPage}>
        <div className={styles.vehiclesShell}>
          {/* Unified Vehicles header — brand / search / type filter / add */}
          <section className={styles.vehiclesHeader}>
            <div className={styles.vehiclesHeaderBrand}>
              <div className={styles.vehiclesLogo}>
                <img src="/chicken.jpg" alt="" />
              </div>
              <div className={styles.vehiclesTitle}>
                <h1>{t.title}</h1>
                <p>{t.subtitle}</p>
              </div>
            </div>

            <div className={styles.searchBox}>
              <span aria-hidden="true">
                <Search size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.search}
              />
            </div>

            <TypeFilter value={typeFilter} onChange={setTypeFilter} types={vehicleTypes} t={{ allTypes: t.allTypes }} />

            <button type="button" className={styles.primaryButton} onClick={openCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addVehicle}
            </button>
          </section>

          {/* Summary Cards */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconVehicles}`} style={{ position: "relative" }}>
                <Truck size={20} strokeWidth={2} aria-hidden="true" />
                <span
                  style={{
                    position: "absolute",
                    bottom: 2,
                    right: 2,
                    background: "var(--panel)",
                    borderRadius: "50%",
                    width: 12,
                    height: 12,
                    display: "grid",
                    placeItems: "center",
                    border: "1px solid var(--border)",
                    lineHeight: 0,
                  }}
                  aria-hidden="true"
                >
                  <Snowflake size={8} strokeWidth={2.5} />
                </span>
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalVehicles}</span>
                <strong className={styles.summaryValue}>{totalVehicles}</strong>
                <small className={styles.summarySub}>{t.totalVehiclesSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconActive}`}>
                <Receipt size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.vehicleExpenses}</span>
                <strong className={styles.summaryValue}>{formatCurrency(vehicleExpensesThisMonth, currency)}</strong>
                <small className={styles.summarySub}>{t.vehicleExpensesSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconTypes}`}>
                <Tags size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.vehicleTypes}</span>
                <strong className={styles.summaryValue}>{vehicleTypesCount}</strong>
                <small className={styles.summarySub}>{t.vehicleTypesSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconInUse}`}>
                <Layers size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.typesInUse}</span>
                <strong className={styles.summaryValue}>{typesInUse}</strong>
                <small className={styles.summarySub}>{t.typesInUseSub}</small>
              </div>
            </div>
          </section>

          {error && !showForm && !deleteTarget && <div className={styles.errorBanner}>{error}</div>}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.vehicle}</span>
              <span>{t.type}</span>
              <span>{t.plate}</span>
              <span>{t.actions}</span>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loadingPulse} />
                <strong>{t.loading}</strong>
              </div>
            ) : filtered.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true" style={{ position: "relative", width: 56, height: 56 }}>
                  <Truck size={32} strokeWidth={2} />
                  <span
                    style={{
                      position: "absolute",
                      bottom: 4,
                      right: 4,
                      background: "var(--panel)",
                      borderRadius: "50%",
                      width: 16,
                      height: 16,
                      display: "grid",
                      placeItems: "center",
                      border: "1px solid var(--border)",
                      lineHeight: 0,
                    }}
                    aria-hidden="true"
                  >
                    <Snowflake size={10} strokeWidth={2.5} />
                  </span>
                </div>
                <strong>{vehicles.length === 0 ? t.noVehicles : t.noVehiclesFound}</strong>
                <p>{vehicles.length === 0 ? t.addFirst : t.tryAnother}</p>
                {vehicles.length === 0 && (
                  <button type="button" className={styles.primaryButton} onClick={openCreate}>
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addVehicle}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.vehicleRows}>
                {filtered.map((v) => (
                  <article key={v.id} className={styles.vehicleRow} onDoubleClick={() => openEdit(v)}>
                    <span className={styles.vehicleIdentity}>
                      <span className={styles.avatar} aria-hidden="true">
                        {v.image ? (
                          <img src={v.image} alt={v.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
                        ) : (
                          <Truck size={18} strokeWidth={2} />
                        )}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <strong>{v.name}</strong>
                        <small>{v.notes || v.type || "—"}</small>
                      </span>
                    </span>
                    <span className={styles.typeText} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {v.type || "—"}
                      {isRefrigerated(v.type) && <Snowflake size={12} strokeWidth={2} aria-hidden="true" style={{ color: "var(--info)" }} />}
                    </span>
                    <span className={styles.plateText}>{v.registrationNumber}</span>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.rowEditButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(v);
                        }}
                        title={t.edit}
                        aria-label={`${t.edit} ${v.name}`}
                      >
                        <Pencil size={16} strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={styles.rowDeleteButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          setError("");
                          setDeleteTarget(v);
                        }}
                        title={t.delete}
                        aria-label={`${t.delete} ${v.name}`}
                      >
                        <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {showForm && (
            <div className={styles.modalBackdrop} onClick={closeForm}>
              <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h2>{editingId ? t.editVehicleTitle : t.addVehicleTitle}</h2>
                  <button type="button" className={styles.closeButton} onClick={closeForm} disabled={saving} aria-label="Close">
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    <span>{t.name} *</span>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                  <label>
                    <span>{t.registrationNumber} *</span>
                    <input
                      value={form.registrationNumber}
                      onChange={(e) => setForm({ ...form, registrationNumber: e.target.value.toUpperCase() })}
                      style={{ textTransform: "uppercase" }}
                    />
                  </label>
                  <label>
                    <span>{t.type}</span>
                    <StyledSelect
                      value={form.type}
                      onChange={(value) => setForm({ ...form, type: value })}
                      placeholder={t.selectType}
                      ariaLabel={t.type}
                      options={vehicleTypes.map((vt) => ({ value: vt, label: vt }))}
                    />
                    {vehicleTypes.length === 0 && <small className={styles.fieldHint}>{t.noTypes}</small>}
                  </label>
                  <label>
                    <span>
                      {t.image} <small>{t.optional}</small>
                    </span>
                    <div className={styles.fileField}>
                      <button type="button" className={styles.secondaryButton} onClick={() => fileInputRef.current?.click()}>
                        {form.image ? t.changeImage : "Choose Image"}
                      </button>
                      <span
                        className={form.image ? styles.fileNameSelected : styles.fileNameMuted}
                        title={form.imageName || form.image || ""}
                      >
                        {form.image
                          ? form.imageName ||
                            (() => {
                              const s = form.image;
                              if (s.startsWith("data:")) return "Selected image";
                              try {
                                const url = new URL(s);
                                const seg = url.pathname.split("/").pop();
                                return seg || "Existing image";
                              } catch {
                                return s.length > 30 ? s.slice(0, 30) + "…" : s || "Existing image";
                              }
                            })()
                          : "No image selected"}
                      </span>
                      {form.image && (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => {
                            setForm((c) => ({ ...c, image: "", imageName: "" }));
                            setImageError("");
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                        >
                          {t.removeImage}
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        onChange={handleImageChange}
                      />
                    </div>
                    {imageError && (
                      <small className={styles.fieldHint} style={{ color: "var(--danger)" }}>
                        {imageError}
                      </small>
                    )}
                  </label>
                  <label className={styles.fullWidth}>
                    <span>{t.notes}</span>
                    <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                  </label>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <footer className={styles.modalFooter}>
                  <button type="button" className={styles.secondaryButton} onClick={closeForm} disabled={saving}>
                    {t.cancel}
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={saveVehicle} disabled={saving}>
                    {saving ? t.saving : editingId ? t.save : t.create}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {deleteTarget && (
            <div className={styles.modalBackdrop}>
              <section className={styles.deleteModalCompact} role="dialog" aria-modal="true" aria-labelledby="delete-title">
                <div className={styles.warningIconSmall} aria-hidden="true">
                  <AlertTriangle size={20} strokeWidth={2} />
                </div>
                <h2 id="delete-title">{t.deleteVehicle}</h2>
                <p className={styles.deleteDescription}>{t.deleteWarning}</p>
                <p className={styles.deleteContext}>
                  {deleteTarget.name} · {deleteTarget.registrationNumber} · {deleteTarget.type || "—"}
                </p>
                <div className={styles.circularCountdown} aria-live="polite">
                  <div className={styles.circleWrapper} aria-hidden="true">
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" className={styles.circleTrack} />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={styles.circleProgress}
                        style={{
                          strokeDasharray: `${2 * Math.PI * 28}`,
                          strokeDashoffset: `${2 * Math.PI * 28 * (deleteCountdown / 3.5)}`,
                        }}
                      />
                    </svg>
                    <span className={styles.circleText}>{deleteCountdown > 0 ? deleteCountdown.toFixed(1) : "0.0"}</span>
                  </div>
                  <span className={styles.circleLabel}>{deleteCountdown > 0 ? "Confirm deletion" : t.confirmDelete}</span>
                </div>
                {error && <div className={styles.formError}>{error}</div>}
                <div className={styles.modalFooterCompact}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      if (!deleting) {
                        setDeleteTarget(null);
                        setDeleteCountdown(3.5);
                        deleteStartRef.current = null;
                      }
                    }}
                    disabled={deleting}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void confirmDelete()}
                    disabled={deleteCountdown > 0 || deleting}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                    {deleting ? t.deleting : t.confirmDelete}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}


