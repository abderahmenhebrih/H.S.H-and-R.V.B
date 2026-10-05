"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleDollarSign,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";

import { customerService } from "../../src/services/customer.service";
import { customerEditOperation } from "../../src/services/operations/customer-edit.operation";
import { customerDeleteOperation } from "../../src/services/operations/customer-delete.operation";
import { useDbSync } from "../../src/hooks/useDbSync";
import { settingsService } from "../../src/services/settings.service";
import {
  SETTINGS_EVENT,
  DEFAULT_SETTINGS,
  formatCurrency,
} from "../../src/lib/settings";
import { exactNumberLabel, formatCompactCurrency, formatCompactNumber } from "../../src/lib/compact-number";
import type { Currency, Language } from "../../src/types/settings/settings";

import type { Customer } from "../../src/types/entities/customer";

import styles from "./page.module.css";
import countdownStyles from "../../src/components/common/ProtectedDeleteModal.module.css";
import { useCircularDeleteCountdown } from "../../src/hooks/useCircularDeleteCountdown";
import AppShell from "../../src/components/layout/AppShell";
import StyledSelect from "../../src/components/common/StyledSelect";

type FormState = {
  name: string;
  phone: string;
  address: string;
  identificationNumber: string;
  email: string;
  notes: string;
  type: string;
  invoiceCustomerType: "consumer" | "business";
  legalName: string;
  commercialName: string;
  legalForm: string;
  activity: string;
  billingAddress: string;
  rc: string;
  nif: string;
  nis: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  address: "",
  identificationNumber: "",
  email: "",
  notes: "",
  type: "",
  invoiceCustomerType: "consumer",
  legalName: "",
  commercialName: "",
  legalForm: "",
  activity: "",
  billingAddress: "",
  rc: "",
  nif: "",
  nis: "",
};

