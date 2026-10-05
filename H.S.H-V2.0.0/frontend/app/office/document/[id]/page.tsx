"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "../../../../src/components/layout/AppShell";
import { officeFileService } from "../../../../src/services/office-file.service";
import { settingsService } from "../../../../src/services/settings.service";
import { DEFAULT_SETTINGS, getDirection } from "../../../../src/lib/settings";
import { getSavedTheme } from "../../../../src/lib/theme";
import type { OfficeFile } from "../../../../src/types/entities/office-file";
import type { Language } from "../../../../src/types/settings/settings";
import styles from "./page.module.css";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { FontFamily } from "@tiptap/extension-text-style/font-family";
import { LineHeight } from "@tiptap/extension-text-style/line-height";
import { Color } from "@tiptap/extension-color";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Placeholder from "@tiptap/extension-placeholder";
import { Indent, getUniformMarkValue } from "../../../../src/lib/office/tiptap-format";

import StyledSelect from "../../../../src/components/common/StyledSelect";
import {
  Undo2, Redo2, Bold, Italic, Underline as UnderlineIcon, Strikethrough, Superscript as SuperscriptIcon, Subscript as SubscriptIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Quote, Minus, Table as TableIcon, Link as LinkIcon, Image as ImageIcon, Printer, Download, Database, Maximize2, Minimize2, IndentIncrease, IndentDecrease, X
} from "lucide-react";

import { resolvePlaceholders as resolveSharedPlaceholders } from "../../../../src/lib/office/placeholder";

const EDITOR_T = {
  en: { loading:"Loading…", saved:"Saved", saving:"Saving...", offline:"Offline", focus:"Focus", exitFocus:"Exit Focus", toolbar:"Formatting toolbar", undo:"Undo", redo:"Redo", style:"Style", paragraph:"Paragraph", heading1:"Heading 1", heading2:"Heading 2", heading3:"Heading 3", fontFamily:"Font", fontSize:"Size", mixed:"Mixed", defaultValue:"Default", bold:"Bold", italic:"Italic", underline:"Underline", strike:"Strikethrough", superscript:"Superscript", subscript:"Subscript", alignLeft:"Align left", alignCenter:"Center", alignRight:"Align right", alignJustify:"Justify",     bulletList:"Bulleted list", orderedList:"Numbered list", quote:"Quote", outdent:"Decrease indent", indent:"Increase indent", lineSpacing:"Line spacing", hr:"Horizontal rule", highlightColor:"Highlight color", clearColor:"Clear color", insertTable:"Insert table", link:"Link", image:"Image", textColor:"Text color", highlight:"Highlight", insertHebrihData:"Insert HEBRIH Data", print:"Print", printPreview:"Print preview", exportHtml:"Export HTML", backToOffice:"Back to Office", documentTitle:"Document title" },
  fr: { loading:"Chargement…", saved:"Enregistré", saving:"Enregistrement…", offline:"Hors ligne", focus:"Focus", exitFocus:"Quitter focus", toolbar:"Barre de mise en forme", undo:"Annuler", redo:"Rétablir", style:"Style", paragraph:"Paragraphe", heading1:"Titre 1", heading2:"Titre 2", heading3:"Titre 3", fontFamily:"Police", fontSize:"Taille", mixed:"Mixte", defaultValue:"Défaut", bold:"Gras", italic:"Italique", underline:"Souligné", strike:"Barré", superscript:"Exposant", subscript:"Indice", alignLeft:"Aligner à gauche", alignCenter:"Centrer", alignRight:"Aligner à droite", alignJustify:"Justifier",     bulletList:"Liste à puces", orderedList:"Liste numérotée", quote:"Citation", outdent:"Réduire le retrait", indent:"Augmenter le retrait", lineSpacing:"Interligne", hr:"Ligne horizontale", highlightColor:"Couleur de surlignage", clearColor:"Effacer la couleur", insertTable:"Insérer tableau", link:"Lien", image:"Image", textColor:"Couleur du texte", highlight:"Surligner", insertHebrihData:"Insérer données HEBRIH", print:"Imprimer", printPreview:"Aperçu avant impression", exportHtml:"Exporter HTML", backToOffice:"Retour au bureau", documentTitle:"Titre du document" },
  ar: { loading:"جارٍ التحميل…", saved:"تم الحفظ", saving:"جارٍ الحفظ…", offline:"غير متصل", focus:"تركيز", exitFocus:"إنهاء التركيز", toolbar:"شريط التنسيق", undo:"تراجع", redo:"إعادة", style:"النمط", paragraph:"فقرة", heading1:"عنوان 1", heading2:"عنوان 2", heading3:"عنوان 3", fontFamily:"الخط", fontSize:"الحجم", mixed:"مختلط", defaultValue:"افتراضي", bold:"عريض", italic:"مائل", underline:"تحته خط", strike:"يتوسطه خط", superscript:"مرتفع", subscript:"منخفض", alignLeft:"محاذاة لليسار", alignCenter:"توسيط", alignRight:"محاذاة لليمين", alignJustify:"ضبط",     bulletList:"قائمة نقطية", orderedList:"قائمة مرقمة", quote:"اقتباس", outdent:"تقليل المسافة البادئة", indent:"زيادة المسافة البادئة", lineSpacing:"تباعد الأسطر", hr:"خط أفقي", highlightColor:"لون التمييز", clearColor:"مسح اللون", insertTable:"إدراج جدول", link:"رابط", image:"صورة", textColor:"لون النص", highlight:"تمييز", insertHebrihData:"إدراج بيانات حبريح", print:"طباعة", printPreview:"معاينة الطباعة", exportHtml:"تصدير HTML", backToOffice:"العودة إلى المكتب", documentTitle:"عنوان المستند" },
} as const;

