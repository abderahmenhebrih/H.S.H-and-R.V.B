"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../../src/components/layout/AppShell";
import StyledSelect from "../../src/components/common/StyledSelect";
import ProtectedDeleteModal from "../../src/components/common/ProtectedDeleteModal";
import {
  FileText,
  Table2,
  Star,
  Search,
  Plus,
  FileInput,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  Pencil,
  FilePlus,
  LayoutGrid,
  Clock,
  FileStack,
  FolderArchive,
  Sparkles,
} from "lucide-react";
import { officeFileService, getBlankDocumentContent, getBlankSpreadsheetContent, getLocalizedSheetName } from "../../src/services/office-file.service";
import { settingsService } from "../../src/services/settings.service";
import { DEFAULT_SETTINGS, getDirection } from "../../src/lib/settings";
import { useDbSync } from "../../src/hooks/useDbSync";
import { resolvePlaceholdersInObject } from "../../src/lib/office/placeholder";
import type { OfficeFile, OfficeFileType } from "../../src/types/entities/office-file";
import type { Language } from "../../src/types/settings/settings";
import styles from "./page.module.css";

const T = {
  en: {
    title: "Workspace",
    subtitle: "Documents, spreadsheets and business templates.",
    new: "New",
    import: "Import",
    search: "Search files...",
    newDoc: "New Document",
    newSheet: "New Spreadsheet",
    fromTemplate: "From Template",
    recent: "Recent",
    documents: "Documents",
    spreadsheets: "Spreadsheets",
    templates: "Templates",
    archived: "Archived",
    favorites: "Favorites",
    all: "All",
    noFiles: "No files yet",
    noFilesDesc: "Create your first document or spreadsheet.",
    createDoc: "New Document",
    createSheet: "New Spreadsheet",
    open: "Open",
    rename: "Rename",
    duplicate: "Duplicate",
    archive: "Archive",
    restore: "Restore",
    delete: "Delete",
    favorite: "Favorite",
    unfavorite: "Unfavorite",
    lastModified: "Modified",
    lastOpened: "Opened",
    linked: "Linked",
    templateBlankDoc: "Blank Document",
    templateBlankSheet: "Blank Spreadsheet",
    templateCustomerNotice: "Customer Balance Notice",
    templateSupplierLetter: "Supplier Letter",
    templateEmployeeAttestation: "Employee Attestation",
    templateMonthlySales: "Monthly Sales Analysis",
    createTitle: "Create new file",
    titleLabel: "Title",
    cancel: "Cancel",
    create: "Create",
    renameTitle: "Rename file",
    save: "Save",
    deleteTitle: "Delete this file?",
    deleteDesc: "This will permanently remove the file and its sync history.",
    searchPlaceholder: "Search title, tags, linked entity...",
    importDesc: "Import Document (txt/html) or Spreadsheet (CSV)",
    saving: "Saving...",
    saved: "Saved",
    offline: "Offline",
    untitledDoc: "Untitled Document",
    untitledSheet: "Untitled Spreadsheet",
    copyOf: "Copy of",
  },
  fr: {
    title: "Espace de travail",
    subtitle: "Documents, tableurs et modèles d'entreprise.",
    new: "Nouveau",
    import: "Importer",
    search: "Rechercher...",
    newDoc: "Nouveau Document",
    newSheet: "Nouveau Tableur",
    fromTemplate: "À partir d'un modèle",
    recent: "Récents",
    documents: "Documents",
    spreadsheets: "Tableurs",
    templates: "Modèles",
    archived: "Archivés",
    favorites: "Favoris",
    all: "Tous",
    noFiles: "Aucun fichier",
    noFilesDesc: "Créez votre premier document ou tableur.",
    createDoc: "Nouveau Document",
    createSheet: "Nouveau Tableur",
    open: "Ouvrir",
    rename: "Renommer",
    duplicate: "Dupliquer",
    archive: "Archiver",
    restore: "Restaurer",
    delete: "Supprimer",
    favorite: "Favori",
    unfavorite: "Retirer favori",
    lastModified: "Modifié",
    lastOpened: "Ouvert",
    linked: "Lié",
    templateBlankDoc: "Document vierge",
    templateBlankSheet: "Tableur vierge",
    templateCustomerNotice: "Avis solde client",
    templateSupplierLetter: "Lettre fournisseur",
    templateEmployeeAttestation: "Attestation employé",
    templateMonthlySales: "Analyse ventes mensuelle",
    createTitle: "Créer un fichier",
    titleLabel: "Titre",
    cancel: "Annuler",
    create: "Créer",
    renameTitle: "Renommer le fichier",
    save: "Enregistrer",
    deleteTitle: "Supprimer ce fichier ?",
    deleteDesc: "Cela supprimera définitivement le fichier.",
    searchPlaceholder: "Rechercher titre, tags, entité liée...",
    importDesc: "Importer Document (txt/html) ou Tableur (CSV)",
    saving: "Enregistrement...",
    saved: "Enregistré",
    offline: "Hors ligne",
    untitledDoc: "Document sans titre",
    untitledSheet: "Tableur sans titre",
    copyOf: "Copie de",
  },
  ar: {
    title: "مساحة العمل",
    subtitle: "المستندات وجداول البيانات والقوالب المهنية.",
    new: "جديد",
    import: "استيراد",
    search: "بحث...",
    newDoc: "مستند جديد",
    newSheet: "جدول جديد",
    fromTemplate: "من قالب",
    recent: "الأخيرة",
    documents: "المستندات",
    spreadsheets: "جداول البيانات",
    templates: "القوالب",
    archived: "المؤرشف",
    favorites: "المفضلة",
    all: "الكل",
    noFiles: "لا توجد ملفات",
    noFilesDesc: "أنشئ أول مستند أو جدول.",
    createDoc: "مستند جديد",
    createSheet: "جدول جديد",
    open: "فتح",
    rename: "إعادة تسمية",
    duplicate: "تكرار",
    archive: "أرشفة",
    restore: "استعادة",
    delete: "حذف",
    favorite: "مفضل",
    unfavorite: "إلغاء التفضيل",
    lastModified: "تعديل",
    lastOpened: "فتح",
    linked: "مرتبط",
    templateBlankDoc: "مستند فارغ",
    templateBlankSheet: "جدول فارغ",
    templateCustomerNotice: "إشعار رصيد العميل",
    templateSupplierLetter: "رسالة مورد",
    templateEmployeeAttestation: "شهادة موظف",
    templateMonthlySales: "تحليل المبيعات الشهري",
    createTitle: "إنشاء ملف",
    titleLabel: "العنوان",
    cancel: "إلغاء",
    create: "إنشاء",
    renameTitle: "إعادة تسمية الملف",
    save: "حفظ",
    deleteTitle: "حذف هذا الملف؟",
    deleteDesc: "سيتم حذفه نهائياً.",
    searchPlaceholder: "بحث بالعنوان أو الوسوم أو الكيان...",
    importDesc: "استيراد مستند (txt/html) أو جدول (CSV)",
    saving: "جاري الحفظ...",
    saved: "تم الحفظ",
    offline: "غير متصل",
    untitledDoc: "مستند بدون عنوان",
    untitledSheet: "جدول بدون عنوان",
    copyOf: "نسخة من",
  },
} as const;

