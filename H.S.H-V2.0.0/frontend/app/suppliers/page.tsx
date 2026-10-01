"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";
import {
  AlertTriangle,
  CircleDollarSign,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Truck,
  Wallet,
  X,
} from "lucide-react";

import { supplierService } from "../../src/services/supplier.service";
import { supplierEditOperation } from "../../src/services/operations/supplier-edit.operation";
import { supplierDeleteOperation } from "../../src/services/operations/supplier-delete.operation";
import { settingsService } from "../../src/services/settings.service";
import {
  SETTINGS_EVENT,
  DEFAULT_SETTINGS,
  formatCurrency,
} from "../../src/lib/settings";
import type { Currency, Language } from "../../src/types/settings/settings";

import type { Supplier } from "../../src/types/entities/supplier";

import styles from "./page.module.css";
import countdownStyles from "../../src/components/common/ProtectedDeleteModal.module.css";
import { useCircularDeleteCountdown } from "../../src/hooks/useCircularDeleteCountdown";
import AppShell from "../../src/components/layout/AppShell";

type FormState = {
  name: string;
  phone: string;
  address: string;
  identificationNumber: string;
  email: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  address: "",
  identificationNumber: "",
  email: "",
  notes: "",
};

const TRANSLATIONS = {
  en: {
    title: "Suppliers",
    subtitle: "Manage supplier information, balances, contacts and purchase history.",
    search: "Search suppliers...",
    searchPlaceholder: "Search suppliers by name, phone, address...",
    supplier: "Supplier",
    phone: "Phone",
    balance: "Balance",
    information: "Information",
    actions: "Actions",
    addSupplier: "Add Supplier",
    loading: "Loading suppliers...",
    noSuppliers: "No suppliers yet",
    noSuppliersFound: "No suppliers found",
    addFirst: "Add your first supplier to begin.",
    tryAnother: "Try another search term.",
    noInfo: "No additional information",
    addSupplierTitle: "Add Supplier",
    editSupplierTitle: "Edit Supplier",
    name: "Name",
    phoneLabel: "Phone",
    identification: "Identification / Trade Register",
    email: "Email",
    address: "Address",
    notes: "Notes",
    saving: "Saving...",
    saveChanges: "Save Changes",
    createSupplier: "Create Supplier",
    permanentAction: "PERMANENT ACTION",
    confirmDelete: "You can confirm deletion now",
    totalSuppliers: "Total Suppliers",
    totalSuppliersSub: "Registered suppliers",
    outstandingPayable: "Outstanding Payable",
    outstandingPayableSub: "Total payable balance",
    suppliersWithBalance: "Suppliers with Balance",
    suppliersWithBalanceSub: "Suppliers with unpaid balance",
    supplierContacts: "Supplier Contacts",
    supplierContactsSub: "With phone number",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    invalidPhone: "Phone may contain +, digits, spaces and dashes only.",
  },

  fr: {
    title: "Fournisseurs",
    subtitle: "Gérer les informations, soldes, contacts et historique des achats.",
    search: "Rechercher des fournisseurs...",
    searchPlaceholder: "Rechercher par nom, téléphone ou adresse...",
    supplier: "Fournisseur",
    phone: "Téléphone",
    balance: "Solde",
    information: "Informations",
    actions: "Actions",
    addSupplier: "Ajouter un fournisseur",
    loading: "Chargement des fournisseurs...",
    noSuppliers: "Aucun fournisseur pour le moment",
    noSuppliersFound: "Aucun fournisseur trouvé",
    addFirst: "Ajoutez votre premier fournisseur pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    noInfo: "Aucune information supplémentaire",
    addSupplierTitle: "Ajouter un fournisseur",
    editSupplierTitle: "Modifier le fournisseur",
    name: "Nom",
    phoneLabel: "Téléphone",
    identification: "Identification / Registre de commerce",
    email: "E-mail",
    address: "Adresse",
    notes: "Notes",
    saving: "Enregistrement...",
    saveChanges: "Enregistrer les modifications",
    createSupplier: "Créer le fournisseur",
    permanentAction: "ACTION PERMANENTE",
    confirmDelete: "Vous pouvez confirmer la suppression maintenant",
    totalSuppliers: "Total Fournisseurs",
    totalSuppliersSub: "Fournisseurs enregistrés",
    outstandingPayable: "Dette Fournisseurs",
    outstandingPayableSub: "Solde total à payer",
    suppliersWithBalance: "Fournisseurs avec Solde",
    suppliersWithBalanceSub: "Fournisseurs avec solde impayé",
    supplierContacts: "Contacts Fournisseurs",
    supplierContactsSub: "Avec numéro de téléphone",
    cancel: "Annuler",
    delete: "Supprimer",
    edit: "Modifier",
    invalidPhone: "Le téléphone peut contenir +, chiffres, espaces et tirets uniquement.",
  },

  ar: {
    title: "الموردون",
    subtitle: "إدارة معلومات الموردين وأرصدتهم وجهات الاتصال وسجل المشتريات.",
    search: "البحث عن الموردين...",
    searchPlaceholder: "البحث بالاسم أو الهاتف أو العنوان...",
    supplier: "المورد",
    phone: "الهاتف",
    balance: "الرصيد",
    information: "المعلومات",
    actions: "الإجراءات",
    addSupplier: "إضافة مورد",
    loading: "جارٍ تحميل الموردين...",
    noSuppliers: "لا يوجد موردون بعد",
    noSuppliersFound: "لم يتم العثور على موردين",
    addFirst: "أضف أول مورد للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    noInfo: "لا توجد معلومات إضافية",
    addSupplierTitle: "إضافة مورد",
    editSupplierTitle: "تعديل المورد",
    name: "الاسم",
    phoneLabel: "الهاتف",
    identification: "رقم التعريف / السجل التجاري",
    email: "البريد الإلكتروني",
    address: "العنوان",
    notes: "ملاحظات",
    saving: "جارٍ الحفظ...",
    saveChanges: "حفظ التغييرات",
    createSupplier: "إنشاء المورد",
    permanentAction: "إجراء دائم",
    confirmDelete: "يمكنك تأكيد الحذف الآن",
    totalSuppliers: "إجمالي الموردين",
    totalSuppliersSub: "موردون مسجلون",
    outstandingPayable: "المبالغ المستحقة",
    outstandingPayableSub: "إجمالي الرصيد المستحق",
    suppliersWithBalance: "موردون برصيد",
    suppliersWithBalanceSub: "موردون برصيد مستحق",
    supplierContacts: "جهات اتصال الموردين",
    supplierContactsSub: "مع رقم الهاتف",
    cancel: "إلغاء",
    delete: "حذف",
    edit: "تعديل",
    invalidPhone: "قد يحتوي الهاتف على + وأرقام ومسافات وشرطات فقط.",
  },
} as const;

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_SETTINGS.currency);

  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
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

  async function loadSettings() {
    const settings = await settingsService.get();
    setLanguage(settings?.language ?? DEFAULT_SETTINGS.language);
    setCurrency(settings?.currency ?? DEFAULT_SETTINGS.currency);
  }

  async function load() {
    setLoading(true);
    try {
      const loadedSuppliers = await supplierService.getAll();
      setSuppliers(loadedSuppliers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suppliers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    void load();

    const handleSettingsChange = () => {
      void loadSettings();
    };

    window.addEventListener(SETTINGS_EVENT, handleSettingsChange);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange);
    };
  }, []);

  useDbSync(() => {
    void load();
  }, []);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.phone,
        supplier.address,
        supplier.identificationNumber,
        supplier.email,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [suppliers, search]);

  const totalSuppliers = suppliers.length;
  const hasInvalidBalance = useMemo(() => suppliers.some((s) => s.balance !== undefined && s.balance !== null && !Number.isFinite(s.balance)), [suppliers]);
  const outstandingPayable = useMemo(
    () => suppliers.reduce((sum, s) => sum + (Number.isFinite(s.balance) ? s.balance : 0), 0),
    [suppliers]
  );
  const withBalance = useMemo(
    () => suppliers.filter((s) => Number.isFinite(s.balance) && s.balance !== 0).length,
    [suppliers]
  );
  const contactsCount = useMemo(
    () => suppliers.filter((s) => s.phone && s.phone.trim() !== "").length,
    [suppliers]
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  }

  function openEdit(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address ?? "",
      identificationNumber: supplier.identificationNumber ?? "",
      email: supplier.email ?? "",
      notes: supplier.notes ?? "",
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

  async function saveSupplier() {
    setError("");

    if (!form.name.trim()) {
      setError("Supplier name is required.");
      return;
    }

    if (!form.phone.trim()) {
      setError("Supplier phone is required.");
      return;
    }

    if (!/^\+?[0-9\s\-]+$/.test(form.phone.trim())) {
      setError(t.invalidPhone);
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim() || undefined,
        identificationNumber: form.identificationNumber.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };

      if (editingId) {
        await supplierEditOperation.edit({
          supplierId: editingId,
          ...payload,
        });
      } else {
        await supplierService.create(payload);
      }

      // Close form immediately before reload
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setError("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save supplier.");
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
      await supplierDeleteOperation.delete(deleteTarget.id);
      setSuppliers((current) =>
        current.filter((supplier) => supplier.id !== deleteTarget.id)
      );
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete supplier.");
      setDeleteTarget(null);
    }
  }

  return (
    <AppShell activePage="suppliers" showHeader={false}>
      <main className={styles.suppliersPage}>
        <div className={styles.suppliersShell}>
          {/* Unified Suppliers header — brand / search / add */}
          <section className={styles.suppliersHeader}>
            <div className={styles.suppliersHeaderBrand}>
              <div className={styles.suppliersLogo}>
                <img src="/chicken.jpg" alt="" />
              </div>
              <div className={styles.suppliersTitle}>
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

            <button type="button" className={styles.primaryButton} onClick={openCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {t.addSupplier}
            </button>
          </section>

          {/* KPI Cards — RED→YELLOW→RED→YELLOW */}
          <section className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconSuppliers}`}>
                <Truck size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.totalSuppliers}</span>
                <strong className={styles.summaryValue}>{totalSuppliers}</strong>
                <small className={styles.summarySub}>{t.totalSuppliersSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconPayable}`}>
                <Wallet size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.outstandingPayable}</span>
                <strong className={styles.summaryValue}>
                  {formatCurrency(outstandingPayable, currency)}{hasInvalidBalance && <span title="Invalid balance value detected (NaN/Infinity)" style={{ marginInlineStart: 6, color: "var(--danger)", fontSize: 11, fontWeight: 800 }}>⚠ Data integrity</span>}
                </strong>
                <small className={styles.summarySub}>{t.outstandingPayableSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconContacts}`}>
                <Phone size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.supplierContacts}</span>
                <strong className={styles.summaryValue}>{contactsCount}</strong>
                <small className={styles.summarySub}>{t.supplierContactsSub}</small>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <div className={`${styles.summaryIcon} ${styles.iconWithBalance}`}>
                <CircleDollarSign size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <div className={styles.summaryContent}>
                <span className={styles.summaryLabel}>{t.suppliersWithBalance}</span>
                <strong className={styles.summaryValue}>{withBalance}</strong>
                <small className={styles.summarySub}>{t.suppliersWithBalanceSub}</small>
              </div>
            </div>
          </section>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <section className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <span>{t.supplier}</span>
              <span>{t.phone}</span>
              <span>{t.balance}</span>
              <span>{t.information}</span>
              <span>{t.actions}</span>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.loadingPulse} />
                <strong>{t.loading}</strong>
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <Truck size={32} strokeWidth={2} />
                </div>
                <strong>{search ? t.noSuppliersFound : t.noSuppliers}</strong>
                <p>{search ? t.tryAnother : t.addFirst}</p>
                {!search && (
                  <button type="button" className={styles.primaryButton} onClick={openCreate}>
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addSupplier}
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.supplierRows}>
                {filteredSuppliers.map((supplier) => (
                  <article
                    key={supplier.id}
                    className={styles.supplierRow}
                    onDoubleClick={() => openEdit(supplier)}
                  >
                    <div className={styles.supplierIdentity}>
                      <div className={styles.avatar} aria-hidden="true">
                        <Truck size={16} strokeWidth={2} />
                      </div>
                      <div>
                        <strong>{supplier.name}</strong>
                        <small>{supplier.email || supplier.address || t.noInfo}</small>
                      </div>
                    </div>

                    <span className={styles.phone}>{supplier.phone}</span>

                    {Number.isFinite(supplier.balance) ? (
                      <strong
                        className={
                          supplier.balance === 0 ? styles.balanceZero : styles.balanceValue
                        }
                      >
                        {formatCurrency(supplier.balance, currency)}
                      </strong>
                    ) : supplier.balance === undefined || supplier.balance === null ? (
                      <span title="No balance" style={{ color: "var(--muted)" }}>—</span>
                    ) : (
                      <span title={`Invalid balance: ${String(supplier.balance)}`} style={{ color: "var(--danger)", fontWeight: 700 }}>Invalid</span>
                    )}

                    <span className={styles.infoText}>
                      {supplier.email ||
                        supplier.identificationNumber ||
                        supplier.address ||
                        "—"}
                    </span>

                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.rowEditButton}
                        onClick={() => openEdit(supplier)}
                      >
                        <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                        {t.edit}
                      </button>
                      <button
                        type="button"
                        className={styles.rowDeleteButton}
                        onClick={() => setDeleteTarget(supplier)}
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
                  <h2>{editingId ? t.editSupplierTitle : t.addSupplierTitle}</h2>
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
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
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
                          idRef.current?.focus();
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
                    <span>{t.identification}</span>
                    <input
                      ref={idRef}
                      value={form.identificationNumber}
                      onChange={(event) =>
                        setForm({ ...form, identificationNumber: event.target.value })
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
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addressRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label className={styles.fullWidth}>
                    <span>{t.address}</span>
                    <input
                      ref={addressRef}
                      value={form.address}
                      onChange={(event) => setForm({ ...form, address: event.target.value })}
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
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      rows={4}
                    />
                  </label>
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
                    onClick={saveSupplier}
                    disabled={saving}
                  >
                    {saving ? t.saving : editingId ? t.saveChanges : t.createSupplier}
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
                  This action is protected. Supplier records connected to purchases, payments or a
                  non-zero balance cannot be deleted.
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
                      {deleteDisplaySec > 0 ? deleteDisplaySec.toFixed(1) : "0.0"}
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
                    {t.cancel}
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


