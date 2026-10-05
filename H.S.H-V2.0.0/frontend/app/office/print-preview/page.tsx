"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
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
import { Indent } from "../../../src/lib/office/tiptap-format";
import StyledSelect from "../../../src/components/common/StyledSelect";
import { officeFileService } from "../../../src/services/office-file.service";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, getDirection } from "../../../src/lib/settings";
import { getSavedTheme } from "../../../src/lib/theme";
import type { OfficeFile } from "../../../src/types/entities/office-file";
import type { Language } from "../../../src/types/settings/settings";
import styles from "./page.module.css";

const T = {
  en: {
    title: "Document Print Preview", subtitle: "Review layout, then print.",
    back: "Back to document", print: "Print", loading: "Loading…", notFound: "Document not found.",
    printSettings: "Print settings", paperSize: "Paper size", orientation: "Orientation",
    portrait: "Portrait", landscape: "Landscape", margins: "Margins",
    normal: "Normal", narrow: "Narrow", wide: "Wide", scale: "Scale",
    colorMode: "Color", color: "Color", grayscale: "Grayscale",
    showTitle: "Show document title", untitled: "Untitled Document",
  },
  fr: {
    title: "Aperçu avant impression", subtitle: "Vérifiez la mise en page, puis imprimez.",
    back: "Retour au document", print: "Imprimer", loading: "Chargement…", notFound: "Document introuvable.",
    printSettings: "Paramètres d'impression", paperSize: "Format de papier", orientation: "Orientation",
    portrait: "Portrait", landscape: "Paysage", margins: "Marges",
    normal: "Normales", narrow: "Étroites", wide: "Larges", scale: "Échelle",
    colorMode: "Couleur", color: "Couleur", grayscale: "Noir et blanc",
    showTitle: "Afficher le titre", untitled: "Document sans titre",
  },
  ar: {
    title: "معاينة الطباعة", subtitle: "راجع التنسيق ثم اطبع.",
    back: "العودة إلى المستند", print: "طباعة", loading: "جارٍ التحميل…", notFound: "المستند غير موجود.",
    printSettings: "إعدادات الطباعة", paperSize: "حجم الورق", orientation: "الاتجاه",
    portrait: "عمودي", landscape: "أفقي", margins: "الهوامش",
    normal: "عادية", narrow: "ضيقة", wide: "واسعة", scale: "الحجم",
    colorMode: "اللون", color: "ملون", grayscale: "أبيض وأسود",
    showTitle: "إظهار العنوان", untitled: "مستند بدون عنوان",
  },
} as const;

type PaperSize = "A4" | "Letter";
type Orientation = "portrait" | "landscape";
type Margins = "normal" | "narrow" | "wide";

function PrintPreviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const docId = searchParams.get("docId") || "";
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [file, setFile] = useState<OfficeFile | null>(null);
  const [loading, setLoading] = useState(!!docId);
  const [notFound, setNotFound] = useState(!docId);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [margins, setMargins] = useState<Margins>("normal");
  const [scale, setScale] = useState(100);
  const [colorMode, setColorMode] = useState<"color" | "grayscale">("color");
  const [showTitle, setShowTitle] = useState(true);

  const t = T[language];
  const dir = getDirection(language);
  const isDark = getSavedTheme() === "dark";

  useEffect(() => {
    settingsService.get().then((s) => {
      if (s?.language) setLanguage(s.language);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    async function load() {
      try {
        const f = await officeFileService.getById(docId);
        if (cancelled) return;
        if (!f || f.type !== "document") { setNotFound(true); return; }
        setFile(f);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [docId]);

  // Read-only renderer with the SAME extension set as the editor, so printed
  // formatting (marks, sizes, alignment, tables, images) matches exactly.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      TextStyle, FontSize, FontFamily, LineHeight, Color,
      Superscript, Subscript, Indent,
    ],
    content: file && (file.content as { type?: string })?.type === "doc" ? (file.content as never) : { type: "doc", content: [{ type: "paragraph", content: [] }] },
    editable: false,
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed || !file) return;
    try {
      const incoming = file.content as { type?: string };
      if (incoming?.type === "doc" && JSON.stringify(editor.getJSON()) !== JSON.stringify(incoming)) {
        editor.commands.setContent(incoming);
      }
    } catch {}
  }, [file, editor]);

  // The browser dialog is invoked ONLY from this print-ready view.
  const handleSystemPrint = () => window.print();

  if (loading) {
    return (
      <div dir={dir} className={`${styles.standalonePage} ${isDark ? "themeDark" : "themeLight"}`}>
        <main className={styles.stateWrap}><div className={styles.statePanel}><h2>{t.loading}</h2></div></main>
      </div>
    );
  }
  if (notFound || !file) {
    return (
      <div dir={dir} className={`${styles.standalonePage} ${isDark ? "themeDark" : "themeLight"}`}>
        <main className={styles.stateWrap}>
          <div className={styles.statePanel}>
            <h2>{t.notFound}</h2>
            <button type="button" className={styles.secondaryButton} onClick={() => router.push("/office")}>
              <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> {t.back}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div dir={dir} className={`${styles.standalonePage} ${isDark ? "themeDark" : "themeLight"}`}>
      <div className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div className={styles.workspaceHeaderLeft}>
            <div className={styles.logo} aria-hidden="true"><img src="/chicken.jpg" alt="Hebrih logo" /></div>
            <div className={styles.workspaceTitle}>
              <h1>{t.title}</h1>
              <p>{t.subtitle}</p>
            </div>
          </div>
          <div className={styles.workspaceHeaderActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => router.push(`/office/document/${file.id}`)}>
              <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> {t.back}
            </button>
            <button type="button" className={styles.primaryButton} onClick={handleSystemPrint}>
              <Printer size={16} strokeWidth={2} aria-hidden="true" /> {t.print}
            </button>
          </div>
        </header>

        <div className={styles.workspaceBody}>
          <div className={styles.previewArea}>
            <div className={styles.pagesStack}>
              <div
                className={`${styles.paper} ${styles[`paper${paperSize}`]} ${styles[orientation]} ${styles[`margins${margins.charAt(0).toUpperCase() + margins.slice(1)}`]} ${colorMode === "grayscale" ? styles.grayscale : ""}`}
                style={{ transform: `scale(${scale / 100})`, transformOrigin: "top center" }}
              >
                {showTitle ? <h1 className={styles.paperTitle}>{file.title || t.untitled}</h1> : null}
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>

          <aside className={styles.settingsPanel} aria-label={t.printSettings}>
            <h3>{t.printSettings}</h3>
            <label>
              <span>{t.paperSize}</span>
              <StyledSelect value={paperSize} onChange={(v) => setPaperSize(v as PaperSize)} ariaLabel={t.paperSize}
                options={[{ value: "A4", label: "A4" }, { value: "Letter", label: "Letter" }]} />
            </label>
            <label>
              <span>{t.orientation}</span>
              <StyledSelect value={orientation} onChange={(v) => setOrientation(v as Orientation)} ariaLabel={t.orientation}
                options={[{ value: "portrait", label: t.portrait }, { value: "landscape", label: t.landscape }]} />
            </label>
            <label>
              <span>{t.margins}</span>
              <StyledSelect value={margins} onChange={(v) => setMargins(v as Margins)} ariaLabel={t.margins}
                options={[{ value: "normal", label: t.normal }, { value: "narrow", label: t.narrow }, { value: "wide", label: t.wide }]} />
            </label>
            <label>
              <span>{t.scale} (%)</span>
              <StyledSelect value={String(scale)} onChange={(v) => setScale(Number(v) || 100)} ariaLabel={t.scale}
                options={["70", "80", "90", "100", "110", "125", "150"].map((s) => ({ value: s, label: s }))} />
            </label>
            <label>
              <span>{t.colorMode}</span>
              <StyledSelect value={colorMode} onChange={(v) => setColorMode(v as "color" | "grayscale")} ariaLabel={t.colorMode}
                options={[{ value: "color", label: t.color }, { value: "grayscale", label: t.grayscale }]} />
            </label>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} />
              <span>{t.showTitle}</span>
            </label>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function OfficePrintPreviewPage() {
  return (
    <Suspense fallback={<div className="standalonePage themeLight"><main><div><h2>Loading…</h2></div></main></div>}>
      <PrintPreviewInner />
    </Suspense>
  );
}