type Tab = "recent" | "documents" | "spreadsheets" | "templates" | "archived";

function getTemplateContent(id: string, lang: Language): any {
  if (id === "tpl-customer-notice") {
    const title = lang==="fr"?"Avis de solde client": lang==="ar"?"إشعار رصيد الزبون":"Customer Balance Notice";
    return { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] }, { type: "paragraph", content: [{ type: "text", text: "Date: {{today}}  Currency: {{currency}}" }] }, { type: "paragraph", content: [{ type: "text", text: "Customer: {{customer.name}}  Balance: {{customer.balance}}" }] }] };
  }
  if (id === "tpl-supplier-letter") {
    const title = lang==="fr"?"Lettre fournisseur": lang==="ar"?"رسالة المورد":"Supplier Letter";
    return { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] }, { type: "paragraph", content: [{ type: "text", text: "Supplier: {{supplier.name}}  Balance: {{supplier.balance}}" }] }] };
  }
  if (id === "tpl-employee-att") {
    const title = lang==="fr"?"Attestation de travail": lang==="ar"?"شهادة العمل":"Attestation";
    return { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] }, { type: "paragraph", content: [{ type: "text", text: "Worker: {{worker.name}}  Starting Salary: {{worker.startingSalary}}  Monthly Salary: {{worker.monthlySalary}}" }] }] };
  }
  if (id === "tpl-monthly-sales") {
    const month = lang==="fr"?"Mois": lang==="ar"?"الشهر":"Month";
    const sales = lang==="fr"?"Ventes": lang==="ar"?"المبيعات":"Sales";
    const total = lang==="fr"?"Total": lang==="ar"?"المجموع":"Total";
    const sheetName = lang==="fr"?"Ventes": lang==="ar"?"المبيعات":"Sales";
    return { sheets: [{ id: "sheet-1", name: sheetName, data: { "0,0": { v: month }, "0,1": { v: sales }, "0,2": { v: total }, "1,0": { v: lang==="fr"?"Janv": lang==="ar"?"يناير":"Jan" }, "1,1": { v: 12000 }, "2,0": { v: lang==="fr"?"Févr": lang==="ar"?"فبراير":"Feb" }, "2,1": { v: 15000 } }, rowCount: 50, colCount: 10 }], activeSheetId: "sheet-1" };
  }
  return null;
}
const TEMPLATE_DEFS: Array<{ id: string; type: OfficeFileType; titleKey: keyof typeof T.en; description: string; content: any }> = [
  { id: "tpl-blank-doc", type: "document", titleKey: "templateBlankDoc", description: "Empty document", content: null },
  { id: "tpl-blank-sheet", type: "spreadsheet", titleKey: "templateBlankSheet", description: "Empty workbook", content: null },
  { id: "tpl-customer-notice", type: "document", titleKey: "templateCustomerNotice", description: "Balance notice with placeholders", content: null },
  { id: "tpl-supplier-letter", type: "document", titleKey: "templateSupplierLetter", description: "Formal supplier letter", content: null },
  { id: "tpl-employee-att", type: "document", titleKey: "templateEmployeeAttestation", description: "Work attestation", content: null },
  { id: "tpl-monthly-sales", type: "spreadsheet", titleKey: "templateMonthlySales", description: "Sales analysis with sample table", content: null },
];
function templateDescription(id: string, lang: Language): string {
  const map: Record<string, Record<Language,string>> = {
    "tpl-blank-doc": { en: "Empty document", fr: "Document vide", ar: "مستند فارغ" },
    "tpl-blank-sheet": { en: "Empty workbook", fr: "Classeur vide", ar: "مصنف فارغ" },
    "tpl-customer-notice": { en: "Balance notice with placeholders", fr: "Avis de solde avec espaces réservés", ar: "إشعار الرصيد مع العناصر النائبة" },
    "tpl-supplier-letter": { en: "Formal supplier letter", fr: "Lettre fournisseur formelle", ar: "رسالة المورد الرسمية" },
    "tpl-employee-att": { en: "Work attestation", fr: "Attestation de travail", ar: "شهادة العمل" },
    "tpl-monthly-sales": { en: "Sales analysis with sample table", fr: "Analyse des ventes avec tableau exemple", ar: "تحليل المبيعات مع جدول نموذجي" },
  };
  return map[id]?.[lang] || map[id]?.en || "";
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === '\r') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        if (next === '\n') i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

