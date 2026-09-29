"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDbSync } from "../../src/hooks/useDbSync";

import {
  AlertTriangle,
  Banknote,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import AppShell from "../../src/components/layout/AppShell";
import StyledSelect from "../../src/components/common/StyledSelect";
import { productService } from "../../src/services/product.service";
import { productEditOperation } from "../../src/services/operations/product-edit.operation";
import { productDeleteOperation } from "../../src/services/operations/product-delete.operation";
import { settingsService } from "../../src/services/settings.service";
import { invoiceTaxProfileService } from "../../src/services/invoice-tax-profile.service";
import { useCircularDeleteCountdown } from "../../src/hooks/useCircularDeleteCountdown";
import countdownStyles from "../../src/components/common/ProtectedDeleteModal.module.css";
import {
  DEFAULT_SETTINGS,
  formatCurrency,
  SETTINGS_EVENT,
} from "../../src/lib/settings";

import type { Product } from "../../src/types/entities/product";
import type { InvoiceTaxProfile } from "../../src/types/entities/invoice-tax-profile";
import type { Currency, Language } from "../../src/types/settings/settings";

import styles from "./page.module.css";

type FormState = {
  name: string;
  price: string;
  quantity: string;
  weightKg: string;
  description: string;
  taxProfileId: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  price: "",
  quantity: "0",
  weightKg: "0",
  description: "",
  taxProfileId: "",
};

const TRANSLATIONS = {
  en: {
    title: "Products",
    subtitle: "Manage products, inventory quantities, pricing and weights.",
    search: "Search products...",
    searchPlaceholder: "Search products by name, description...",
    product: "Product",
    products: "products",
    productSingular: "product",
    price: "Price",
    priceDA: "Price",
    quantity: "Quantity",
    weight: "Weight",
    weightKg: "Weight (kg)",
    description: "Description",
    actions: "Actions",
    addProduct: "Add Product",
    loading: "Loading products...",
    noProducts: "No products yet",
    noProductsFound: "No products found",
    addFirst: "Add your first product to begin.",
    tryAnother: "Try another search term.",
    noDescription: "No description",
    newProduct: "NEW PRODUCT",
    editProduct: "EDIT PRODUCT",
    addProductTitle: "Add Product",
    editProductTitle: "Edit Product",
    name: "Name",
    required: "Required",
    optional: "Optional",
    saving: "Saving...",
    saveChanges: "Save Changes",
    createProduct: "Create Product",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    deleteProduct: "Delete Product",
    deleteQuestion: "Are you sure you want to delete this product?",
    deleteWarning:
      "This action cannot be undone. Products used in business history cannot be deleted.",
    deleting: "Deleting...",
    confirmDelete: "Delete Product",
    close: "Close",
    kg: "kg",
    nameRequired: "Product name is required.",
    priceRequired: "Product price is required.",
    quantityRequired: "Product quantity is required.",
    weightRequired: "Product weight is required.",
    invalidPrice: "Product price must be a valid number.",
    invalidQuantity: "Product quantity must be a valid number.",
    invalidWeight: "Product weight must be a valid number.",
    negativePrice: "Product price cannot be negative.",
    negativeQuantity: "Product quantity cannot be negative.",
    negativeWeight: "Product weight cannot be negative.",
    failedLoad: "Failed to load products.",
    productNotFound: "Product not found.",
    duplicate: "A product with this name already exists.",
    totalProducts: "Total Products",
    totalProductsSub: "Active products",
    totalStock: "Total Stock",
    totalStockSub: "Total weight",
    averagePrice: "Remaining Products Value",
    averagePriceSub: "Current stock value",
    lowStock: "Low Stock",
    lowStockSub: "Out of stock",
    allProducts: "All Products",
    sortBy: "Sort by",
    sortName: "Name",
    sortPrice: "Price",
    sortQuantity: "Quantity",
    showing: "Showing",
    to: "to",
    of: "of",
    paginationPrev: "Previous",
    paginationNext: "Next",
    taxProfile: "Tax Profile",
    notConfigured: "Not configured",
    selectTaxProfile: "Select tax profile",
    taxProfileHelp: "Product tax overrides seller default",
  },

  fr: {
    title: "Produits",
    subtitle: "Gérer les produits, les quantités en stock, les prix et les poids.",
    search: "Rechercher des produits...",
    searchPlaceholder: "Rechercher par nom, description...",
    product: "Produit",
    products: "produits",
    productSingular: "produit",
    price: "Prix",
    priceDA: "Prix",
    quantity: "Quantité",
    weight: "Poids",
    weightKg: "Poids (kg)",
    description: "Description",
    actions: "Actions",
    addProduct: "Ajouter un produit",
    loading: "Chargement des produits...",
    noProducts: "Aucun produit pour le moment",
    noProductsFound: "Aucun produit trouvé",
    addFirst: "Ajoutez votre premier produit pour commencer.",
    tryAnother: "Essayez un autre terme de recherche.",
    noDescription: "Aucune description",
    newProduct: "NOUVEAU PRODUIT",
    editProduct: "MODIFIER LE PRODUIT",
    addProductTitle: "Ajouter un produit",
    editProductTitle: "Modifier le produit",
    name: "Nom",
    required: "Obligatoire",
    optional: "Facultatif",
    saving: "Enregistrement...",
    saveChanges: "Enregistrer les modifications",
    createProduct: "Créer le produit",
    cancel: "Annuler",
    edit: "Modifier",
    delete: "Supprimer",
    deleteProduct: "Supprimer le produit",
    deleteQuestion: "Voulez-vous vraiment supprimer ce produit ?",
    deleteWarning:
      "Cette action est irréversible. Les produits utilisés dans l'historique métier ne peuvent pas être supprimés.",
    deleting: "Suppression...",
    confirmDelete: "Supprimer le produit",
    close: "Fermer",
    kg: "kg",
    nameRequired: "Le nom du produit est obligatoire.",
    priceRequired: "Le prix du produit est obligatoire.",
    quantityRequired: "La quantité du produit est obligatoire.",
    weightRequired: "Le poids du produit est obligatoire.",
    invalidPrice: "Le prix du produit doit être un nombre valide.",
    invalidQuantity: "La quantité du produit doit être un nombre valide.",
    invalidWeight: "Le poids du produit doit être un nombre valide.",
    negativePrice: "Le prix du produit ne peut pas être négatif.",
    negativeQuantity: "La quantité du produit ne peut pas être négative.",
    negativeWeight: "Le poids du produit ne peut pas être négatif.",
    failedLoad: "Échec du chargement des produits.",
    productNotFound: "Produit introuvable.",
    duplicate: "Un produit portant ce nom existe déjà.",
    totalProducts: "Total Produits",
    totalProductsSub: "Produits actifs",
    totalStock: "Stock Total",
    totalStockSub: "Poids total",
    averagePrice: "Valeur du stock restant",
    averagePriceSub: "Valeur actuelle du stock",
    lowStock: "Stock Faible",
    lowStockSub: "Rupture",
    allProducts: "Tous les produits",
    sortBy: "Trier par",
    sortName: "Nom",
    sortPrice: "Prix",
    sortQuantity: "Quantité",
    showing: "Affichage de",
    to: "à",
    of: "sur",
    paginationPrev: "Précédent",
    paginationNext: "Suivant",
    taxProfile: "Profil fiscal",
    notConfigured: "Non configuré",
    selectTaxProfile: "Sélectionner le profil fiscal",
    taxProfileHelp: "La taxe produit remplace le défaut vendeur",
  },

  ar: {
    title: "المنتجات",
    subtitle: "إدارة المنتجات وكميات المخزون والأسعار والأوزان.",
    search: "البحث عن المنتجات...",
    searchPlaceholder: "البحث بالاسم أو الوصف...",
    product: "السلعة",
    products: "سلع",
    productSingular: "سلعة",
    price: "السعر",
    priceDA: "السعر",
    quantity: "الكمية",
    weight: "الوزن",
    weightKg: "الوزن (كغ)",
    description: "الوصف",
    actions: "الإجراءات",
    addProduct: "إضافة سلعة",
    loading: "جارٍ تحميل السلع...",
    noProducts: "لا توجد سلع بعد",
    noProductsFound: "لم يتم العثور على سلع",
    addFirst: "أضف أول سلعة للبدء.",
    tryAnother: "جرّب مصطلح بحث آخر.",
    noDescription: "لا يوجد وصف",
    newProduct: "سلعة جديدة",
    editProduct: "تعديل السلعة",
    addProductTitle: "إضافة سلعة",
    editProductTitle: "تعديل السلعة",
    name: "الاسم",
    required: "مطلوب",
    optional: "اختياري",
    saving: "جارٍ الحفظ...",
    saveChanges: "حفظ التغييرات",
    createProduct: "إنشاء السلعة",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    deleteProduct: "حذف السلعة",
    deleteQuestion: "هل أنت متأكد من رغبتك في حذف هذه السلعة؟",
    deleteWarning:
      "لا يمكن التراجع عن هذا الإجراء. لا يمكن حذف السلع المستخدمة في السجل التجاري.",
    deleting: "جارٍ الحذف...",
    confirmDelete: "حذف السلعة",
    close: "إغلاق",
    kg: "كغ",
    nameRequired: "اسم السلعة مطلوب.",
    priceRequired: "سعر السلعة مطلوب.",
    quantityRequired: "كمية السلعة مطلوبة.",
    weightRequired: "وزن السلعة مطلوب.",
    invalidPrice: "يجب أن يكون سعر السلعة رقماً صالحاً.",
    invalidQuantity: "يجب أن تكون كمية السلعة رقماً صالحاً.",
    invalidWeight: "يجب أن يكون وزن السلعة رقماً صالحاً.",
    negativePrice: "لا يمكن أن يكون سعر السلعة سالباً.",
    negativeQuantity: "لا يمكن أن تكون كمية السلعة سالبة.",
    negativeWeight: "لا يمكن أن يكون وزن السلعة سالباً.",
    failedLoad: "فشل تحميل السلع.",
    productNotFound: "السلعة غير موجودة.",
    duplicate: "توجد سلعة بهذا الاسم بالفعل.",
    totalProducts: "إجمالي السلع",
    totalProductsSub: "سلع نشطة",
    totalStock: "إجمالي المخزون",
    totalStockSub: "الوزن الإجمالي",
    averagePrice: "قيمة المنتجات المتبقية",
    averagePriceSub: "قيمة المخزون الحالية",
    lowStock: "مخزون منخفض",
    lowStockSub: "نفاد المخزون",
    allProducts: "جميع السلع",
    sortBy: "ترتيب حسب",
    sortName: "الاسم",
    sortPrice: "السعر",
    sortQuantity: "الكمية",
    showing: "عرض",
    to: "إلى",
    of: "من",
    paginationPrev: "السابق",
    paginationNext: "التالي",
    taxProfile: "الملف الضريبي",
    notConfigured: "غير محدد",
    selectTaxProfile: "اختر الملف الضريبي",
    taxProfileHelp: "ضريبة المنتج تتقدم على الضريبة الافتراضية للبائع",
  },
} as const;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "price" | "quantity">("name");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>(
    DEFAULT_SETTINGS.language,
  );
  const [currency, setCurrency] = useState<Currency>(
    DEFAULT_SETTINGS.currency,
  );

  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const weightRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const t = TRANSLATIONS[language];

  const [taxProfiles, setTaxProfiles] = useState<InvoiceTaxProfile[]>([]);

  const taxProfileOptions = useMemo(() => {
    const enabled = taxProfiles.filter((tp) => tp.enabled === true);
    const opts: { value: string; label: string }[] = [
      { value: "", label: t.notConfigured },
    ];
    for (const tp of enabled) {
      opts.push({ value: tp.id, label: tp.name });
    }
    return opts;
  }, [taxProfiles, t.notConfigured]);

  async function loadTaxProfiles() {
    try {
      const all = await invoiceTaxProfileService.getAll();
      setTaxProfiles(all);
    } catch {
      setTaxProfiles([]);
    }
  }

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

  async function loadProducts() {
    setLoading(true);

    try {
      setProducts(await productService.getAll());
    } catch {
      setError(t.failedLoad);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
    void loadProducts();
    void loadTaxProfiles();

    const handleSettingsChange = () => {
      void loadSettings();
    };

    window.addEventListener(SETTINGS_EVENT, handleSettingsChange);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsChange);
    };
  }, []);

  useDbSync(() => {
    void loadProducts();
    void loadTaxProfiles();
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    let result = products;
    if (query) {
      result = products.filter((product) =>
        [
          product.name,
          product.description,
          String(product.price),
          String(product.quantity),
          String(product.weightKg),
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query),
          ),
      );
    }

    const sorted = [...result].sort((a, b) => {
      if (sortBy === "price") return a.price - b.price;
      if (sortBy === "quantity") return a.quantity - b.quantity;
      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [products, search, sortBy]);

  // Summary metrics — derived from existing data, no invented business rules
  const totalProducts = products.length;
  const totalStockKg = useMemo(
    () => products.reduce((sum, p) => sum + (Number(p.weightKg) || 0), 0),
    [products],
  );
  const remainingProductsValue = useMemo(
    () => products.reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.price) || 0), 0),
    [products],
  );
  const lowStockCount = useMemo(
    () => products.filter((p) => Number(p.quantity) === 0).length,
    [products],
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);

    setForm({
      name: product.name,
      price: String(product.price),
      quantity: String(product.quantity),
      weightKg: String(product.weightKg),
      description: product.description ?? "",
      taxProfileId: product.taxProfileId ?? "",
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

  function validateForm() {
    if (!form.name.trim()) return t.nameRequired;
    if (!form.price.trim()) return t.priceRequired;
    if (!form.quantity.trim()) return t.quantityRequired;
    if (!form.weightKg.trim()) return t.weightRequired;

    const price = Number(form.price);
    const quantity = Number(form.quantity);
    const weightKg = Number(form.weightKg);

    if (!Number.isFinite(price)) return t.invalidPrice;
    if (!Number.isFinite(quantity)) return t.invalidQuantity;
    if (!Number.isFinite(weightKg)) return t.invalidWeight;

    if (price < 0) return t.negativePrice;
    if (quantity < 0) return t.negativeQuantity;
    if (weightKg < 0) return t.negativeWeight;

    return "";
  }

  async function saveProduct() {
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const input: any = {
        name: form.name.trim(),
        price: Number(form.price),
        quantity: Number(form.quantity),
        weightKg: Number(form.weightKg),
        description: form.description.trim() || undefined,
        taxProfileId: form.taxProfileId?.trim() || undefined,
      };
      // For edit, "Not configured" must explicitly clear taxProfileId with undefined/null handling in operation (null sentinel)
      // For create, undefined means no profile (field absent)
      if (editingId) {
        await productEditOperation.edit({ productId: editingId, ...input, taxProfileId: form.taxProfileId?.trim() || undefined });
      } else {
        await productService.create(input);
      }

      await loadProducts();
      closeForm();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "";

      setError(
        message.includes("already exists")
          ? t.duplicate
          : message || t.failedLoad,
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!deleteTarget) return;
    if (deleteStartRef.current !== null) {
      const elapsed = Date.now() - deleteStartRef.current;
      if (elapsed < 3500) return;
    } else if (!deleteReady) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      await productDeleteOperation.delete(deleteTarget.id);

      setProducts((current) =>
        current.filter(
          (product) => product.id !== deleteTarget.id,
        ),
      );

      setDeleteTarget(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t.failedLoad,
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell activePage="products" showHeader={false}>
      <main className={styles.productsPage}>
        {/* Unified Products header */}
        <section className={styles.productsHeader}>
          <div className={styles.productsHeaderBrand}>
            <div className={styles.productsLogo}>
              <img src="/chicken.jpg" alt="" />
            </div>
            <div className={styles.productsTitle}>
              <h1>{t.title}</h1>
              <p>{t.subtitle}</p>
            </div>
          </div>

          <div className={styles.searchBox}>
            <span className={styles.searchIcon} aria-hidden="true">
              <Search size={18} strokeWidth={2} aria-hidden="true" />
            </span>

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder={t.searchPlaceholder}
              aria-label={t.search}
            />
          </div>

          <SortDropdown value={sortBy} onChange={setSortBy} t={t} />

          <button
            type="button"
            className={styles.primaryButton}
            onClick={openCreate}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            {t.addProduct}
          </button>
        </section>

        {/* Summary Cards */}
        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={`${styles.summaryIcon} ${styles.iconProducts}`}>
              <Package size={20} strokeWidth={2} aria-hidden="true" />
            </div>
            <div className={styles.summaryContent}>
              <span className={styles.summaryLabel}>{t.totalProducts}</span>
              <strong className={styles.summaryValue}>{totalProducts}</strong>
              <small className={styles.summarySub}>{t.totalProductsSub}</small>
            </div>
          </div>

          <div className={styles.summaryCard}>
            <div className={`${styles.summaryIcon} ${styles.iconStock}`}>
              <Boxes size={20} strokeWidth={2} aria-hidden="true" />
            </div>
            <div className={styles.summaryContent}>
              <span className={styles.summaryLabel}>{t.totalStock}</span>
              <strong className={styles.summaryValue}>
                {totalStockKg.toLocaleString(language === "ar" ? "ar-DZ-u-nu-latn" : language === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 2, numberingSystem: "latn" } as any)} {t.kg}
              </strong>
              <small className={styles.summarySub}>{t.totalStockSub}</small>
            </div>
          </div>

          <div className={styles.summaryCard}>
            <div className={`${styles.summaryIcon} ${styles.iconPrice}`}>
              <Banknote size={20} strokeWidth={2} aria-hidden="true" />
            </div>
            <div className={styles.summaryContent}>
              <span className={styles.summaryLabel}>{t.averagePrice}</span>
              <strong className={styles.summaryValue}>
                {formatCurrency(remainingProductsValue, currency)}
              </strong>
              <small className={styles.summarySub}>{t.averagePriceSub}</small>
            </div>
          </div>

          <div className={styles.summaryCard}>
            <div className={`${styles.summaryIcon} ${styles.iconLow}`}>
              <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
            </div>
            <div className={styles.summaryContent}>
              <span className={styles.summaryLabel}>{t.lowStock}</span>
              <strong className={styles.summaryValue}>{lowStockCount}</strong>
              <small className={styles.summarySub}>{t.lowStockSub}</small>
            </div>
          </div>
        </section>

        {error && !showForm && !deleteTarget && (
          <div className={styles.errorBanner}>
            {error}
          </div>
        )}

        <section className={styles.productsSection}>
          <div className={styles.tableContainer}>
            <div className={styles.tableHeader} role="row">
              <span className={styles.thProduct}>{t.product}</span>
              <span className={styles.thPrice}>{`${t.price} (${currency})`}</span>
              <span className={styles.thQuantity}>{t.quantity}</span>
              <span className={styles.thWeight}>{t.weightKg}</span>
              <span className={styles.thActions}>{t.actions}</span>
            </div>

            {loading ? (
              <section className={styles.statePanel}>
                <div className={styles.stateIcon} aria-hidden="true">
                  <Package size={32} strokeWidth={2} />
                </div>
                <h2>{t.loading}</h2>
              </section>
            ) : filteredProducts.length === 0 ? (
              <section className={styles.statePanel}>
                <div className={styles.stateIcon} aria-hidden="true">
                  <Package size={32} strokeWidth={2} />
                </div>

                <h2>
                  {products.length === 0
                    ? t.noProducts
                    : t.noProductsFound}
                </h2>

                <p>
                  {products.length === 0
                    ? t.addFirst
                    : t.tryAnother}
                </p>

                {products.length === 0 && (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={openCreate}
                  >
                    <Plus size={16} strokeWidth={2} aria-hidden="true" />
                    {t.addProduct}
                  </button>
                )}
              </section>
            ) : (
              <div className={styles.tableBody}>
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className={styles.tableRow}
                    role="row"
                    onDoubleClick={() => openEdit(product)}
                  >

                    <span className={styles.tdProduct}>
                      <span className={styles.productIcon} aria-hidden="true">
                        <Package size={18} strokeWidth={2} />
                      </span>
                      <span className={styles.productInfo}>
                        <strong>{product.name}</strong>
                        <small>{product.description || t.noDescription}</small>
                      </span>
                    </span>

                    <span className={styles.tdPrice}>
                      {formatCurrency(product.price, currency)}
                    </span>

                    <span className={styles.tdQuantity}>{product.quantity}</span>

                    <span className={styles.tdWeight}>
                      {(Number(product.weightKg) || 0).toFixed(2)}
                    </span>

                    <span className={styles.tdActions}>
                      <button
                        type="button"
                        className={styles.rowEditButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(product);
                        }}
                        aria-label={`${t.edit} ${product.name}`}
                      >
                        <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                        {t.edit}
                      </button>

                      <button
                        type="button"
                        className={styles.rowDeleteButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          setError("");
                          setDeleteTarget(product);
                        }}
                        aria-label={`${t.delete} ${product.name}`}
                      >
                        <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                        {t.delete}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {showForm && (
          <div className={styles.modalBackdrop}>
            <section
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-form-title"
            >
              <div className={styles.modalHeader}>
                <h2 id="product-form-title">
                  {editingId ? t.editProductTitle : t.addProductTitle}
                </h2>

                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={closeForm}
                  disabled={saving}
                  aria-label={t.close}
                >
                  <X size={18} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.form}>
                <label>
                  <span>
                    {t.name}{" "}
                    <small>{t.required}</small>
                  </span>

                  <input
                    ref={nameRef}
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        priceRef.current?.focus();
                      }
                    }}
                    autoFocus
                  />
                </label>

                <div className={styles.formGrid}>
                  <label>
                    <span>
                      {t.price}{" "}
                      <small>{t.required}</small>
                    </span>

                    <div className={styles.inputWithSuffix}>
                      <input
                        ref={priceRef}
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.price}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            price: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            quantityRef.current?.focus();
                          }
                        }}
                      />

                      <span>{currency}</span>
                    </div>
                  </label>

                  <label>
                    <span>
                      {t.quantity}{" "}
                      <small>{t.required}</small>
                    </span>

                    <input
                      ref={quantityRef}
                      type="number"
                      min="0"
                      step="1"
                      value={form.quantity}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          quantity: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          weightRef.current?.focus();
                        }
                      }}
                    />
                  </label>

                  <label>
                    <span>
                      {t.weight}{" "}
                      <small>{t.required}</small>
                    </span>

                    <div className={styles.inputWithSuffix}>
                      <input
                        ref={weightRef}
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.weightKg}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            weightKg: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            descriptionRef.current?.focus();
                          }
                        }}
                      />

                      <span>{t.kg}</span>
                    </div>
                  </label>
                </div>

                <label>
                  <span>
                    {t.description}{" "}
                    <small>{t.optional}</small>
                  </span>

                  <textarea
                    ref={descriptionRef}
                    rows={4}
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  <span>
                    {t.taxProfile}{" "}
                    <small>{t.optional}</small>
                  </span>
                  <StyledSelect
                    value={form.taxProfileId}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        taxProfileId: value,
                      }))
                    }
                    options={taxProfileOptions}
                    placeholder={t.notConfigured}
                    ariaLabel={t.taxProfile}
                  />
                  <small style={{ color: "var(--muted)", fontSize: 11, fontWeight: 500 }}>{t.taxProfileHelp}</small>
                </label>

                {error && (
                  <div className={styles.formError}>
                    {error}
                  </div>
                )}

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={closeForm}
                    disabled={saving}
                  >
                    {t.cancel}
                  </button>

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={saveProduct}
                    disabled={saving}
                  >
                    {saving
                      ? t.saving
                      : editingId
                        ? t.saveChanges
                        : t.createProduct}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {deleteTarget && (
          <div className={styles.modalBackdrop}>
            <section
              className={styles.deleteModal}
              role="dialog"
              aria-modal="true"
            >
              <div className={styles.deleteIcon} aria-hidden="true">
                <AlertTriangle size={24} strokeWidth={2} />
              </div>

              <span className={styles.modalBadge}>
                {t.deleteProduct}
              </span>

              <h2>{t.deleteQuestion}</h2>

              <p>
                <strong>{deleteTarget.name}</strong>
              </p>

              <div className={styles.deleteWarning}>
                {t.deleteWarning}
              </div>

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

              {error && (
                <div className={styles.formError}>
                  {error}
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => {
                    if (deleting) return;
                    setDeleteTarget(null);
                    setError("");
                  }}
                  disabled={deleting}
                >
                  {t.cancel}
                </button>

                <button
                  type="button"
                  className={styles.deleteConfirmButton}
                  onClick={deleteProduct}
                  disabled={deleting || !deleteReady}
                >
                  {deleting
                    ? t.deleting
                    : t.confirmDelete}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function SortDropdown({
  value,
  onChange,
  t,
}: {
  value: "name" | "price" | "quantity";
  onChange: (v: "name" | "price" | "quantity") => void;
  t: { sortName: string; sortPrice: string; sortQuantity: string };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const label =
    value === "price" ? t.sortPrice : value === "quantity" ? t.sortQuantity : t.sortName;

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
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
  }, []);

  return (
    <div className={styles.sortDropdown} ref={ref}>
      <button
        type="button"
        className={`${styles.sortTrigger} ${open ? styles.sortTriggerOpen : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <span className={`${styles.sortChevron} ${open ? styles.sortChevronOpen : ""}`} aria-hidden="true">
          <ChevronDown size={16} strokeWidth={2} />
        </span>
      </button>

      {open && (
        <div className={styles.sortMenu} role="listbox">
          {(
            [
              { v: "name" as const, label: t.sortName },
              { v: "price" as const, label: t.sortPrice },
              { v: "quantity" as const, label: t.sortQuantity },
            ]
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              role="option"
              aria-selected={value === opt.v}
              className={`${styles.sortOption} ${value === opt.v ? styles.sortOptionActive : ""}`}
              onClick={() => {
                onChange(opt.v);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