function CustomDropdown({
  value,
  options,
  placeholder,
  onChange,
  triggerRef,
  onEnterNavigate,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onEnterNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        !(triggerRef?.current && triggerRef.current.contains(e.target as Node))
      ) {
        setOpen(false);
      }
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
  }, [triggerRef]);

  return (
    <div className={styles.customDropdown} ref={containerRef}>
      <button
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        type="button"
        className={`${styles.customDropdownTrigger} ${
          open ? styles.customDropdownOpen : ""
        }`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!open) {
              setOpen(true);
            } else if (onEnterNavigate) {
              setOpen(false);
              onEnterNavigate();
            }
          }
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={value ? styles.customDropdownValue : styles.customDropdownPlaceholder}>
          {value || placeholder}
        </span>

        <span
          className={`${styles.customDropdownArrow} ${
            open ? styles.customDropdownArrowOpen : ""
          }`}
          aria-hidden="true"
        >
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className={styles.customDropdownMenu} role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`${styles.customDropdownOption} ${
              !value ? styles.customDropdownOptionSelected : ""
            }`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {placeholder}
          </button>

          {options.map((option) => (
            <button
              type="button"
              key={option}
              role="option"
              aria-selected={value === option}
              className={`${styles.customDropdownOption} ${
                value === option ? styles.customDropdownOptionSelected : ""
              }`}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterDropdown({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
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

  const label = value || placeholder;

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
          <ChevronDown size={16} strokeWidth={2} />
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
            {placeholder}
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={value === opt}
              className={`${styles.filterOption} ${value === opt ? styles.filterOptionActive : ""}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TRANSLATIONS = {
  en: {
    title: "Customers",
    subtitle: "Manage customer information, types, balances and history.",
    search: "Search customers...",
    searchPlaceholder: "Search customers by name, phone, or type...",
    customerCount: "customer",
    customersCount: "customers",
    customer: "Customer",
    type: "Type",
    phone: "Phone",
    balance: "Balance",
    balanceDA: "Balance",
    actions: "Actions",
    addCustomer: "Add Customer",
    loading: "Loading customers...",
    noCustomers: "No customers yet",
    noCustomersFound: "No customers found",
    addFirst: "Add your first customer to begin.",
    tryAnother: "Try another search term.",
    noInfo: "No additional information",
    newCustomer: "NEW CUSTOMER",
    editCustomer: "EDIT CUSTOMER",
    addCustomerTitle: "Add Customer",
    editCustomerTitle: "Edit Customer",
    name: "Name",
    phoneLabel: "Phone",
    customerType: "Customer Type",
    identification: "Identification / Trade Register",
    address: "Address",
    email: "Email",
    notes: "Notes",
    selectCustomerType: "Select customer type",
    saving: "Saving...",
    saveChanges: "Save Changes",
    createCustomer: "Create Customer",
    permanentAction: "PERMANENT ACTION",
    confirmDelete: "You can confirm deletion now",
    totalCustomers: "Total Customers",
    totalCustomersSub: "Registered customers",
    totalBalance: "Total Balance",
    totalBalanceSub: "All customers",
    customerTypes: "Customer Types",
    customerTypesSub: "Defined types",
    withBalance: "Outstanding Balance",
    withBalanceSub: "Customers with unpaid balance",
    allTypes: "All Types",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    invalidPhone: "Phone may contain +, digits, spaces and dashes only.",
    invoiceIdentity: "Invoice Identity",
    invoiceCustomerType: "Invoice customer type",
    consumer: "Consumer",
    business: "Business",
    legalName: "Legal name",
    commercialName: "Commercial name",
    legalForm: "Legal form",
    activity: "Activity",
    billingAddress: "Billing address",
    rcLabel: "RC",
    nifLabel: "NIF",
    nisLabel: "NIS",
    addressPlaceholder: "Invoice billing address",
    billingAddressHelp: "Used for invoice — defaults to Address when empty",
    nameRequired: "Customer name is required.",
    phoneRequired: "Customer phone is required.",
    customerTypeRequired: "Customer type is required.",
    failedSaveCustomer: "Failed to save customer.",
    failedDeleteCustomer: "Failed to delete customer.",
  },

  fr: {
    title: "Clients",
    subtitle: "Gérer les informations clients, les types, les soldes et l’historique.",
    search: "Rechercher des clients...",
    searchPlaceholder: "Rechercher par nom, téléphone ou type...",
    customerCount: "client",
    customersCount: "clients",
    customer: "Client",
    type: "Type",
    phone: "Téléphone",
    balance: "Solde",
    balanceDA: "Solde",
    actions: "Actions",
    addCustomer: "Ajouter un client",
    loading: "Chargement des clients...",
    noCustomers: "Aucun client pour le moment",
    noCustomersFound: "Aucun client trouvé",
    addFirst: "Ajoutez votre premier client pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    noInfo: "Aucune information supplémentaire",
    newCustomer: "NOUVEAU CLIENT",
    editCustomer: "MODIFIER LE CLIENT",
    addCustomerTitle: "Ajouter un client",
    editCustomerTitle: "Modifier le client",
    name: "Nom",
    phoneLabel: "Téléphone",
    customerType: "Type de client",
    identification: "Identification / Registre de commerce",
    address: "Adresse",
    email: "E-mail",
    notes: "Notes",
    selectCustomerType: "Sélectionner le type de client",
    saving: "Enregistrement...",
    saveChanges: "Enregistrer les modifications",
    createCustomer: "Créer le client",
    permanentAction: "ACTION PERMANENTE",
    confirmDelete: "Vous pouvez confirmer la suppression maintenant",
    totalCustomers: "Total Clients",
    totalCustomersSub: "Clients enregistrés",
    totalBalance: "Solde Total",
    totalBalanceSub: "Tous les clients",
    customerTypes: "Types de Clients",
    customerTypesSub: "Types définis",
    withBalance: "Solde Impayé",
    withBalanceSub: "Clients avec solde impayé",
    allTypes: "Tous les types",
    cancel: "Annuler",
    delete: "Supprimer",
    edit: "Modifier",
    invalidPhone: "Le téléphone peut contenir +, chiffres, espaces et tirets uniquement.",
    invoiceIdentity: "Identité de facturation",
    invoiceCustomerType: "Type de client facturation",
    consumer: "Particulier",
    business: "Entreprise",
    legalName: "Raison sociale",
    commercialName: "Nom commercial",
    legalForm: "Forme juridique",
    activity: "Activité",
    billingAddress: "Adresse de facturation",
    rcLabel: "RC",
    nifLabel: "NIF",
    nisLabel: "NIS",
    addressPlaceholder: "Adresse de facturation",
    billingAddressHelp: "Utilisée pour la facture — adresse par défaut si vide",
    nameRequired: "Le nom du client est obligatoire.",
    phoneRequired: "Le téléphone du client est obligatoire.",
    customerTypeRequired: "Le type de client est obligatoire.",
    failedSaveCustomer: "Échec de l'enregistrement du client.",
    failedDeleteCustomer: "Échec de la suppression du client.",
  },

  ar: {
    title: "العملاء",
    subtitle: "إدارة معلومات العملاء والأنواع والأرصدة والسجل.",
    search: "البحث عن العملاء...",
    searchPlaceholder: "البحث بالاسم أو الهاتف أو النوع...",
    customerCount: "عميل",
    customersCount: "عملاء",
    customer: "العميل",
    type: "النوع",
    phone: "الهاتف",
    balance: "الرصيد",
    balanceDA: "الرصيد",
    actions: "الإجراءات",
    addCustomer: "إضافة عميل",
    loading: "جارٍ تحميل العملاء...",
    noCustomers: "لا يوجد عملاء بعد",
    noCustomersFound: "لم يتم العثور على عملاء",
    addFirst: "أضف أول عميل للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    noInfo: "لا توجد معلومات إضافية",
    newCustomer: "عميل جديد",
    editCustomer: "تعديل العميل",
    addCustomerTitle: "إضافة عميل",
    editCustomerTitle: "تعديل العميل",
    name: "الاسم",
    phoneLabel: "الهاتف",
    customerType: "نوع العميل",
    identification: "رقم التعريف / السجل التجاري",
    address: "العنوان",
    email: "البريد الإلكتروني",
    notes: "ملاحظات",
    selectCustomerType: "اختر نوع العميل",
    saving: "جارٍ الحفظ...",
    saveChanges: "حفظ التغييرات",
    createCustomer: "إنشاء العميل",
    permanentAction: "إجراء دائم",
    confirmDelete: "يمكنك تأكيد الحذف الآن",
    totalCustomers: "إجمالي العملاء",
    totalCustomersSub: "عملاء مسجلون",
    totalBalance: "إجمالي الرصيد",
    totalBalanceSub: "جميع العملاء",
    customerTypes: "أنواع العملاء",
    customerTypesSub: "أنواع محددة",
    withBalance: "الرصيد المستحق",
    withBalanceSub: "عملاء برصيد مستحق",
    allTypes: "جميع الأنواع",
    cancel: "إلغاء",
    delete: "حذف",
    edit: "تعديل",
    invalidPhone: "قد يحتوي الهاتف على + وأرقام ومسافات وشرطات فقط.",
    invoiceIdentity: "هوية الفوترة",
    invoiceCustomerType: "نوع الزبون للفوترة",
    consumer: "مستهلك",
    business: "تاجر",
    legalName: "الاسم القانوني",
    commercialName: "الاسم التجاري",
    legalForm: "الشكل القانوني",
    activity: "النشاط",
    billingAddress: "عنوان الفوترة",
    rcLabel: "السجل التجاري",
    nifLabel: "رقم التعريف الجبائي",
    nisLabel: "رقم التعريف الإحصائي",
    addressPlaceholder: "عنوان الفوترة",
    billingAddressHelp: "يُستخدم للفاتورة — يعود إلى العنوان عند تركه فارغاً",
    nameRequired: "اسم العميل مطلوب.",
    phoneRequired: "هاتف العميل مطلوب.",
    customerTypeRequired: "نوع العميل مطلوب.",
    failedSaveCustomer: "فشل حفظ العميل.",
    failedDeleteCustomer: "فشل حذف العميل.",
  },
} as const;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerTypes, setCustomerTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const typeTriggerRef = useRef<HTMLButtonElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const t = TRANSLATIONS[language];

  const {
    displaySec: deleteDisplaySec,
    isReady: deleteReady,
    startRef: deleteStartRef,
  } = useCircularDeleteCountdown(
    !!deleteTarget,
    deleteTarget?.id ?? null,
  );

  useEffect(() => {
    const readSettings = async () => {
      const settings = await settingsService.get();
      setLanguage(settings?.language ?? DEFAULT_SETTINGS.language);
      setCurrency(settings?.currency ?? DEFAULT_SETTINGS.currency);
    };

    readSettings();

    const handleSettingsChange = () => {
      readSettings();
    };

    window.addEventListener(SETTINGS_EVENT, handleSettingsChange);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange);
    };
  }, []);

  async function load() {
    setLoading(true);

    try {
      const [loadedCustomers, settings] = await Promise.all([
        customerService.getAll(),
        settingsService.get(),
      ]);

      setCustomers(loadedCustomers);
      setCustomerTypes(settings?.customerTypes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useDbSync(() => {
    load();
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesSearch = !query
        ? true
        : [
            customer.name,
            customer.phone,
            customer.address,
            customer.identificationNumber,
            customer.email,
            customer.type,
          ]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(query));
      const matchesType = !filterType ? true : customer.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [customers, search, filterType]);

  const totalCustomers = customers.length;
  const hasInvalidBalance = useMemo(() => customers.some((c) => c.balance !== undefined && c.balance !== null && !Number.isFinite(c.balance)), [customers]);
  const totalBalance = useMemo(
    () => customers.reduce((sum, c) => sum + (Number.isFinite(c.balance) ? c.balance : 0), 0),
    [customers],
  );
  const distinctTypes = useMemo(
    () => new Set(customers.map((c) => c.type).filter(Boolean)).size,
    [customers],
  );
  const withBalance = useMemo(
    () => customers.filter((c) => Number.isFinite(c.balance) && c.balance !== 0).length,
    [customers],
  );

  function openCreate() {
    setEditingId(null);
    // Use latest customerTypes if available; if still loading, leave empty and let user select once options appear.
    // Also ensure functional update to avoid stale closure
    setForm({ ...EMPTY_FORM, type: customerTypes[0] ?? "" });
    setError("");
    setShowForm(true);
  }

  // If customerTypes loads after form is open with empty type, auto-populate first type so dropdown shows value
  // This handles the case where Add is clicked before settings load and ensures selection persists
  useEffect(() => {
    if (showForm && !editingId && !form.type && customerTypes.length > 0) {
      setForm((prev) => (prev.type ? prev : { ...prev, type: customerTypes[0] }));
    }
  }, [customerTypes, showForm, editingId, form.type]);

  function openEdit(customer: Customer) {
    setEditingId(customer.id);

    setForm({
      name: customer.name,
      phone: customer.phone,
      address: customer.address ?? "",
      identificationNumber: customer.identificationNumber ?? "",
      email: customer.email ?? "",
      notes: customer.notes ?? "",
      type: customer.type,
      invoiceCustomerType: (customer as any).invoiceCustomerType || "consumer",
      legalName: (customer as any).legalName ?? "",
      commercialName: (customer as any).commercialName ?? "",
      legalForm: (customer as any).legalForm ?? "",
      activity: (customer as any).activity ?? "",
      billingAddress: (customer as any).billingAddress ?? "",
      rc: (customer as any).rc ?? "",
      nif: (customer as any).nif ?? "",
      nis: (customer as any).nis ?? "",
    });

    setError("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  // Ensure form.type updates correctly when CustomDropdown selects
  // (already fixed via functional setForm in CustomDropdown onChange)

  async function saveCustomer() {
    setError("");

    if (!form.name.trim()) {
      setError((t as any).nameRequired);
      return;
    }

    if (!form.phone.trim()) {
      setError((t as any).phoneRequired);
      return;
    }

    if (!/^\+?[0-9\s\-]+$/.test(form.phone.trim())) {
      setError(t.invalidPhone);
      return;
    }

    if (!form.type.trim()) {
      setError((t as any).customerTypeRequired);
      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        await customerEditOperation.edit({
          customerId: editingId,
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim() || undefined,
          identificationNumber:
            form.identificationNumber.trim() || undefined,
          email: form.email.trim() || undefined,
          notes: form.notes.trim() || undefined,
          type: form.type,
          invoiceCustomerType: form.invoiceCustomerType || "consumer",
          legalName: form.legalName,
          commercialName: form.commercialName,
          legalForm: form.legalForm,
          activity: form.activity,
          billingAddress: form.billingAddress,
          rc: form.rc,
          nif: form.nif,
          nis: form.nis,
        });
      } else {
        await customerService.create({
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim() || undefined,
          identificationNumber:
            form.identificationNumber.trim() || undefined,
          email: form.email.trim() || undefined,
          notes: form.notes.trim() || undefined,
          type: form.type,
          invoiceCustomerType: form.invoiceCustomerType || "consumer",
          legalName: form.legalName.trim() || undefined,
          commercialName: form.commercialName.trim() || undefined,
          legalForm: form.legalForm.trim() || undefined,
          activity: form.activity.trim() || undefined,
          billingAddress: form.billingAddress.trim() || undefined,
          rc: form.rc.trim() || undefined,
          nif: form.nif.trim() || undefined,
          nis: form.nis.trim() || undefined,
        });
      }

      // Close form immediately before reload to unmount backdrop — bypass `saving` guard
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setError("");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Customer name is required")) setError((t as any).nameRequired);
      else if (msg.includes("Customer phone is required")) setError((t as any).phoneRequired);
      else if (msg.includes("Customer type is required")) setError((t as any).customerTypeRequired);
      else if (msg.includes("already exists")) setError(msg); // duplicate keeps English but could be translated if needed
      else setError(msg || (t as any).failedSaveCustomer);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) return;
    } else if (!deleteReady) {
      return;
    }

    try {
      setError("");

      await customerDeleteOperation.delete(deleteTarget.id);

      setCustomers((current) =>
        current.filter((customer) => customer.id !== deleteTarget.id)
      );

      setDeleteTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Customer name is required")) setError((t as any).nameRequired);
      else if (msg.includes("Customer phone is required")) setError((t as any).phoneRequired);
      else if (msg.includes("Customer type is required")) setError((t as any).customerTypeRequired);
      else setError(msg || (t as any).failedDeleteCustomer);
      setDeleteTarget(null);
    }
  }

  return (
    <AppShell activePage="customers" showHeader={false}>
      <main className={styles.customersPage}>
        <div className={styles.customersShell}>
          {/* Unified Customers header */}
          <div className={styles.headerContainer}>
          <section className={styles.customersHeader}>
            <div className={styles.customersHeaderBrand}>
              <div className={styles.customersLogo}>
                <img src="/chicken.jpg" alt="" />
              </div>
              <div className={styles.customersTitle}>
                <h1>{t.title}</h1>
                <p>{t.subtitle}</p>
              </div>
            </div>

            <div className={styles.searchBox}>
              <span aria-hidden="true">
                <Search size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.search}
              />
            </div>

            <FilterDropdown
              value={filterType}
              options={customerTypes}
              placeholder={t.allTypes}
              onChange={setFilterType}
            />

            <button type="button" className={styles.primaryButton} onClick={openCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addCustomer}
            </button>
          </section>
          </div>

          {/* KPI Cards — matched to Products */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconTypes}`}>
                <Tags size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.customerTypes}</span>
                <strong className={styles.summaryValue} title={exactNumberLabel(distinctTypes)}>{formatCompactNumber(distinctTypes)}</strong>
                <small className={styles.summarySub}>{t.customerTypesSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconWithBalance}`}>
                <CircleDollarSign size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.withBalance}</span>
                <strong className={styles.summaryValue} title={exactNumberLabel(withBalance)}>{formatCompactNumber(withBalance)}</strong>
                <small className={styles.summarySub}>{t.withBalanceSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconCustomers}`}>
                <UsersRound size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalCustomers}</span>
                <strong className={styles.summaryValue} title={exactNumberLabel(totalCustomers)}>{formatCompactNumber(totalCustomers)}</strong>
                <small className={styles.summarySub}>{t.totalCustomersSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconBalance}`}>
                <Wallet size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalBalance}</span>
                <strong className={styles.summaryValue} title={formatCurrency(totalBalance, currency)}>{formatCompactCurrency(totalBalance, currency)}{hasInvalidBalance && <span title="Invalid balance value detected (NaN/Infinity)" style={{ marginInlineStart: 6, color: "var(--danger)", fontSize: 11, fontWeight: 800 }}>⚠ Data integrity</span>}</strong>
                <small className={styles.summarySub}>{t.totalBalanceSub}</small>
              </div>
            </div>
          </section>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.customer}</span>
              <span>{t.type}</span>
              <span>{t.phone}</span>
              <span>{`${t.balance} (${currency})`}</span>
              <span>{t.actions}</span>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loadingPulse} />
                <strong>{t.loading}</strong>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <UsersRound size={32} strokeWidth={2} />
                </div>
                <strong>{search || filterType ? t.noCustomersFound : t.noCustomers}</strong>
                <p>{search || filterType ? t.tryAnother : t.addFirst}</p>
                {!search && !filterType && (
                  <button type="button" className={styles.primaryButton} onClick={openCreate}>
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addCustomer}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.customerRows}>
                {filteredCustomers.map((customer) => (
                  <article
                    key={customer.id}
                    className={styles.customerRow}
                    onDoubleClick={() => openEdit(customer)}
                  >
                    <div className={styles.customerIdentity}>
                      <div className={styles.avatar}>
                        <UsersRound size={16} strokeWidth={2} aria-hidden="true" />
                      </div>
                      <div>
                        <strong>{customer.name}</strong>
                        <small>{customer.email || customer.address || t.noInfo}</small>
                      </div>
                    </div>

                    <span className={styles.typeText}>{customer.type}</span>

                    <span className={styles.phone}>{customer.phone}</span>

                    {Number.isFinite(customer.balance) ? (
                      <strong
                        className={
                          customer.balance === 0
                            ? styles.balanceZero
                            : styles.balanceValue
                        }
                      >
                        {formatCurrency(customer.balance, currency)}
                      </strong>
                    ) : customer.balance === undefined || customer.balance === null ? (
                      <span title="No balance" style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      <span title={`Invalid balance: ${String(customer.balance)}`} style={{ color: "var(--danger)", fontWeight: 700 }}>Invalid</span>
                    )}

                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.rowEditButton}
                        onClick={() => openEdit(customer)}
                      >
                        <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                        {t.edit}
                      </button>
                      <button
                        type="button"
                        className={styles.rowDeleteButton}
                        onClick={() => setDeleteTarget(customer)}
                      >
                        <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                        {t.delete}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {showForm && (
            <div className={styles.modalBackdrop}>
              <section className={styles.modal}>
                <header className={styles.modalHeader}>
                  <h2>{editingId ? t.editCustomerTitle : t.addCustomerTitle}</h2>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={closeForm}
                    aria-label="Close"
                  >
                    <X size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </header>

                <div className={styles.formGrid}>
                  <label>
                    <span>{t.name} *</span>
                    <input
                      ref={nameRef}
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          phoneRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label>
                    <span>{t.phoneLabel} *</span>
                    <input
                      ref={phoneRef}
                      type="tel"
                      inputMode="tel"
                      pattern="^\+?[0-9\s\-]*$"
                      autoComplete="tel"
                      dir="ltr"
                      value={form.phone}
                      className={error === t.invalidPhone ? styles.inputInvalid : undefined}
                      aria-invalid={error === t.invalidPhone}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setForm({ ...form, phone: raw });
                        if (error === t.invalidPhone && /^\+?[0-9\s\-]*$/.test(raw.trim())) {
                          setError("");
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          typeTriggerRef.current?.focus();
                          return;
                        }
                      }}
                    />
                    {error === t.invalidPhone && (
                      <span className={styles.fieldError} role="alert">
                        {error}
                      </span>
                    )}
                  </label>

                  <label>
                    <span>{t.customerType} *</span>
                    <CustomDropdown
                      value={form.type}
                      options={customerTypes}
                      placeholder={t.selectCustomerType}
                      onChange={(value) =>
                        setForm((prev) => ({ ...prev, type: value }))
                      }
                      triggerRef={typeTriggerRef}
                      onEnterNavigate={() => idRef.current?.focus()}
                    />
                  </label>

                  <label>
                    <span>{t.identification}</span>
                    <input
                      ref={idRef}
                      value={form.identificationNumber}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          identificationNumber: event.target.value,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addressRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label>
                    <span>{t.address}</span>
                    <input
                      ref={addressRef}
                      value={form.address}
                      onChange={(event) =>
                        setForm({ ...form, address: event.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          emailRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label>
                    <span>{t.email}</span>
                    <input
                      ref={emailRef}
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm({ ...form, email: event.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          notesRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label className={styles.fullWidth}>
                    <span>{t.notes}</span>
                    <textarea
                      ref={notesRef}
                      value={form.notes}
                      onChange={(event) =>
                        setForm({ ...form, notes: event.target.value })
                      }
                      rows={4}
                    />
                  </label>

                  {/* Invoice Identity Section */}
                  <div className={styles.fullWidth} style={{ gridColumn: "1 / -1", marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <strong style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", letterSpacing: 0.4 }}>{(t as any).invoiceIdentity}</strong>
                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>{(t as any).invoiceCustomerType}</span>
                        <StyledSelect
                          value={form.invoiceCustomerType}
                          onChange={(value) => setForm({ ...form, invoiceCustomerType: value as any })}
                          options={[
                            { value: "consumer", label: (t as any).consumer },
                            { value: "business", label: (t as any).business },
                          ]}
                          placeholder={(t as any).invoiceCustomerType}
                          ariaLabel={(t as any).invoiceCustomerType}
                        />
                      </label>
                      {/* Billing Address — always visible, consumer & business */}
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>{(t as any).billingAddress}</span>
                        <input
                          value={form.billingAddress}
                          onChange={(event) => setForm({ ...form, billingAddress: event.target.value })}
                          placeholder={form.address && !form.billingAddress ? form.address : (t as any).addressPlaceholder}
                          title={(t as any).billingAddressHelp}
                        />
                        {!form.billingAddress && form.address && (
                          <small style={{ color: "var(--muted)", fontSize: 11 }}>Fallback: {form.address} ({(t as any).billingAddressHelp})</small>
                        )}
                      </label>
                    </div>

                    {/* Consumer helper: name + billingAddress already handled (name in main form) */}
                    {form.invoiceCustomerType === "consumer" && (
                      <small style={{ color: "var(--muted)", fontSize: 11, marginTop: 8, display: "block" }}>
                        {language === "fr" ? "Consommateur : nom + adresse de facturation." : language === "ar" ? "مستهلك: الاسم + عنوان الفوترة." : "Consumer: name + billing address."}
                      </small>
                    )}

                    {form.invoiceCustomerType === "business" && (
                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>{(t as any).legalName}</span>
                          <input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>{(t as any).commercialName}</span>
                          <input value={form.commercialName} onChange={(e) => setForm({ ...form, commercialName: e.target.value })} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>{(t as any).legalForm}</span>
                          <input value={form.legalForm} onChange={(e) => setForm({ ...form, legalForm: e.target.value })} placeholder="SARL" />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>{(t as any).activity}</span>
                          <input value={form.activity} onChange={(e) => setForm({ ...form, activity: e.target.value })} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>{(t as any).rcLabel}</span>
                          <input value={form.rc} onChange={(e) => setForm({ ...form, rc: e.target.value })} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>{(t as any).nifLabel}</span>
                          <input value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 700 }}>{(t as any).nisLabel}</span>
                          <input value={form.nis} onChange={(e) => setForm({ ...form, nis: e.target.value })} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {error && <div className={styles.formError}>{error}</div>}

                <footer className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={closeForm}
                    disabled={saving}
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={saveCustomer}
                    disabled={saving}
                  >
                    {saving ? t.saving : editingId ? t.saveChanges : t.createCustomer}
                  </button>
                </footer>
              </section>
            </div>
          )}

          {deleteTarget && (
            <div className={styles.modalBackdrop}>
              <section className={styles.deleteModal}>
                <div className={styles.warningIcon} aria-hidden="true">
                  <AlertTriangle size={24} strokeWidth={2} />
                </div>
                <span className={styles.modalEyebrow}>{t.permanentAction}</span>
                <h2>Delete {deleteTarget.name}?</h2>
                <p>
                  This action is protected. Customer records connected to sales,
                  payments or a non-zero balance cannot be deleted.
                </p>
                <div
                  className={countdownStyles.circularCountdown}
                  aria-live="polite"
                >
                  <div
                    className={countdownStyles.circleWrapper}
                    aria-hidden="true"
                  >
                    <svg width="64" height="64" viewBox="0 0 64 64">
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={countdownStyles.circleTrack}
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={countdownStyles.circleProgress}
                        style={{
                          strokeDasharray: `${2 * Math.PI * 28}`,
                          strokeDashoffset: `${2 * Math.PI * 28 * (deleteDisplaySec / 3.5)}`,
                        }}
                      />
                    </svg>
                    <span className={countdownStyles.circleText}>
                      {deleteDisplaySec > 0
                        ? deleteDisplaySec.toFixed(1)
                        : "0.0"}
                    </span>
                  </div>
                  <span className={countdownStyles.circleLabel}>
                    {deleteReady ? t.confirmDelete : "Confirm deletion"}
                  </span>
                </div>
                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setDeleteTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    disabled={!deleteReady}
                    onClick={confirmDelete}
                  >
                    Delete Permanently
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