const HEBRIH_MODAL_T = {
  en: { entityType:"Entity Type", entityTypeOptions:{customer:"Customer",supplier:"Supplier",worker:"Worker",product:"Product",sale:"Sale",purchase:"Purchase",invoice:"Invoice",vehicle:"Vehicle",task:"Task",payment:"Payment"}, record:"Record", field:"Field", cancel:"Cancel", insert:"Insert", placeholders:'Placeholders: {{today}} {{currency}} {{customer.name}} etc. Use Insert to resolve to current value.' },
  fr: { entityType:"Type d'entité", entityTypeOptions:{customer:"Client",supplier:"Fournisseur",worker:"Employé",product:"Produit",sale:"Vente",purchase:"Achat",invoice:"Facture",vehicle:"Véhicule",task:"Tâche",payment:"Paiement"}, record:"Enregistrement", field:"Champ", cancel:"Annuler", insert:"Insérer", placeholders:"Espaces réservés : {{today}} {{currency}} {{customer.name}} etc. Utilisez Insérer pour résoudre." },
  ar: { entityType:"نوع الكيان", entityTypeOptions:{customer:"الزبون",supplier:"المورد",worker:"العامل",product:"المنتج",sale:"البيع",purchase:"الشراء",invoice:"الفاتورة",vehicle:"المركبة",task:"المهمة",payment:"الدفع"}, record:"السجل", field:"الحقل", cancel:"إلغاء", insert:"إدراج", placeholders:"العناصر النائبة: {{today}} {{currency}} {{customer.name}} إلخ. استخدم إدراج للمعالجة." },
} as const;

function resolvePlaceholders(text: string, language: Language, currency: string): string {
  return resolveSharedPlaceholders(text, { language, currency });
}