export default function OfficePage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [files, setFiles] = useState<OfficeFile[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("recent");
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showCreate, setShowCreate] = useState<null | OfficeFileType>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createTemplateId, setCreateTemplateId] = useState<string | null>(null);
  const [renameFile, setRenameFile] = useState<OfficeFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteFile, setDeleteFile] = useState<OfficeFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(()=>{ if(!toast) return; const id=setTimeout(()=>setToast(null), 3000); return ()=>clearTimeout(id); }, [toast]);

  const t = T[language];
  const dir = getDirection(language);

  useEffect(() => {
    async function loadLang() {
      const s = await settingsService.get();
      setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
    }
    void loadLang();
    const h = () => void loadLang();
    window.addEventListener("hebrih-settings-change", h as any);
    return () => window.removeEventListener("hebrih-settings-change", h as any);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }, [language, dir]);

  async function loadFiles() {
    try {
      const all = await officeFileService.getAll();
      setFiles(all);
    } catch (e) { console.error(e); }
  }
  useEffect(() => { void loadFiles(); }, []);
  useDbSync(() => { void loadFiles(); }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) setShowNewMenu(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (!q) return true;
      const hay = `${f.title} ${(f.tags||[]).join(" ")} ${(f.linkedEntities||[]).map((l)=>l.labelSnapshot).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [files, search]);

  const recentFiles = useMemo(() => {
    return [...filtered].filter((f)=>!f.isArchived && !f.deletedAt && !f.isFavorite).sort((a,b)=> (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt)).slice(0, 12);
  }, [filtered]);

  const docs = useMemo(() => filtered.filter((f)=>f.type==="document" && !f.isArchived), [filtered]);
  const sheets = useMemo(() => filtered.filter((f)=>f.type==="spreadsheet" && !f.isArchived), [filtered]);
  const archived = useMemo(() => filtered.filter((f)=> !!f.isArchived), [filtered]);
  const favorites = useMemo(() => filtered.filter((f)=> !!f.isFavorite && !f.isArchived), [filtered]);

  const kpis = {
    docs: docs.length,
    sheets: sheets.length,
    recent: recentFiles.length,
    archived: archived.length,
  };

  const [creating, setCreating] = useState(false);
  async function handleCreate(type: OfficeFileType) {
    if (creating) return;
    const title = createTitle.trim() || (type==="document" ? t.untitledDoc : t.untitledSheet);
    setCreating(true);
    try {
      let content: any = undefined;
      let templateId: string | undefined = createTemplateId ?? undefined;
      if (createTemplateId) {
        const tpl = TEMPLATE_DEFS.find((x)=>x.id===createTemplateId);
        if (tpl) {
          let langContent = getTemplateContent(tpl.id, language);
          if (!langContent && tpl.content) langContent = tpl.content;
          if (!langContent) langContent = tpl.type==="document" ? getBlankDocumentContent() : getBlankSpreadsheetContent(language);
          // Resolve placeholders recursively for production path
          try {
            const settings = await settingsService.get();
            const currency = settings?.currency ?? "DA";
            const ctx: any = { language, currency };
            // For entity-requiring templates, fetch a representative entity to resolve
            if (tpl.id === "tpl-customer-notice") {
              try { const { customerService } = await import("../../src/services/customer.service"); const list = await customerService.getAll(); if (list[0]) ctx.customer = list[0]; } catch {}
            } else if (tpl.id === "tpl-supplier-letter") {
              try { const { supplierService } = await import("../../src/services/supplier.service"); const list = await supplierService.getAll(); if (list[0]) ctx.supplier = list[0]; } catch {}
            } else if (tpl.id === "tpl-employee-att") {
              try { const { workerService } = await import("../../src/services/worker.service"); const list = await workerService.getAll(); if (list[0]) ctx.worker = list[0]; } catch {}
            }
            content = resolvePlaceholdersInObject(langContent, ctx);
          } catch { content = langContent; }
          templateId = tpl.id;
        }
      } else {
        content = type==="document" ? getBlankDocumentContent() : getBlankSpreadsheetContent(language);
        try {
          const settings = await settingsService.get();
          const currency = settings?.currency ?? "DA";
          content = resolvePlaceholdersInObject(content, { language, currency } as any);
        } catch {}
      }
      const created = await officeFileService.create({ type, title, content, templateId } as any);
      setShowCreate(null);
      setCreateTitle("");
      setCreateTemplateId(null);
      await loadFiles();
      router.push(type==="document" ? `/office/document/${created.id}` : `/office/spreadsheet/${created.id}`);
    } catch (e) { console.error(e); setToast(e instanceof Error ? e.message : String(e)); }
    finally { setCreating(false); }
  }

  async function handleRename() {
    if (!renameFile) return;
    const v = renameValue.trim();
    if (!v) return;
    try {
      await officeFileService.update(renameFile.id, { title: v });
      setRenameFile(null);
      setRenameValue("");
      await loadFiles();
    } catch (e) { console.error(e); setToast(e instanceof Error ? e.message : String(e)); }
  }

  async function handleDuplicate(f: OfficeFile) {
    try {
      await officeFileService.duplicate(f.id);
      await loadFiles();
    } catch (e) { console.error(e); setToast(e instanceof Error ? e.message : String(e)); }
  }

  async function handleArchive(f: OfficeFile, archivedFlag: boolean) {
    try { await officeFileService.archive(f.id, archivedFlag); await loadFiles(); } catch(e){console.error(e); setToast(e instanceof Error ? e.message : String(e));}
  }

  async function handleFavorite(f: OfficeFile) {
    try { await officeFileService.toggleFavorite(f.id); await loadFiles(); } catch(e){console.error(e); setToast(e instanceof Error ? e.message : String(e));}
  }

  async function handleDeleteConfirm() {
    if (!deleteFile || deleting) return;
    setDeleting(true);
    try {
      await officeFileService.deletePermanent(deleteFile.id);
      setDeleteFile(null);
      await loadFiles();
    } catch(e){ console.error(e); setToast(e instanceof Error ? e.message : String(e)); } finally{ setDeleting(false);}
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (file.type.includes("text") || ext==="txt" || ext==="html") {
        const text = await file.text();
        // Sanitize via DOMPurify if html
        let content: any;
        if (ext==="html") {
          const { default: DOMPurify } = await import("dompurify");
          const clean = DOMPurify.sanitize(text);
          // Convert to Tiptap JSON via simple paragraph split (full HTML parsing deferred)
          const paragraphs = clean.split(/<p[^>]*>|<\/p>/i).filter((s)=>s.trim().replace(/<[^>]+>/g,"").trim());
          if (paragraphs.length>0) {
            content = { type:"doc", content: paragraphs.map((p)=>({ type:"paragraph", content: [{ type:"text", text: p.replace(/<[^>]+>/g,"").trim() }]})) };
          } else {
            content = { type:"doc", content: [{ type:"paragraph", content: [{ type:"text", text: clean.replace(/<[^>]+>/g,"").slice(0,5000) }]}]};
          }
        } else {
          content = { type:"doc", content: text.split("\n").map((line)=>({ type:"paragraph", content: line? [{ type:"text", text: line }]: [] })) };
        }
        const created = await officeFileService.create({ type:"document", title: file.name.replace(/\.[^/.]+$/,""), content } as any);
        await loadFiles();
        router.push(`/office/document/${created.id}`);
      } else if (ext==="csv") {
        const text = await file.text();
        const rows = parseCSV(text);
        const sheets = [{ id:"sheet-1", name:"Imported", data: {} as any, rowCount: rows.length, colCount: rows.length ? Math.max(...rows.map((r)=>r.length)) : 0 }];
        rows.forEach((row, rIdx)=> row.forEach((cell,cIdx)=> { sheets[0].data[`${rIdx},${cIdx}`] = { v: cell }; }));
        const content = { sheets, activeSheetId:"sheet-1" };
        const created = await officeFileService.create({ type:"spreadsheet", title: file.name.replace(/\.[^/.]+$/,""), content } as any);
        await loadFiles();
        router.push(`/office/spreadsheet/${created.id}`);
      } else if (ext==="xlsx") {
        const ExcelJSMod: any = await import("exceljs");
        const WorkbookCtor = ExcelJSMod.Workbook ?? ExcelJSMod.default?.Workbook;
        const buf = await file.arrayBuffer();
        const workbook = new WorkbookCtor();
        await workbook.xlsx.load(buf);
        const sheets = workbook.worksheets.map((ws: any, idx: number)=> {
          const data: any = {};
          let maxCol = 0;
          ws.eachRow((row: any, rowNumber: number) => {
            const r = rowNumber - 1;
            row.eachCell((cell: any, colNumber: number) => {
              const c = colNumber - 1;
              let v: string = "";
              const raw = cell.value;
              if (raw != null) {
                if (typeof raw === "object" && "text" in raw) v = String((raw as any).text ?? "");
                else if (typeof raw === "object" && "result" in raw) v = String((raw as any).result ?? "");
                else v = String(raw);
              }
              if (v !== "") data[`${r},${c}`] = { v };
              if (colNumber > maxCol) maxCol = colNumber;
            });
          });
          const rowCount = ws.rowCount || 50;
          const colCount = Math.max(maxCol, 5);
          return { id:`sheet-${idx+1}`, name: ws.name, data, rowCount, colCount };
        });
        const content = { sheets: sheets.length? sheets : [{ id:"sheet-1", name: getLocalizedSheetName(language), data:{}, rowCount:100, colCount:20 }], activeSheetId: sheets[0]?.id || "sheet-1" };
        const created = await officeFileService.create({ type:"spreadsheet", title: file.name.replace(/\.[^/.]+$/,""), content } as any);
        await loadFiles();
        router.push(`/office/spreadsheet/${created.id}`);
      } else if (ext==="xls") {
        setToast(`${file.name}: ${language==="fr"?"format xls non pris en charge — utilisez xlsx": language==="ar"?"تنسيق xls غير مدعوم — استخدم xlsx":"xls format not supported — use xlsx"}`);
      } else {
        setToast(`${file.name}: ${language==="fr"?"type non pris en charge": language==="ar"?"نوع غير مدعوم":"unsupported type"}`);
      }
    } catch(err){ console.error(err); setToast(String(err)); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatDate(ts: number) {
    try { return new Date(ts).toLocaleDateString(language==="ar" ? "ar-DZ-u-nu-latn" : language==="fr" ? "fr-FR" : "en-GB", { numberingSystem:"latn"} as any); } catch { return new Date(ts).toLocaleDateString("en-GB"); }
  }

  const displayFilesForTab = () => {
    if (tab==="recent") return recentFiles;
    if (tab==="documents") return docs;
    if (tab==="spreadsheets") return sheets;
    if (tab==="templates") return []; // templates rendered separately
    if (tab==="archived") return archived;
    return [];
  };

  return (
    <AppShell activePage="office">
      <main className={styles.officePage} dir={dir}>
        <div className={styles.officeHeader}>
          <div className={styles.officeHeaderLeft}>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <div className={styles.officeHeaderRight}>
            <div className={styles.searchField}>
              <Search size={20} strokeWidth={2} aria-hidden="true" className={styles.searchIcon} />
              <input className={styles.searchInput} type="text" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder={t.search} aria-label={t.search} />
            </div>
            <div style={{ position:"relative" }} ref={newMenuRef}>
              <button type="button" className={styles.primaryBtn} onClick={()=>setShowNewMenu((v)=>!v)}>
                <Plus size={16} strokeWidth={2} aria-hidden="true" /> {t.new}
              </button>
              {showNewMenu && (
                <div className={styles.newMenu} role="menu">
                  <button type="button" role="menuitem" onClick={()=>{ setShowNewMenu(false); setShowCreate("document"); setCreateTemplateId(null); setCreateTitle("");}}><FileText size={16} strokeWidth={2} aria-hidden="true" /> {t.newDoc}</button>
                  <button type="button" role="menuitem" onClick={()=>{ setShowNewMenu(false); setShowCreate("spreadsheet"); setCreateTemplateId(null); setCreateTitle("");}}><Table2 size={16} strokeWidth={2} aria-hidden="true" /> {t.newSheet}</button>
                  <button type="button" role="menuitem" onClick={()=>{ setShowNewMenu(false); setTab("templates");}}><Sparkles size={16} strokeWidth={2} aria-hidden="true" /> {t.fromTemplate}</button>
                </div>
              )}
            </div>
            <button type="button" className={styles.secondaryBtn} onClick={()=>fileInputRef.current?.click()}>
              <FileInput size={16} strokeWidth={2} aria-hidden="true" /> {t.import}
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.html,.csv,.xlsx" style={{ display:"none" }} onChange={handleImportFile} />
          </div>
        </div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}><div className={styles.kpiIcon}><FileText size={18} strokeWidth={2} aria-hidden="true" /></div><div className={styles.kpiText}><strong>{String(kpis.docs)}</strong><span>{t.documents}</span></div></div>
          <div className={styles.kpiCard}><div className={styles.kpiIcon}><Table2 size={18} strokeWidth={2} aria-hidden="true" /></div><div className={styles.kpiText}><strong>{String(kpis.sheets)}</strong><span>{t.spreadsheets}</span></div></div>
          <div className={styles.kpiCard}><div className={styles.kpiIcon}><Clock size={18} strokeWidth={2} aria-hidden="true" /></div><div className={styles.kpiText}><strong>{String(kpis.recent)}</strong><span>{t.recent}</span></div></div>
          <div className={styles.kpiCard}><div className={styles.kpiIcon}><FolderArchive size={18} strokeWidth={2} aria-hidden="true" /></div><div className={styles.kpiText}><strong>{String(kpis.archived)}</strong><span>{t.archived}</span></div></div>
        </div>

        <div className={styles.tabBar} role="tablist">
          {[
            { id:"recent", label:t.recent, icon: Clock },
            { id:"documents", label:t.documents, icon: FileText },
            { id:"spreadsheets", label:t.spreadsheets, icon: Table2 },
            { id:"templates", label:t.templates, icon: Sparkles },
            { id:"archived", label:t.archived, icon: FolderArchive },
          ].map((tb)=>{
            const Icon = tb.icon as any;
            const active = tab===tb.id;
            return <button key={tb.id} type="button" role="tab" aria-selected={active} className={`${styles.tab} ${active? styles.tabActive:""}`} onClick={()=>setTab(tb.id as Tab)}><Icon size={16} strokeWidth={2} aria-hidden="true" />{tb.label}</button>;
          })}
        </div>

        {tab==="templates" ? (
          <div className={styles.templateGrid}>
            {TEMPLATE_DEFS.map((tpl)=> (
              <div key={tpl.id} className={styles.templateCard} onClick={()=>{ setShowCreate(tpl.type); setCreateTemplateId(tpl.id); setCreateTitle(t[tpl.titleKey]);}} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter") { setShowCreate(tpl.type); setCreateTemplateId(tpl.id); setCreateTitle(t[tpl.titleKey]);}}}>
                <div className={styles.templateIcon}>{tpl.type==="document" ? <FileText size={18} strokeWidth={2} aria-hidden="true" /> : <Table2 size={18} strokeWidth={2} aria-hidden="true" />}</div>
                <strong style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{t[tpl.titleKey]}</strong>
                <span style={{ fontSize:11, color:"var(--muted)" }}>{templateDescription(tpl.id, language)}</span>
                <span style={{ fontSize:11, color:"var(--accent)", fontWeight:700 }}>{t.create} →</span>
              </div>
            ))}
          </div>
        ) : (
          <>
            {favorites.length>0 && tab==="recent" && (
              <div>
                <h3 style={{ margin:"8px 0 8px 2px", fontSize:12, fontWeight:800, letterSpacing:0.6, color:"var(--muted)" }}>{t.favorites}</h3>
                <div className={styles.fileGrid}>
                  {favorites.slice(0,4).map((f)=>(<FileCard key={f.id} file={f} t={t} language={language} onOpen={()=>router.push(f.type==="document"? `/office/document/${f.id}` : `/office/spreadsheet/${f.id}`)} onRename={()=>{ setRenameFile(f); setRenameValue(f.title);}} onDuplicate={()=>handleDuplicate(f)} onArchive={()=>handleArchive(f,true)} onDelete={()=>setDeleteFile(f)} onFavorite={()=>handleFavorite(f)} formatDate={formatDate} />))}
                </div>
              </div>
            )}
            {displayFilesForTab().length===0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}><FileStack size={28} strokeWidth={1.5} aria-hidden="true" /></div>
                <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:"var(--text)" }}>{t.noFiles}</h3>
                <p style={{ margin:0, fontSize:12, color:"var(--muted)", maxWidth:360 }}>{t.noFilesDesc}</p>
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button type="button" className={styles.primaryBtn} onClick={()=>{ setShowCreate("document"); setCreateTitle(""); setCreateTemplateId(null);}}><FileText size={16} strokeWidth={2} aria-hidden="true" />{t.createDoc}</button>
                  <button type="button" className={styles.secondaryBtn} onClick={()=>{ setShowCreate("spreadsheet"); setCreateTitle(""); setCreateTemplateId(null);}}><Table2 size={16} strokeWidth={2} aria-hidden="true" />{t.createSheet}</button>
                </div>
              </div>
            ) : (
              <div className={styles.fileGrid}>
                {displayFilesForTab().map((f)=> (
                  <FileCard key={f.id} file={f} t={t} language={language} onOpen={()=>{ if(tab==="archived"){ handleArchive(f,false); } else { router.push(f.type==="document"? `/office/document/${f.id}` : `/office/spreadsheet/${f.id}`);} }} onRename={()=>{ setRenameFile(f); setRenameValue(f.title);}} onDuplicate={()=>handleDuplicate(f)} onArchive={()=>handleArchive(f, tab==="archived"? false : true)} onDelete={()=>setDeleteFile(f)} onFavorite={()=>handleFavorite(f)} formatDate={formatDate} isArchivedView={tab==="archived"} />
                ))}
              </div>
            )}
          </>
        )}

        {showCreate && (
          <div className={styles.modalBackdrop} onClick={()=>setShowCreate(null)} role="presentation">
            <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e)=>e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2>{showCreate==="document"? t.newDoc : t.newSheet}</h2>
                <button type="button" className={styles.iconBtn} onClick={()=>setShowCreate(null)} aria-label={(t as any).close ?? "Close"}><Plus size={16} strokeWidth={2} style={{ transform:"rotate(45deg)"}} aria-hidden="true" /></button>
              </div>
              <label><span style={{ fontSize:11, fontWeight:700, color:"var(--muted)" }}>{t.titleLabel}</span><input value={createTitle} onChange={(e)=>setCreateTitle(e.target.value)} placeholder={showCreate==="document"? t.untitledDoc : t.untitledSheet} autoFocus /></label>
              {createTemplateId && <small style={{ fontSize:11, color:"var(--muted)" }}>Template: {createTemplateId}</small>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryBtn} onClick={()=>setShowCreate(null)} disabled={creating}>{t.cancel}</button>
                <button type="button" className={styles.primaryBtn} onClick={()=>handleCreate(showCreate)} disabled={creating}>{creating ? t.saving : t.create}</button>
              </div>
            </section>
          </div>
        )}

        {renameFile && (
          <div className={styles.modalBackdrop} onClick={()=>setRenameFile(null)} role="presentation">
            <section className={styles.modal} role="dialog" aria-modal="true" onClick={(e)=>e.stopPropagation()}>
              <div className={styles.modalHeader}><h2>{t.renameTitle}</h2><button type="button" className={styles.iconBtn} onClick={()=>setRenameFile(null)} aria-label={(t as any).close ?? "Close"}><Plus size={16} strokeWidth={2} style={{ transform:"rotate(45deg)"}} aria-hidden="true" /></button></div>
              <input value={renameValue} onChange={(e)=>setRenameValue(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") handleRename(); }} autoFocus />
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryBtn} onClick={()=>setRenameFile(null)}>{t.cancel}</button>
                <button type="button" className={styles.primaryBtn} onClick={handleRename} disabled={!renameValue.trim()}>{t.save}</button>
              </div>
            </section>
          </div>
        )}

        <ProtectedDeleteModal
          isOpen={!!deleteFile}
          title={t.deleteTitle}
          entityName={deleteFile?.title}
          description={t.deleteDesc}
          confirmLabel={t.delete}
          cancelLabel={t.cancel}
          eyebrowLabel={language==="fr"?"ACTION DÉFINITIVE": language==="ar"?"إجراء نهائي":"PERMANENT ACTION"}
          countdownWaitingLabel={language==="fr"?"Confirmation disponible dans": language==="ar"?"التأكيد متاح بعد":"Confirm available in"}
          onCancel={()=>setDeleteFile(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={deleting}
          resetKey={deleteFile?.id ?? null}
        />
        {toast && <div role="status" aria-live="polite" style={{ position:"fixed", bottom:16, left:"50%", transform:"translateX(-50%)", background:"var(--panel)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, color:"var(--text)", boxShadow:"0 6px 20px rgba(0,0,0,0.12)", zIndex: 999 }}>{toast}</div>}
      </main>
    </AppShell>
  );
}

function FileCard({ file, t, language, onOpen, onRename, onDuplicate, onArchive, onDelete, onFavorite, formatDate, isArchivedView }: { file: OfficeFile; t:any; language:Language; onOpen:()=>void; onRename:()=>void; onDuplicate:()=>void; onArchive:()=>void; onDelete:()=>void; onFavorite:()=>void; formatDate:(n:number)=>string; isArchivedView?:boolean }) {
  return (
    <div className={`${styles.fileCard} ${file.isArchived ? styles.fileCardArchived : ""}`}>
      <div className={styles.fileCardHeader}>
        <div className={styles.fileIcon} aria-hidden="true">
          {file.type==="document" ? <FileText size={20} strokeWidth={2} /> : <Table2 size={20} strokeWidth={2} />}
        </div>
        <div className={styles.fileInfo}>
          <strong title={file.title}>{file.title}</strong>
          <div className={styles.fileMeta}>
            <span>{file.type==="document" ? "DOC" : "XLS"} · {formatDate(file.updatedAt)}</span>
            {file.syncStatus==="pending" && <span className={styles.badge} title={language==="fr"?"Synchronisation en attente": language==="ar"?"مزامنة معلقة":"Sync pending"} aria-label={language==="fr"?"Synchronisation en attente": language==="ar"?"مزامنة معلقة":"Sync pending"}>Sync</span>}
            {file.isFavorite && <span className={`${styles.badge} ${styles.badgeFavorite}`} title={t.favorite} aria-label={t.favorite}><Star size={10} strokeWidth={2} aria-hidden="true" /></span>}
          </div>
        </div>
        <button type="button" className={styles.iconBtn} onClick={onFavorite} aria-label={file.isFavorite? t.unfavorite : t.favorite} title={file.isFavorite? t.unfavorite : t.favorite}>
          <Star size={14} strokeWidth={2} fill={file.isFavorite? "currentColor" : "none"} aria-hidden="true" />
        </button>
      </div>
      {file.linkedEntities && file.linkedEntities.length>0 && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {file.linkedEntities.slice(0,2).map((le,idx)=>(
            <span key={idx} className={styles.linkedChip}>{le.entityType}: {le.labelSnapshot.slice(0,30)}</span>
          ))}
        </div>
      )}
      <div className={styles.fileActions}>
        <button type="button" className={styles.primaryBtn} style={{ minHeight:30, padding:"0 10px", fontSize:12 }} onClick={onOpen}>{isArchivedView ? t.restore : t.open}</button>
        {!isArchivedView && <button type="button" className={styles.iconBtn} onClick={onRename} aria-label={t.rename} title={t.rename}><Pencil size={14} strokeWidth={2} aria-hidden="true" /></button>}
        <button type="button" className={styles.iconBtn} onClick={onDuplicate} aria-label={t.duplicate} title={t.duplicate}><Copy size={14} strokeWidth={2} aria-hidden="true" /></button>
        <button type="button" className={styles.iconBtn} onClick={onArchive} aria-label={isArchivedView? t.restore : t.archive} title={isArchivedView? t.restore : t.archive}>{isArchivedView? <ArchiveRestore size={14} strokeWidth={2} aria-hidden="true" /> : <Archive size={14} strokeWidth={2} aria-hidden="true" />}</button>
        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onDelete} aria-label={t.delete} title={t.delete}><Trash2 size={14} strokeWidth={2} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