export default function DocumentEditorPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const id = params.id;
  const [file, setFile] = useState<OfficeFile | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [currency, setCurrency] = useState(DEFAULT_SETTINGS.currency);
  const [status, setStatus] = useState<"saved"|"saving"|"offline">("saved");
  const [isFocus, setIsFocus] = useState(false);
  const [showHebrih, setShowHebrih] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [docFeedback, setDocFeedback] = useState<string | null>(null);
  const saveTimerRef = useRef<any>(null);
  const titleTimerRef = useRef<any>(null);
  useEffect(()=>{ if(!docFeedback) return; const t=setTimeout(()=>setDocFeedback(null), 2800); return ()=>clearTimeout(t); }, [docFeedback]);

  const dir = getDirection(language);

  useEffect(() => {
    async function loadLang() {
      const s = await settingsService.get();
      setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
      setCurrency(s?.currency ?? DEFAULT_SETTINGS.currency);
    }
    void loadLang();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const f = await officeFileService.getById(id);
        if (!f) { router.push("/office"); return; }
        if (f.type !== "document") { router.push(`/office/spreadsheet/${id}`); return; }
        setFile(f);
        setTitle(f.title);
        // touch lastOpened
        await officeFileService.touchOpened(id).catch(()=>{});
      } catch(e){ console.error(e); router.push("/office"); }
    }
    void load();
  }, [id, router]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false } as any),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      TextStyle, FontSize, FontFamily, LineHeight, Color,
      Superscript, Subscript, Indent,
      Placeholder.configure({ placeholder: language==="fr"?"Commencez à écrire...": language==="ar"?"ابدأ الكتابة...":"Start typing..." }),
    ],
    content: { type:"doc", content:[{ type:"paragraph", content:[] }] },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (!editor || (editor as any).isDestroyed) return;
      const json = editor.getJSON();
      pendingContentRef.current = json;
      // debounce save 800ms
      setStatus("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const toSave = pendingContentRef.current;
        pendingContentRef.current = null;
        try {
          await officeFileService.update(id, { content: toSave as any });
          setStatus(navigator.onLine ? "saved" : "offline");
        } catch(e){ console.error(e); setStatus("offline"); }
      }, 800);
    },
  });

  // Keep editor content in sync when file loads/changes - guards against null/destroyed editor (fixes crash: Cannot read properties of null reading 'commands')
  useEffect(() => {
    if (!editor || (editor as any).isDestroyed || !file || (file.content as any)?.type!=="doc") return;
    try {
      const current = editor.getJSON();
      const incoming = file.content as any;
      if (JSON.stringify(current) !== JSON.stringify(incoming)) {
        editor.commands.setContent(incoming);
      }
    } catch (e) {
      // editor may be in transition/destroyed - ignore
      console.warn("[document] setContent guard", e);
    }
  }, [file, editor]);

  const pendingTitleRef = useRef<string | null>(null);
  const titleSaveRef = useRef<string | null>(null);
  const pendingContentRef = useRef<any>(null);
  const handleTitleChange = (v: string) => {
    setTitle(v);
    pendingTitleRef.current = v;
    titleSaveRef.current = v.trim();
    if (!v.trim()) return;
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    setStatus("saving");
    titleTimerRef.current = setTimeout(async () => {
      const toSave = titleSaveRef.current;
      pendingTitleRef.current = null;
      try { await officeFileService.update(id, { title: toSave as string }); setStatus("saved"); } catch(e){ setStatus("offline"); }
    }, 600);
  };
  // Flush pending debounced saves on unmount / navigation
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); }
      if (titleTimerRef.current) { clearTimeout(titleTimerRef.current); }
      if (pendingContentRef.current) {
        officeFileService.update(id, { content: pendingContentRef.current }).catch(()=>{});
      }
      const pending = pendingTitleRef.current?.trim();
      const saveVal = titleSaveRef.current;
      if (pending && pending === saveVal) {
        officeFileService.update(id, { title: saveVal as string }).catch(()=>{});
      }
    };
  }, [id]);

  const insertHebrihData = useCallback(async (entityType: string, entityId: string, field: string) => {
    // Load entity snapshot via service dynamically
    let label = "";
    let value = "";
    try {
      const mod = await getEntitySnapshot(entityType, entityId, field);
      value = mod.value;
      label = mod.label;
      // Insert into editor — with robust persistence guarantee
      const resolved = value;
      try {
        if (editor && !(editor as any).isDestroyed) {
          try { editor.chain().focus().insertContent(resolved).run(); } catch {}
        }
      } catch {}
      // Always ensure the resolved value is persisted via service (covers editor null, destroyed, or onUpdate debounce race)
      // This guarantees HEBRIH insert never silently fails and survives reload
      try {
        // Brief tick to let editor's onUpdate set pendingContentRef if it succeeded
        await new Promise((r) => setTimeout(r, 250));
        let editorJson: any = null;
        try {
          if (editor && !(editor as any).isDestroyed) editorJson = (editor as any).getJSON?.();
        } catch {}
        const editorHasValue = editorJson && JSON.stringify(editorJson).includes(resolved);
        const currentFile = file || await officeFileService.getById(id);
        const currentContent: any = (currentFile as any)?.content;
        const persistedHasValue = currentContent && JSON.stringify(currentContent).includes(resolved);
        // If neither editor nor persisted has the value, or editor has it but persisted doesn't, force persist
        if (!persistedHasValue) {
          let newContent: any = null;
          if (editorHasValue && editorJson) {
            newContent = editorJson;
          } else {
            newContent = currentContent && currentContent.type === "doc" && Array.isArray(currentContent.content)
              ? { ...currentContent, content: [...currentContent.content, { type: "paragraph", content: [{ type: "text", text: resolved }] }] }
              : { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: resolved }] }] };
          }
          await officeFileService.update(id, { content: newContent as any });
          setFile((prev) => {
            const base = (prev || currentFile) as any;
            return base ? { ...base, content: newContent } as any : prev;
          });
          try { (editor as any)?.commands?.setContent?.(newContent); } catch {}
        } else if (editorHasValue && !persistedHasValue) {
          // Editor has it but persisted doesn't — also force
          await officeFileService.update(id, { content: editorJson as any });
          setFile((prev) => {
            const base = (prev || currentFile) as any;
            return base ? { ...base, content: editorJson } as any : prev;
          });
        }
      } catch {}
      // Also link entity
      const effectiveFile = file || await officeFileService.getById(id);
      if (effectiveFile) {
        const linked = (effectiveFile as any).linkedEntities || [];
        const exists = linked.some((l:any)=> l.entityType===entityType && l.entityId===entityId);
        if (!exists) {
          const nextLinked = [...linked, { entityType: entityType as any, entityId, labelSnapshot: label }];
          await officeFileService.update(id, { linkedEntities: nextLinked } as any);
          setFile((prev)=> {
            const base = (prev || effectiveFile) as any;
            return base ? { ...base, linkedEntities: nextLinked } as any : prev;
          });
        }
      }
    } catch(e){ console.error(e); }
    setShowHebrih(false);
  }, [editor, file, id]);

  const handleImageInsert = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 1024*1024) { setDocFeedback(language==="fr"?"Image trop grande (max 1Mo)": language==="ar"?"الصورة كبيرة جدًا (1MB)":"Image too large (max 1MB for sync)"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        editor?.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  const handleLink = () => {
    setLinkUrl("");
    setLinkError("");
    setShowLinkDialog(true);
  };
  const confirmLink = () => {
    const url = linkUrl.trim();
    if (!url) { setLinkError(language==="fr"?"URL requise": language==="ar"?"الرابط مطلوب":"URL required"); return; }
    if (url.toLowerCase().startsWith("javascript:")) { setLinkError(language==="fr"?"URL invalide": language==="ar"?"رابط غير صالح":"Invalid URL"); return; }
    try { new URL(url); } catch { setLinkError(language==="fr"?"URL invalide": language==="ar"?"رابط غير صالح":"Invalid URL"); return; }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setShowLinkDialog(false);
    setLinkUrl("");
  };

  // Print flows through the suite's custom print system: the editor routes to
  // the dedicated office print-preview page (clean document layout + page
  // settings), and the browser dialog is invoked ONLY from that print-ready
  // view — never raw from the editor chrome.
  const handlePrint = () => router.push(`/office/print-preview?docId=${encodeURIComponent(id)}`);
  const handleExportHTML = () => {
    if (!editor) return;
    const html = editor.getHTML();
    // sanitize via DOMPurify already handled by tiptap, but extra sanitization
    const blob = new Blob([`<!DOCTYPE html><html><body>${html}</body></html>`], { type:"text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${title || "document"}.html`; a.click();
    URL.revokeObjectURL(url);
  };
  const handleExportPDF = () => handlePrint();


  const DOC_T = EDITOR_T[language];
  // ---- Selection-derived toolbar state (marks-level, never global) ----
  // TipTap applies setFontSize/setFontFamily/etc. to the current selection or
  // to stored marks for future typing, so cases A–E hold by construction.
  // Uniform values display as-is; divergent ("mixed") selections display an
  // indeterminate placeholder and change nothing until the user picks.
  const blockStyle: "p" | "h1" | "h2" | "h3" =
    editor?.isActive("heading", { level: 1 }) ? "h1"
    : editor?.isActive("heading", { level: 2 }) ? "h2"
    : editor?.isActive("heading", { level: 3 }) ? "h3" : "p";
  const uniformSize = getUniformMarkValue(editor, "fontSize");
  const sizeValue = uniformSize && uniformSize !== "mixed" ? uniformSize.replace(/px$/i, "") : "";
  const sizeOptions = ["8","9","10","11","12","14","16","18","20","24","28","32","36","48","72"];
  if (sizeValue && !sizeOptions.includes(sizeValue)) sizeOptions.push(sizeValue);
  const uniformFamily = getUniformMarkValue(editor, "fontFamily");
  const familyValue = uniformFamily && uniformFamily !== "mixed" ? uniformFamily : "";
  const fontOptions = ["Arial", "Calibri", "Times New Roman", "Georgia", "Verdana", "Courier New"];
  const uniformColor = getUniformMarkValue(editor, "color");
  const uniformHi = getUniformMarkValue(editor, "backgroundColor");
  const uniformLine = getUniformMarkValue(editor, "lineHeight");
  const lineValue = uniformLine && uniformLine !== "mixed" ? String(uniformLine) : "";
  if (!file) return <AppShell activePage="office" showHeader={false}><div style={{ padding:20 }}>{DOC_T.loading}</div></AppShell>;

  return (
    <AppShell activePage="office" showHeader={false}>
      <main className={styles.docPage} dir={dir}>
        <div className={styles.docHeader}>
          <button type="button" onClick={()=>router.push("/office")} style={{ border:"1px solid var(--border)", background:"var(--panel-hover)", borderRadius:8, padding:"6px 10px", cursor:"pointer" }} aria-label={DOC_T.backToOffice}>←</button>
          <input className={styles.docTitleInput} value={title} onChange={(e)=>handleTitleChange(e.target.value)} placeholder={language==="fr"?"Sans titre": language==="ar"?"بدون عنوان":"Untitled Document"} aria-label={DOC_T.documentTitle} />
          <span className={styles.docStatus}>{status==="saved"?DOC_T.saved:status==="saving"?DOC_T.saving:DOC_T.offline}</span>
          <button type="button" className={styles.docStatus} onClick={()=>setIsFocus((v)=>!v)} aria-label={isFocus?DOC_T.exitFocus:DOC_T.focus} title={isFocus?DOC_T.exitFocus:DOC_T.focus} style={{ border:"1px solid var(--border)", background:"var(--panel-hover)", borderRadius:8, padding:"6px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            {isFocus ? <Minimize2 size={14} strokeWidth={2} aria-hidden="true" /> : <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />} {isFocus ? DOC_T.exitFocus : DOC_T.focus}
          </button>
        </div>

        {!isFocus && (
          <div className={styles.toolbar} role="toolbar" aria-label={DOC_T.toolbar}>
            <div className={styles.toolGroup}>
              <button type="button" className={styles.toolBtn} onClick={()=>editor?.chain().focus().undo().run()} title={DOC_T.undo} aria-label={DOC_T.undo}><Undo2 size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={styles.toolBtn} onClick={()=>editor?.chain().focus().redo().run()} title={DOC_T.redo} aria-label={DOC_T.redo}><Redo2 size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
            <div className={styles.toolGroup}>
              <StyledSelect
                value={blockStyle}
                onChange={(v)=>{ if (!editor) return; if (v==="p") editor.chain().focus().setParagraph().run(); else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) as 1|2|3 }).run(); }}
                ariaLabel={DOC_T.style}
                fitContent
                options={[
                  { value:"p", label:DOC_T.paragraph },
                  { value:"h1", label:DOC_T.heading1 },
                  { value:"h2", label:DOC_T.heading2 },
                  { value:"h3", label:DOC_T.heading3 },
                ]}
              />
              <StyledSelect
                value={familyValue}
                onChange={(v)=>{ if (!editor) return; if (!v) editor.chain().focus().unsetFontFamily().run(); else editor.chain().focus().setFontFamily(v).run(); }}
                placeholder={uniformFamily==="mixed" ? DOC_T.mixed : DOC_T.fontFamily}
                ariaLabel={DOC_T.fontFamily}
                fitContent
                options={[{ value:"", label:DOC_T.defaultValue }, ...fontOptions.map((f)=>({ value:f, label:f }))]}
              />
              <StyledSelect
                value={sizeValue}
                onChange={(v)=>{ if (!editor) return; if (!v) editor.chain().focus().unsetFontSize().run(); else editor.chain().focus().setFontSize(`${v}px`).run(); }}
                placeholder={uniformSize==="mixed" ? DOC_T.mixed : DOC_T.fontSize}
                ariaLabel={DOC_T.fontSize}
                fitContent
                options={[{ value:"", label:DOC_T.defaultValue }, ...sizeOptions.map((s)=>({ value:s, label:s }))]}
              />
            </div>
            <div className={styles.toolGroup}>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive("bold")? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().toggleBold().run()} title={DOC_T.bold} aria-label={DOC_T.bold} aria-pressed={!!editor?.isActive("bold")}><Bold size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive("italic")? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().toggleItalic().run()} title={DOC_T.italic} aria-label={DOC_T.italic} aria-pressed={!!editor?.isActive("italic")}><Italic size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive("underline")? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().toggleUnderline().run()} title={DOC_T.underline} aria-label={DOC_T.underline} aria-pressed={!!editor?.isActive("underline")}><UnderlineIcon size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive("strike")? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().toggleStrike().run()} title={DOC_T.strike} aria-label={DOC_T.strike} aria-pressed={!!editor?.isActive("strike")}><Strikethrough size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive("superscript")? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().toggleSuperscript().run()} title={DOC_T.superscript} aria-label={DOC_T.superscript} aria-pressed={!!editor?.isActive("superscript")}><SuperscriptIcon size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive("subscript")? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().toggleSubscript().run()} title={DOC_T.subscript} aria-label={DOC_T.subscript} aria-pressed={!!editor?.isActive("subscript")}><SubscriptIcon size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
            <div className={styles.toolGroup}>
              <span className={styles.colorWrap} title={DOC_T.textColor}>
                <input type="color" className={styles.colorInput} value={uniformColor || "#000000"} onChange={(e)=>editor?.chain().focus().setColor(e.target.value).run()} aria-label={DOC_T.textColor} />
                {uniformColor ? <button type="button" className={styles.colorClear} onClick={()=>editor?.chain().focus().unsetColor().run()} title={DOC_T.clearColor} aria-label={DOC_T.clearColor}>×</button> : null}
              </span>
              <span className={styles.colorWrap} title={DOC_T.highlightColor}>
                <input type="color" className={styles.colorInput} value={uniformHi || "#ffff00"} onChange={(e)=>editor?.chain().focus().unsetHighlight().setHighlight({ color: e.target.value }).run()} aria-label={DOC_T.highlightColor} />
                {uniformHi ? <button type="button" className={styles.colorClear} onClick={()=>editor?.chain().focus().unsetHighlight().run()} title={DOC_T.clearColor} aria-label={DOC_T.clearColor}>×</button> : null}
              </span>
            </div>
            <div className={styles.toolGroup}>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive({ textAlign:"left"})? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().setTextAlign("left").run()} title={DOC_T.alignLeft} aria-label={DOC_T.alignLeft}><AlignLeft size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive({ textAlign:"center"})? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().setTextAlign("center").run()} title={DOC_T.alignCenter} aria-label={DOC_T.alignCenter}><AlignCenter size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive({ textAlign:"right"})? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().setTextAlign("right").run()} title={DOC_T.alignRight} aria-label={DOC_T.alignRight}><AlignRight size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive({ textAlign:"justify"})? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().setTextAlign("justify").run()} title={DOC_T.alignJustify} aria-label={DOC_T.alignJustify}><AlignJustify size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
            <div className={styles.toolGroup}>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive("bulletList")? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().toggleBulletList().run()} title={DOC_T.bulletList} aria-label={DOC_T.bulletList}><List size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive("orderedList")? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().toggleOrderedList().run()} title={DOC_T.orderedList} aria-label={DOC_T.orderedList}><ListOrdered size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={styles.toolBtn} onClick={()=>editor?.chain().focus().outdent().run()} title={DOC_T.outdent} aria-label={DOC_T.outdent}><IndentDecrease size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={styles.toolBtn} onClick={()=>editor?.chain().focus().indent().run()} title={DOC_T.indent} aria-label={DOC_T.indent}><IndentIncrease size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={`${styles.toolBtn} ${editor?.isActive("blockquote")? styles.toolBtnActive:""}`} onClick={()=>editor?.chain().focus().toggleBlockquote().run()} title={DOC_T.quote} aria-label={DOC_T.quote}><Quote size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
            <div className={styles.toolGroup}>
              <StyledSelect
                value={lineValue}
                onChange={(v)=>{ if (!editor) return; if (!v) editor.chain().focus().unsetLineHeight().run(); else editor.chain().focus().setLineHeight(v).run(); }}
                placeholder={uniformLine==="mixed" ? DOC_T.mixed : DOC_T.lineSpacing}
                ariaLabel={DOC_T.lineSpacing}
                fitContent
                options={[{ value:"", label:DOC_T.defaultValue }, ...["1.0","1.15","1.5","2.0"].map((s)=>({ value:s, label:s }))]}
              />
              <button type="button" className={styles.toolBtn} onClick={()=>editor?.chain().focus().setHorizontalRule().run()} title={DOC_T.hr} aria-label={DOC_T.hr}><Minus size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
            <div className={styles.toolGroup}>
              <button type="button" className={styles.toolBtn} onClick={()=>editor?.chain().focus().insertTable({ rows:3, cols:3, withHeaderRow:true }).run()} title={DOC_T.insertTable} aria-label={DOC_T.insertTable}><TableIcon size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={styles.toolBtn} onClick={handleLink} title={DOC_T.link} aria-label={DOC_T.link}><LinkIcon size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={styles.toolBtn} onClick={handleImageInsert} title={DOC_T.image} aria-label={DOC_T.image}><ImageIcon size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
            <div className={styles.toolGroup} style={{ borderInlineEnd:"none" }}>
              <button type="button" className={styles.toolBtn} onClick={()=>setShowHebrih(true)} title={DOC_T.insertHebrihData} aria-label={DOC_T.insertHebrihData} style={{ width:"auto", padding:"0 8px", gap:6, display:"inline-flex" }}><Database size={16} strokeWidth={2} aria-hidden="true" /> HEBRIH</button>
              <button type="button" className={styles.toolBtn} onClick={handlePrint} title={DOC_T.printPreview} aria-label={DOC_T.printPreview}><Printer size={16} strokeWidth={2} aria-hidden="true" /></button>
              <button type="button" className={styles.toolBtn} onClick={handleExportHTML} title={DOC_T.exportHtml} aria-label={DOC_T.exportHtml}><Download size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
          </div>
        )}

        <div className={styles.workspace}>
          <div className={styles.paper}>
            <EditorContent editor={editor} />
          </div>
        </div>

        {docFeedback && <div role="status" aria-live="polite" style={{ position:"fixed", bottom:16, left:"50%", transform:"translateX(-50%)", background:"var(--panel)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, color:"var(--text)", boxShadow:"0 6px 20px rgba(0,0,0,0.12)", zIndex: 999 }}>{docFeedback}</div>}
        {showLinkDialog && (
          <div style={{ position:"fixed", inset:0, zIndex: 1000, display:"grid", placeItems:"center", background:"rgba(0,0,0,0.35)" }} onClick={()=>setShowLinkDialog(false)} role="presentation">
            <section style={{ width:"min(420px, calc(100vw - 32px))", background:"var(--panel)", border:"1px solid var(--border)", borderRadius:12, padding:16, display:"flex", flexDirection:"column", gap:12 }} role="dialog" aria-modal="true" aria-label={language==="fr"?"Insérer un lien": language==="ar"?"إدراج رابط":"Insert link"} onClick={(e)=>e.stopPropagation()}>
              <h3 style={{ margin:0, fontSize:14, fontWeight:800, color:"var(--text)" }}>{language==="fr"?"Insérer un lien": language==="ar"?"إدراج رابط":"Insert link"}</h3>
              <input value={linkUrl} onChange={(e)=>setLinkUrl(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") confirmLink(); if(e.key==="Escape") setShowLinkDialog(false); }} placeholder={language==="fr"?"https://exemple.com": language==="ar"?"https://example.com":"https://example.com"} autoFocus aria-label={language==="fr"?"URL du lien": language==="ar"?"رابط":"Link URL"} style={{ width:"100%", height:36, border:"1px solid var(--border)", borderRadius:8, padding:"0 10px", background:"var(--panel-hover)", color:"var(--text)" }} />
              {linkError && <small style={{ color:"var(--danger)", fontSize:11, fontWeight:600 }}>{linkError}</small>}
              <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                <button type="button" onClick={()=>setShowLinkDialog(false)} style={{ minHeight:36, padding:"0 12px", border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", color:"var(--text)", fontWeight:700 }} aria-label={language==="fr"?"Annuler": language==="ar"?"إلغاء":"Cancel"}>{language==="fr"?"Annuler": language==="ar"?"إلغاء":"Cancel"}</button>
                <button type="button" onClick={confirmLink} style={{ minHeight:36, padding:"0 14px", border:"1px solid var(--accent)", borderRadius:8, background:"var(--accent)", color:"#fff", fontWeight:800 }} aria-label={language==="fr"?"Insérer": language==="ar"?"إدراج":"Insert"}>{language==="fr"?"Insérer": language==="ar"?"إدراج":"Insert"}</button>
              </div>
            </section>
          </div>
        )}
        {showHebrih && <HebrihInsertModal language={language} currency={currency} onClose={()=>setShowHebrih(false)} onInsert={insertHebrihData} />}
      </main>
    </AppShell>
  );
}

function HebrihInsertModal({ language, currency, onClose, onInsert }: { language:Language; currency:string; onClose:()=>void; onInsert:(type:string, id:string, field:string)=>void }) {
  const [entityType, setEntityType] = useState("customer");
  const [entities, setEntities] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [field, setField] = useState("name");

  const fieldOptions: Record<string, string[]> = {
    customer: ["name","phone","balance","type"],
    supplier: ["name","phone","balance"],
    worker: ["name","position","startingSalary","monthlySalary","balance"],
    product: ["name","price","quantity","weightKg"],
    sale: ["total","customerId","date"],
    purchase: ["total","supplierId","date"],
    invoice: ["invoiceNumber","totalTTC","customerId"],
    vehicle: ["name","type","registrationNumber"],
    task: ["name","status"],
    payment: ["amount","date"],
  };

  const seqRef = useRef(0);
  useEffect(()=> {
    let cancelled = false;
    const seq = ++seqRef.current;
    async function load(){
      try{
        let list:any[]=[];
        if(entityType==="customer"){ const { customerService } = await import("../../../../src/services/customer.service"); list = await customerService.getAll(); }
        else if(entityType==="supplier"){ const { supplierService } = await import("../../../../src/services/supplier.service"); list = await supplierService.getAll(); }
        else if(entityType==="worker"){ const { workerService } = await import("../../../../src/services/worker.service"); list = await workerService.getAll(); }
        else if(entityType==="product"){ const { productService } = await import("../../../../src/services/product.service"); list = await productService.getAll(); }
        else if(entityType==="sale"){ const { saleService } = await import("../../../../src/services/sale.service"); list = await saleService.getAll(); }
        else if(entityType==="purchase"){ const { purchaseService } = await import("../../../../src/services/purchase.service"); list = await purchaseService.getAll(); }
        else if(entityType==="invoice"){ const { invoiceService } = await import("../../../../src/services/invoice.service"); list = await invoiceService.getAll().catch(()=>[]); }
        else if(entityType==="vehicle"){ const { vehicleService } = await import("../../../../src/services/vehicle.service"); list = await vehicleService.getAll(); }
        else if(entityType==="task"){ const { taskService } = await import("../../../../src/services/task.service"); list = await taskService.getAll(); }
        else if(entityType==="payment"){ const { paymentService } = await import("../../../../src/services/payment.service"); list = await paymentService.getAll(); }
        if (cancelled || seq !== seqRef.current) return;
        setEntities(list.slice(0,100));
        setSelectedId(list[0]?.id || "");
        setField(fieldOptions[entityType]?.[0] || "name");
      } catch(e){ if (cancelled || seq !== seqRef.current) return; console.error(e); }
    }
    void load();
    return () => { cancelled = true; };
  }, [entityType]);

  const modalT = HEBRIH_MODAL_T[language];
  const etOpts = modalT.entityTypeOptions as Record<string,string>;
  return (
    <div className={styles.insertModal} onClick={onClose} role="presentation">
      <section className={styles.insertCard} onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={language==="fr"?"Insérer données HEBRIH": language==="ar"?"إدراج بيانات حبريح":"Insert HEBRIH Data"}>
        <h3>{language==="fr"?"Insérer données HEBRIH": language==="ar"?"إدراج بيانات حبريح":"Insert HEBRIH Data"}</h3>
        <p style={{ margin:0, fontSize:11, color:"var(--muted)" }}>{language==="fr"?"Les données sont insérées en lecture seule. Modifier le document ne modifie pas les enregistrements.": language==="ar"?"تُدرج البيانات للقراءة فقط.":"Data is inserted read-only. Editing Office content does not modify business records."}</p>
        <label><span style={{ fontSize:11, fontWeight:700, color:"var(--muted)"}}>{modalT.entityType}</span>
          <StyledSelect value={entityType} onChange={setEntityType} placeholder={modalT.entityType} ariaLabel={modalT.entityType} options={Object.entries(etOpts).map(([v,l])=>({value:v,label:l}))} />
        </label>
        <label><span style={{ fontSize:11, fontWeight:700, color:"var(--muted)"}}>{modalT.record}</span>
          <StyledSelect value={selectedId} onChange={setSelectedId} placeholder={modalT.record} ariaLabel={modalT.record} options={entities.map((en)=>({ value: en.id, label: en.name || en.title || en.id }))} />
        </label>
        <label><span style={{ fontSize:11, fontWeight:700, color:"var(--muted)"}}>{modalT.field}</span>
          <StyledSelect value={field} onChange={setField} placeholder={modalT.field} ariaLabel={modalT.field} options={(fieldOptions[entityType]||["name"]).map((f)=>({ value:f, label:f }))} />
        </label>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <button type="button" onClick={()=>onClose()} style={{ flex:"1", minHeight:36, border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", color:"var(--text)", fontWeight:700 }}>{modalT.cancel}</button>
          <button type="button" onClick={()=>onInsert(entityType, selectedId, field)} disabled={!selectedId} style={{ flex:"1", minHeight:36, border:"1px solid var(--accent)", borderRadius:8, background:"var(--accent)", color:"#fff", fontWeight:800 }}>{modalT.insert}</button>
        </div>
        <small style={{ fontSize:10, color:"var(--muted)" }}>{modalT.placeholders}</small>
      </section>
    </div>
  );
}

async function getEntitySnapshot(entityType:string, entityId:string, field:string): Promise<{ value:string; label:string }> {
  let value = "";
  let label = entityId;
  try{
    if(entityType==="customer"){ const { customerService } = await import("../../../../src/services/customer.service"); const e = await customerService.getAll().then((a)=>a.find((x:any)=>x.id===entityId)); if(e){ label = e.name; value = String((e as any)[field] ?? ""); if(field==="balance") value = String(e.balance ?? "0"); }}
    else if(entityType==="supplier"){ const { supplierService } = await import("../../../../src/services/supplier.service"); const e = await supplierService.getAll().then((a)=>a.find((x:any)=>x.id===entityId)); if(e){ label = e.name; value = String((e as any)[field] ?? ""); }}
    else if(entityType==="worker"){ const { workerService } = await import("../../../../src/services/worker.service"); const e = await workerService.getAll().then((a)=>a.find((x:any)=>x.id===entityId)); if(e){ label = e.name; value = String((e as any)[field] ?? ""); }}
    else if(entityType==="product"){ const { productService } = await import("../../../../src/services/product.service"); const e = await productService.getAll().then((a)=>a.find((x:any)=>x.id===entityId)); if(e){ label = e.name; value = String((e as any)[field] ?? ""); }}
    else if(entityType==="sale"){
      const { saleService } = await import("../../../../src/services/sale.service");
      const { customerService } = await import("../../../../src/services/customer.service");
      const e = await saleService.getAll().then((a)=>a.find((x:any)=>x.id===entityId));
      if(e){
        label = e.id;
        if(field==="customerId" || field==="customer"){
          const customers = await customerService.getAll().catch(()=>[] as any);
          const c = customers.find((x:any)=>x.id===e.customerId);
          value = c ? c.name : e.customerId;
        } else value = field==="total"? String((e as any).total ?? (e as any).items?.reduce((s:any,it:any)=>s+(it.total||0),0) ?? "") : String((e as any)[field] ?? "");
      }
    }
    else if(entityType==="purchase"){
      const { purchaseService } = await import("../../../../src/services/purchase.service");
      const { supplierService } = await import("../../../../src/services/supplier.service");
      const e = await purchaseService.getAll().then((a)=>a.find((x:any)=>x.id===entityId));
      if(e){
        label = e.id;
        if(field==="supplierId" || field==="supplier"){
          const suppliers = await supplierService.getAll().catch(()=>[] as any);
          const s = suppliers.find((x:any)=>x.id===e.supplierId);
          value = s ? s.name : e.supplierId;
        } else value = String((e as any)[field] ?? "");
      }
    }
    else if(entityType==="invoice"){ const { invoiceService } = await import("../../../../src/services/invoice.service"); const e = await invoiceService.getAll().then((a)=>a.find((x:any)=>x.id===entityId)); if(e){ label = e.invoiceNumber || e.id; if(field==="invoiceNumber") value = e.invoiceNumber || e.id; else if(field==="totalTTC") value = String(e.totalTTC ?? ""); else value = String((e as any)[field] ?? ""); }}
    else if(entityType==="vehicle"){ const { vehicleService } = await import("../../../../src/services/vehicle.service"); const e = await vehicleService.getAll().then((a)=>a.find((x:any)=>x.id===entityId)); if(e){ label = e.name; value = String((e as any)[field] ?? ""); }}
    else if(entityType==="task"){ const { taskService } = await import("../../../../src/services/task.service"); const e = await taskService.getAll().then((a)=>a.find((x:any)=>x.id===entityId)); if(e){ label = (e as any).name || e.id; value = String((e as any)[field] ?? ""); }}
    else if(entityType==="payment"){ const { paymentService } = await import("../../../../src/services/payment.service"); const e = await paymentService.getAll().then((a)=>a.find((x:any)=>x.id===entityId)); if(e){ label = e.id; value = String((e as any)[field] ?? ""); }}
  } catch(e){ console.error(e); }
  if(!value) value = `${entityType}.${field}`;
  return { value, label };
}
