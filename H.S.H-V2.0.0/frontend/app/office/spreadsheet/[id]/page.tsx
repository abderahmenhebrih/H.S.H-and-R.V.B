"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import AppShell from "../../../../src/components/layout/AppShell";
import { officeFileService } from "../../../../src/services/office-file.service";
import { settingsService } from "../../../../src/services/settings.service";
import { DEFAULT_SETTINGS, getDirection } from "../../../../src/lib/settings";
import type { OfficeFile } from "../../../../src/types/entities/office-file";
import type { Language } from "../../../../src/types/settings/settings";
import styles from "./page.module.css";
const SHEET_T = {
  en: { loading:"Loading spreadsheet…", saved:"Saved", saving:"Saving...", offline:"Offline", focus:"Focus", exitFocus:"Exit Focus", hebrihData:"HEBRIH Data", insertTable:"Insert Table", print:"Print", csv:"CSV", xlsx:"XLSX", formulasHelp:"Formulas: SUM, AVERAGE, MIN, MAX, COUNT supported via Univer engine. Use =SUM(A1:A10)", noData:"No data", tableInserted:"Table inserted", valueInserted:"Value inserted", exportFailed:"Export failed", backToOffice:"Back to Office", spreadsheetTitle:"Spreadsheet title", insertHebrihTitle:"Insert HEBRIH Data", insertTableTitle:"Insert HEBRIH Table", snapshotHelp:"Value inserted as snapshot. Editing spreadsheet does not modify business records.", tableSnapshotHelp:"Creates a snapshot table as a new sheet. Not live-linked.", entity:"Entity", record:"Record", field:"Field", cancel:"Cancel", insert:"Insert", customers:"Customers", suppliers:"Suppliers", products:"Products", sales:"Sales", purchases:"Purchases", workers:"Workers", customer:"Customer", supplier:"Supplier", worker:"Worker", product:"Product", sale:"Sale", purchase:"Purchase", invoice:"Invoice", vehicle:"Vehicle", task:"Task", amount:"Amount", date:"Date" },
  fr: { loading:"Chargement du tableur…", saved:"Enregistré", saving:"Enregistrement…", offline:"Hors ligne", focus:"Focus", exitFocus:"Quitter focus", hebrihData:"Données HEBRIH", insertTable:"Insérer tableau", print:"Imprimer", csv:"CSV", xlsx:"XLSX", formulasHelp:"Formules : SUM, AVERAGE, MIN, MAX, COUNT prises en charge par Univer. Utilisez =SUM(A1:A10)", noData:"Aucune donnée", tableInserted:"Tableau inséré", valueInserted:"Valeur insérée", exportFailed:"Échec de l'export", backToOffice:"Retour au bureau", spreadsheetTitle:"Titre du tableur", insertHebrihTitle:"Insérer données HEBRIH", insertTableTitle:"Insérer tableau HEBRIH", snapshotHelp:"Valeur insérée comme instantané. Modifier le tableur ne modifie pas les enregistrements.", tableSnapshotHelp:"Crée un tableau instantané comme nouvelle feuille. Non lié en direct.", entity:"Entité", record:"Enregistrement", field:"Champ", cancel:"Annuler", insert:"Insérer", customers:"Clients", suppliers:"Fournisseurs", products:"Produits", sales:"Ventes", purchases:"Achats", workers:"Employés", customer:"Client", supplier:"Fournisseur", worker:"Employé", product:"Produit", sale:"Vente", purchase:"Achat", invoice:"Facture", vehicle:"Véhicule", task:"Tâche", amount:"Montant", date:"Date" },
  ar: { loading:"جارٍ تحميل الجدول…", saved:"تم الحفظ", saving:"جارٍ الحفظ…", offline:"غير متصل", focus:"تركيز", exitFocus:"إنهاء التركيز", hebrihData:"بيانات حبريح", insertTable:"إدراج جدول", print:"طباعة", csv:"CSV", xlsx:"XLSX", formulasHelp:"الصيغ: SUM و AVERAGE و MIN و MAX و COUNT مدعومة عبر Univer. استخدم =SUM(A1:A10)", noData:"لا توجد بيانات", tableInserted:"تم إدراج الجدول", valueInserted:"تم إدراج القيمة", exportFailed:"فشل التصدير", backToOffice:"العودة إلى المكتب", spreadsheetTitle:"عنوان الجدول", insertHebrihTitle:"إدراج بيانات حبريح", insertTableTitle:"إدراج جدول حبريح", snapshotHelp:"تم إدراج القيمة كلقطة. تعديل الجدول لا يعدل السجلات.", tableSnapshotHelp:"ينشئ جدول لقطة كورقة جديدة. غير مرتبط مباشرة.", entity:"الكيان", record:"السجل", field:"الحقل", cancel:"إلغاء", insert:"إدراج", customers:"الزبائن", suppliers:"الموردون", products:"المنتجات", sales:"المبيعات", purchases:"المشتريات", workers:"العمال", customer:"الزبون", supplier:"المورد", worker:"العامل", product:"المنتج", sale:"البيع", purchase:"الشراء", invoice:"الفاتورة", vehicle:"المركبة", task:"المهمة", amount:"المبلغ", date:"التاريخ" },
} as const;

import {
  Printer, Download, Database, Table as TableIcon, FileSpreadsheet, Maximize2, Minimize2
} from "lucide-react";

// Dynamically import Univer wrapper to avoid SSR
const UniverWrapper = dynamic(() => import("./UniverWrapper"), { ssr: false, loading: () => <div style={{ padding: 20, color:"var(--muted)"}}>Loading…</div> });

export default function SpreadsheetEditorPage() {
  const params = useParams() as { id: string };
  const id = params.id;
  const router = useRouter();
  const [file, setFile] = useState<OfficeFile | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<Language>(DEFAULT_SETTINGS.language);
  const [status, setStatus] = useState<"saved"|"saving"|"offline">("saved");
  const [isFocus, setIsFocus] = useState(false);
  const [showHebrih, setShowHebrih] = useState(false);
  const [showTableInsert, setShowTableInsert] = useState(false);
  const titleTimerRef = useRef<any>(null);
  const univerRef = useRef<any>(null);

  const dir = getDirection(language);

  useEffect(() => {
    async function loadLang() {
      const s = await settingsService.get();
      setLanguage(s?.language ?? DEFAULT_SETTINGS.language);
    }
    void loadLang();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const f = await officeFileService.getById(id);
        if (!f) { router.push("/office"); return; }
        if (f.type !== "spreadsheet") { router.push(`/office/document/${id}`); return; }
        setFile(f);
        setTitle(f.title);
        await officeFileService.touchOpened(id).catch(()=>{});
      } catch(e){ console.error(e); router.push("/office");}
    }
    void load();
  }, [id, router]);

  const titleSaveRef = useRef<string | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  const handleTitleChange = (v: string) => {
    setTitle(v);
    pendingTitleRef.current = v;
    if (!v.trim()) return;
    titleSaveRef.current = v.trim();
    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    setStatus("saving");
    titleTimerRef.current = setTimeout(async () => {
      const toSave = titleSaveRef.current;
      pendingTitleRef.current = null;
      try { await officeFileService.update(id, { title: toSave as string }); setStatus("saved"); } catch(e){ setStatus("offline"); }
    }, 600);
  };
  // Flush pending title save on unmount / navigation
  useEffect(() => {
    return () => {
      if (titleTimerRef.current) { clearTimeout(titleTimerRef.current); titleTimerRef.current = null; }
      const pending = pendingTitleRef.current?.trim();
      const saveVal = titleSaveRef.current;
      if (pending && pending === saveVal) {
        // Fire-and-forget flush (no await in cleanup, but queued via service)
        officeFileService.update(id, { title: saveVal as string }).catch(()=>{});
      }
    };
  }, [id]);

  const handleWorkbookSave = useCallback(async (snapshot: any) => {
    setStatus("saving");
    try {
      await officeFileService.update(id, { content: snapshot });
      setStatus(navigator.onLine ? "saved" : "offline");
    } catch(e){ console.error(e); setStatus("offline"); }
  }, [id]);
  // Flush workbook pending save on unmount: ask Univer for snapshot
  useEffect(() => {
    return () => {
      try {
        const snap = (univerRef.current as any)?.getSnapshot?.() || (univerRef.current as any)?.save?.();
        // getSnapshot via wrapper handle: univerRef.current may expose getSnapshot
        // Fallback: if not available, rely on scheduled save already queued
        if (snap && JSON.stringify(snap) !== "") {
          officeFileService.update(id, { content: snap }).catch(()=>{});
        }
      } catch {}
      if (titleTimerRef.current) { clearTimeout(titleTimerRef.current); }
    };
  }, [id]);

  const [officeFeedback, setOfficeFeedback] = useState<string | null>(null);
  useEffect(()=>{ if(!officeFeedback) return; const t=setTimeout(()=>setOfficeFeedback(null), 2800); return ()=>clearTimeout(t); }, [officeFeedback]);

  const handleHebrihInsert = useCallback(async (entityType:string, entityId:string, field:string) => {
    try {
      const mod = await getSnapshotForInsert(entityType, entityId, field);
      const value = mod.value;
      let inserted = false;
      // Try Univer API if available
      if (univerRef.current?.insertValue) {
        try { univerRef.current.insertValue(value); inserted = true; } catch(e){ console.error(e); }
      } else if (univerRef.current?.insertAtSelection) {
        try { univerRef.current.insertAtSelection(value); inserted = true; } catch(e){ console.error(e); }
      }
      if (!inserted) {
        // Fallback: insert via fallback grid content (active sheet 0,0 or next empty cell)
        const current = file?.content as any;
        // Try to find first empty cell in fallback format
        if (current && Array.isArray(current.sheets)) {
          const sheet = current.sheets[0] as any;
          const data = sheet?.data || {};
          // find first empty row col
          let found: string | null = null;
          for(let r=0;r<40;r++){ for(let c=0;c<10;c++){ const k=`${r},${c}`; if(!data[k]){ found=k; break; } } if(found) break; }
          const key = found || "0,0";
          const nextData = { ...data, [key]: { v: value } };
          const nextSheet = { ...sheet, data: nextData };
          const nextContent = { ...current, sheets: [nextSheet, ...current.sheets.slice(1)] };
          await officeFileService.update(id, { content: nextContent });
          const updated = await officeFileService.getById(id);
          if (updated) setFile(updated);
          setOfficeFeedback(`${TT.valueInserted} (${value})`);
          inserted = true;
        } else if (current && current.sheets && typeof current.sheets==="object") {
          // Univer snapshot fallback: add to first sheet cellData
          const sheetsObj = current.sheets as any;
          const firstId = current.sheetOrder?.[0] || Object.keys(sheetsObj)[0];
          if (firstId && sheetsObj[firstId]) {
            const sh = sheetsObj[firstId];
            const cellData = sh.cellData || {};
            // find empty
            let found: string | null = null;
            for(let r=0;r<40;r++){ if(!cellData[r]){ found=`${r},0`; break; } const row=cellData[r]; let emptyCol=-1; for(let c=0;c<10;c++){ if(!row[c]){ emptyCol=c; break; } } if(emptyCol!==-1){ found=`${r},${emptyCol}`; break; } if(Object.keys(row).length<10) {found=`${r},${Object.keys(row).length}`; break;} }
            const key = found || "0,0";
            const [rr,cc] = key.split(",").map(Number);
            const nextCellData = { ...cellData, [rr]: { ...(cellData[rr]||{}), [cc]: { v: value, m: String(value) } } };
            const nextSheets = { ...sheetsObj, [firstId]: { ...sh, cellData: nextCellData } };
            const nextContent = { ...current, sheets: nextSheets };
            await officeFileService.update(id, { content: nextContent });
            const updated = await officeFileService.getById(id);
            if (updated) setFile(updated);
            setOfficeFeedback(TT.valueInserted);
            inserted = true;
          }
        }
      }
      if (!inserted) {
        setOfficeFeedback(`${TT.valueInserted} (${value})`);
      }
      // link entity
      if (file) {
        const linked = file.linkedEntities || [];
        const exists = linked.some((l)=> l.entityType===entityType && l.entityId===entityId);
        if (!exists) {
          const nextLinked = [...linked, { entityType: entityType as any, entityId, labelSnapshot: mod.label }];
          await officeFileService.update(id, { linkedEntities: nextLinked } as any);
          setFile((prev)=> prev? { ...prev, linkedEntities: nextLinked } as any : prev);
        }
      }
    } catch(e){ console.error(e); setOfficeFeedback(String(e)); }
    setShowHebrih(false);
  }, [file, id, language]);

  const handleTableInsert = useCallback(async (entityType:string) => {
    try {
      const rows = await getTableSnapshot(entityType, language);
      if (!rows || rows.length===0) { setOfficeFeedback(TT.noData); return; }
      let insertedViaApi = false;
      if (univerRef.current?.insertTable) {
        try { univerRef.current.insertTable(entityType, rows); insertedViaApi = true; } catch(e){ console.error(e); }
      }
      if (!insertedViaApi) {
        // fallback: create new sheet snapshot via content update and render immediately
        const current = file?.content as any;
        const header = Object.keys(rows[0] || {});
        const data: any = {};
        header.forEach((h, c)=> data[`0,${c}`] = { v: h });
        rows.forEach((row:any, rIdx:number)=> {
          header.forEach((h,c)=> {
            const val = row[h];
            data[`${rIdx+1},${c}`] = { v: String(val ?? "") };
          });
        });
        const newSheetId = `sheet-${Date.now()}`;
        const newSheet = { id: newSheetId, name: entityType.slice(0,12), data, rowCount: rows.length+5, colCount: header.length };
        let nextContent: any;
        if (current && current.sheets && Array.isArray(current.sheets)) {
          nextContent = { ...current, sheets: [...current.sheets, newSheet], activeSheetId: newSheetId };
        } else if (current && current.sheets && typeof current.sheets==="object" && !Array.isArray(current.sheets)) {
          const sheetMap = current.sheets || {};
          nextContent = { ...current, sheets: { ...sheetMap, [newSheetId]: { id: newSheetId, name: entityType, cellData: data, rowCount: rows.length+5, columnCount: header.length } }, sheetOrder: [...(current.sheetOrder|| Object.keys(sheetMap)), newSheetId] };
        } else {
          nextContent = { sheets: [newSheet], activeSheetId: newSheetId };
        }
        await officeFileService.update(id, { content: nextContent });
        const updated = await officeFileService.getById(id);
        if (updated) setFile(updated);
        setOfficeFeedback(TT.tableInserted);
      } else {
        // Persist API-inserted snapshot by saving current Univer snapshot after short delay
        setTimeout(async()=>{
          try { const snap = (univerRef.current as any)?.getSnapshot?.() || (univerRef.current as any)?.save?.(); if(snap) await officeFileService.update(id, { content: snap }); const updated = await officeFileService.getById(id); if(updated) setFile(updated); } catch(e){ console.error(e); }
        }, 400);
        setOfficeFeedback(TT.tableInserted);
      }
      setShowTableInsert(false);
    } catch(e){ console.error(e); setOfficeFeedback(String(e)); }
  }, [file, id, language]);

  const handleExportCSV = async () => {
    if (univerRef.current?.exportCSV) {
      const csv = await univerRef.current.exportCSV();
      if (csv) {
        const blob = new Blob([csv], { type:"text/csv" });
        const url = URL.createObjectURL(blob);
        const a=document.createElement("a"); a.href=url; a.download=`${title||"sheet"}.csv`; a.click(); URL.revokeObjectURL(url);
        return;
      }
    }
    // fallback: export from stored content if possible
    const content = file?.content as any;
    if (content?.sheets) {
      // try to export first sheet as csv
      let rows:any[][]=[];
      if (Array.isArray(content.sheets) && content.sheets[0]?.data) {
        const data = content.sheets[0].data;
        const maxRow = Math.max(...Object.keys(data).map((k)=> parseInt(k.split(",")[0],10)),0);
        const maxCol = Math.max(...Object.keys(data).map((k)=> parseInt(k.split(",")[1],10)),0);
        for(let r=0;r<=maxRow;r++){ const row=[]; for(let c=0;c<=maxCol;c++){ row.push(data[`${r},${c}`]?.v ?? ""); } rows.push(row); }
      }
      const csv = rows.map((r)=> r.map((c)=> `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type:"text/csv" });
      const url = URL.createObjectURL(blob);
      const a=document.createElement("a"); a.href=url; a.download=`${title||"sheet"}.csv`; a.click(); URL.revokeObjectURL(url);
    }
  };

  const handleExportXLSX = async () => {
    if (univerRef.current?.exportXLSX) {
      try { const fileBlob = await univerRef.current.exportXLSX(); if (fileBlob){ const url=URL.createObjectURL(fileBlob); const a=document.createElement("a"); a.href=url; a.download=`${title||"sheet"}.xlsx`; a.click(); URL.revokeObjectURL(url); return; } } catch(e){ console.error(e); }
    }
    // fallback via ExcelJS from stored content
    try {
      const ExcelJSMod: any = await import("exceljs");
      const WorkbookCtor = ExcelJSMod.Workbook ?? ExcelJSMod.default?.Workbook;
      const content = file?.content as any;
      const workbook = new WorkbookCtor();
      if (content?.sheets) {
        const sheetsArr = Array.isArray(content.sheets) ? content.sheets : Object.values(content.sheets);
        sheetsArr.forEach((sh:any)=>{
          const data = sh.data || sh.cellData || {};
          const rows:any[][]=[];
          const keys = Object.keys(data);
          if(keys.length===0){ rows.push([]); } else {
            const maxRow = Math.max(...keys.map((k)=> parseInt(k.split(",")[0],10)),0);
            const maxCol = Math.max(...keys.map((k)=> parseInt(k.split(",")[1],10)),0);
            for(let r=0;r<=maxRow;r++){ const row=[]; for(let c=0;c<=maxCol;c++){ row.push(data[`${r},${c}`]?.v ?? ""); } rows.push(row); }
          }
          const sheetName = (sh.name||"Sheet").slice(0,31);
          const ws = workbook.addWorksheet(sheetName);
          rows.forEach((r)=> ws.addRow(r));
        });
      } else {
        const noDataLabel = language==="fr" ? "Aucune donnée" : language==="ar" ? "لا توجد بيانات" : "No data";
        const fallbackSheetName = language==="fr" ? "Feuille 1" : language==="ar" ? "ورقة 1" : "Sheet 1";
        const ws = workbook.addWorksheet(fallbackSheetName);
        ws.addRow([noDataLabel]);
      }
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`${title||"sheet"}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch(e){ console.error(e); setOfficeFeedback(TT.exportFailed); }
  };

  const handlePrint = () => window.print();

  const TT = SHEET_T[language];
  if (!file) return <AppShell activePage="office"><div style={{ padding:20 }}>{TT.loading}</div></AppShell>;

  return (
    <AppShell activePage="office">
      <main className={styles.sheetPage} dir={dir}>
        <div className={styles.sheetHeader}>
          <button type="button" onClick={()=>router.push("/office")} style={{ border:"1px solid var(--border)", background:"var(--panel-hover)", borderRadius:8, padding:"6px 10px", cursor:"pointer" }} aria-label={TT.backToOffice}>←</button>
          <input className={styles.sheetTitleInput} value={title} onChange={(e)=>handleTitleChange(e.target.value)} placeholder={language==="fr"?"Sans titre": language==="ar"?"بدون عنوان":"Untitled Spreadsheet"} aria-label={TT.spreadsheetTitle} />
          <span className={styles.sheetStatus}>{status==="saved"?TT.saved:status==="saving"?TT.saving:TT.offline}</span>
          <button type="button" className={styles.sheetStatus} onClick={()=>setIsFocus((v)=>!v)} aria-label={isFocus?TT.exitFocus:TT.focus} title={isFocus?TT.exitFocus:TT.focus} style={{ border:"1px solid var(--border)", background:"var(--panel-hover)", borderRadius:8, padding:"6px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            {isFocus ? <Minimize2 size={14} strokeWidth={2} aria-hidden="true" /> : <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />} {isFocus ? TT.exitFocus : TT.focus}
          </button>
        </div>

        {!isFocus && (
          <div className={styles.sheetToolbar} role="toolbar" aria-label={TT.hebrihData}>
            <button type="button" className={styles.toolBtnPrimary} onClick={()=>setShowHebrih(true)} aria-label={TT.hebrihData} title={TT.hebrihData}><Database size={16} strokeWidth={2} aria-hidden="true" /> {TT.hebrihData}</button>
            <button type="button" className={styles.toolBtn} onClick={()=>setShowTableInsert(true)} aria-label={TT.insertTable} title={TT.insertTable}><TableIcon size={16} strokeWidth={2} aria-hidden="true" /> {TT.insertTable}</button>
            <button type="button" className={styles.toolBtn} onClick={handleExportCSV} aria-label={TT.csv} title={TT.csv}><Download size={14} strokeWidth={2} aria-hidden="true" /> {TT.csv}</button>
            <button type="button" className={styles.toolBtn} onClick={handleExportXLSX} aria-label={TT.xlsx} title={TT.xlsx}><FileSpreadsheet size={14} strokeWidth={2} aria-hidden="true" /> {TT.xlsx}</button>
            <button type="button" className={styles.toolBtn} onClick={handlePrint} aria-label={TT.print} title={TT.print}><Printer size={14} strokeWidth={2} aria-hidden="true" /> {TT.print}</button>
            <span style={{ fontSize:11, color:"var(--muted)", marginInlineStart:8 }}>{TT.formulasHelp}</span>
          </div>
        )}

        <div className={styles.univerContainer}>
          <UniverWrapper ref={univerRef} file={file} onSave={handleWorkbookSave} language={language} defaultSheetName={language==="fr" ? "Feuille 1" : language==="ar" ? "ورقة 1" : "Sheet 1"} />
        </div>

        {officeFeedback && <div role="status" aria-live="polite" style={{ position:"fixed", bottom:16, left:"50%", transform:"translateX(-50%)", background:"var(--panel)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, color:"var(--text)", boxShadow:"0 6px 20px rgba(0,0,0,0.12)", zIndex: 999 }}>{officeFeedback}</div>}
        {showHebrih && <HebrihInsertModal language={language} onClose={()=>setShowHebrih(false)} onInsert={handleHebrihInsert} />}
        {showTableInsert && <HebrihTableModal language={language} onClose={()=>setShowTableInsert(false)} onInsert={handleTableInsert} />}
      </main>
    </AppShell>
  );
}

import StyledSelect from "../../../../src/components/common/StyledSelect";
function HebrihInsertModal({ language, onClose, onInsert }: { language:Language; onClose:()=>void; onInsert:(type:string, id:string, field:string)=>void }) {
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
    invoice: ["invoiceNumber","totalTTC"],
    vehicle: ["name","type","registrationNumber"],
    task: ["name","status"],
    payment: ["amount","date"],
  };
  useEffect(()=> {
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
        setEntities(list.slice(0,100));
        setSelectedId(list[0]?.id || "");
        setField(fieldOptions[entityType]?.[0] || "name");
      } catch(e){ console.error(e); }
    }
    void load();
  }, [entityType]);
  const TT2 = SHEET_T[language];
  return (
    <div className={styles.insertModal} onClick={onClose} role="presentation">
      <section className={styles.insertCard} onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={TT2.insertHebrihTitle}>
        <h3>{TT2.insertHebrihTitle}</h3>
        <p style={{ margin:0, fontSize:11, color:"var(--muted)"}}>{TT2.snapshotHelp}</p>
        <label><span style={{ fontSize:11, fontWeight:700, color:"var(--muted)"}}>{TT2.entity}</span>
          <StyledSelect value={entityType} onChange={setEntityType} placeholder={TT2.entity} ariaLabel={TT2.entity} options={[{value:"customer",label:TT2.customer},{value:"supplier",label:TT2.supplier},{value:"worker",label:TT2.worker},{value:"product",label:TT2.product},{value:"sale",label:TT2.sale},{value:"purchase",label:TT2.purchase},{value:"invoice",label:TT2.invoice},{value:"vehicle",label:TT2.vehicle},{value:"task",label:TT2.task}]} />
        </label>
        <label><span style={{ fontSize:11, fontWeight:700, color:"var(--muted)"}}>{TT2.record}</span>
          <StyledSelect value={selectedId} onChange={setSelectedId} placeholder={TT2.record} ariaLabel={TT2.record} options={entities.map((en)=>({ value: en.id, label: en.name || en.title || en.id }))} />
        </label>
        <label><span style={{ fontSize:11, fontWeight:700, color:"var(--muted)"}}>{TT2.field}</span>
          <StyledSelect value={field} onChange={setField} placeholder={TT2.field} ariaLabel={TT2.field} options={(fieldOptions[entityType]||["name"]).map((f)=>({ value:f, label:f }))} />
        </label>
        <div style={{ display:"flex", gap:6 }}>
          <button type="button" onClick={()=>onClose()} style={{ flex:1, minHeight:36, border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", color:"var(--text)", fontWeight:700 }}>{TT2.cancel}</button>
          <button type="button" onClick={()=>onInsert(entityType, selectedId, field)} disabled={!selectedId} style={{ flex:1, minHeight:36, border:"1px solid var(--accent)", borderRadius:8, background:"var(--accent)", color:"#fff", fontWeight:800 }}>{TT2.insert}</button>
        </div>
      </section>
    </div>
  );
}

function HebrihTableModal({ language, onClose, onInsert }: { language:Language; onClose:()=>void; onInsert:(type:string)=>void }) {
  const [type, setType] = useState("customer");
  const TM = SHEET_T[language];
  return (
    <div className={styles.insertModal} onClick={onClose} role="presentation">
      <section className={styles.insertCard} onClick={(e)=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={TM.insertTableTitle}>
        <h3>{TM.insertTableTitle}</h3>
        <p style={{ margin:0, fontSize:11, color:"var(--muted)"}}>{TM.tableSnapshotHelp}</p>
        <label><span style={{ fontSize:11, fontWeight:700, color:"var(--muted)"}}>{TM.entity}</span>
          <StyledSelect value={type} onChange={setType} placeholder={TM.entity} ariaLabel={TM.entity} options={[{value:"customer",label:TM.customers},{value:"supplier",label:TM.suppliers},{value:"product",label:TM.products},{value:"sale",label:TM.sales},{value:"purchase",label:TM.purchases},{value:"worker",label:TM.workers}]} />
        </label>
        <div style={{ display:"flex", gap:6 }}>
          <button type="button" onClick={()=>onClose()} style={{ flex:1, minHeight:36, border:"1px solid var(--border)", borderRadius:8, background:"var(--panel-hover)", color:"var(--text)", fontWeight:700 }}>{TM.cancel}</button>
          <button type="button" onClick={()=>onInsert(type)} style={{ flex:1, minHeight:36, border:"1px solid var(--accent)", borderRadius:8, background:"var(--accent)", color:"#fff", fontWeight:800 }}>{TM.insert}</button>
        </div>
      </section>
    </div>
  );
}

async function getSnapshotForInsert(type:string, id:string, field:string): Promise<{ value:string; label:string }> {
  let value=""; let label=id;
  try{
    if(type==="customer"){ const { customerService } = await import("../../../../src/services/customer.service"); const e = await customerService.getAll().then((a)=>a.find((x:any)=>x.id===id)); if(e){ label=e.name; value=String((e as any)[field] ?? e.name); if(field==="balance") value=String(e.balance); }}
    else if(type==="supplier"){ const { supplierService } = await import("../../../../src/services/supplier.service"); const e = await supplierService.getAll().then((a)=>a.find((x:any)=>x.id===id)); if(e){ label=e.name; value=String((e as any)[field] ?? ""); }}
    else if(type==="worker"){ const { workerService } = await import("../../../../src/services/worker.service"); const e = await workerService.getAll().then((a)=>a.find((x:any)=>x.id===id)); if(e){ label=e.name; value=String((e as any)[field] ?? ""); }}
    else if(type==="product"){ const { productService } = await import("../../../../src/services/product.service"); const e = await productService.getAll().then((a)=>a.find((x:any)=>x.id===id)); if(e){ label=e.name; value=String((e as any)[field] ?? ""); }}
    else if(type==="sale"){ const { saleService } = await import("../../../../src/services/sale.service"); const e = await saleService.getAll().then((a)=>a.find((x:any)=>x.id===id)); if(e){ label=e.id; value=String((e as any)[field] ?? ""); }}
    else if(type==="purchase"){ const { purchaseService } = await import("../../../../src/services/purchase.service"); const e = await purchaseService.getAll().then((a)=>a.find((x:any)=>x.id===id)); if(e){ label=e.id; value=String((e as any)[field] ?? ""); }}
    else if(type==="invoice"){ const { invoiceService } = await import("../../../../src/services/invoice.service"); const e = await invoiceService.getAll().then((a)=>a.find((x:any)=>x.id===id)); if(e){ label=e.invoiceNumber||e.id; value= field==="number"? (e.invoiceNumber||e.id) : String((e as any)[field] ?? e.totalTTC ?? ""); }}
  } catch(e){ console.error(e); }
  if(!value) value=`${type}.${field}`;
  return { value, label };
}

async function getTableSnapshot(type:string, language: import("../../../../src/types/settings/settings").Language = "en" as any): Promise<any[]> {
  const t = SHEET_T[language];
  try{
    if(type==="customer"){ const { customerService } = await import("../../../../src/services/customer.service"); const list=await customerService.getAll(); return list.map((c:any)=>({ [t.customer ?? "Name"]:c.name, [language==="fr"?"Type":language==="ar"?"النوع":"Type"]:c.type, [language==="fr"?"Téléphone":language==="ar"?"الهاتف":"Phone"]:c.phone, [language==="fr"?"Solde":language==="ar"?"الرصيد":"Balance"]:String(c.balance) })); }
    if(type==="supplier"){ const { supplierService } = await import("../../../../src/services/supplier.service"); const list=await supplierService.getAll(); return list.map((s:any)=>({ [t.customer ?? "Name"]:s.name, [language==="fr"?"Téléphone":language==="ar"?"الهاتف":"Phone"]:s.phone, [language==="fr"?"Solde":language==="ar"?"الرصيد":"Balance"]:String(s.balance) })); }
    if(type==="product"){ const { productService } = await import("../../../../src/services/product.service"); const list=await productService.getAll(); return list.map((p:any)=>({ [language==="fr"?"Nom":language==="ar"?"الاسم":"Name"]:p.name, [language==="fr"?"Prix":language==="ar"?"السعر":"Price"]:String(p.price??""), [language==="fr"?"Quantité":language==="ar"?"الكمية":"Quantity"]:String(p.quantity??""), [language==="fr"?"Poids":language==="ar"?"الوزن":"Weight"]:String((p as any).weightKg ?? "") })); }
    if(type==="sale"){ const { saleService } = await import("../../../../src/services/sale.service"); const { customerService } = await import("../../../../src/services/customer.service"); const [list, customers] = await Promise.all([saleService.getAll(), customerService.getAll().catch(()=>[])]) as any; const custMap = new Map((customers||[]).map((c:any)=>[c.id, c.name])); return list.slice(0,50).map((s:any)=>({ [language==="fr"?"ID":language==="ar"?"المعرف":"Id"]:s.id, [t.customer]: custMap.get(s.customerId) ?? s.customerId, [t.date]:new Date(s.date).toLocaleDateString(language==="ar"?"ar-DZ-u-nu-latn":language==="fr"?"fr-FR":"en-GB", {numberingSystem:"latn"} as any), [language==="fr"?"Total":language==="ar"?"المجموع":"Total"]:String(s.items?.reduce((a:any,b:any)=>a+(b.total||0),0) ?? "") })); }
    if(type==="purchase"){ const { purchaseService } = await import("../../../../src/services/purchase.service"); const { supplierService } = await import("../../../../src/services/supplier.service"); const [list, suppliers] = await Promise.all([purchaseService.getAll(), supplierService.getAll().catch(()=>[])]) as any; const supMap = new Map((suppliers||[]).map((s:any)=>[s.id, s.name])); return list.slice(0,50).map((p:any)=>({ [language==="fr"?"ID":language==="ar"?"المعرف":"Id"]:p.id, [t.supplier]: supMap.get(p.supplierId) ?? p.supplierId, [t.date]:new Date(p.date).toLocaleDateString(language==="ar"?"ar-DZ-u-nu-latn":language==="fr"?"fr-FR":"en-GB", {numberingSystem:"latn"} as any), [language==="fr"?"Total":language==="ar"?"المجموع":"Total"]:String(p.total??"") })); }
    if(type==="worker"){ const { workerService } = await import("../../../../src/services/worker.service"); const list=await workerService.getAll(); return list.map((w:any)=>({ [language==="fr"?"Nom":language==="ar"?"الاسم":"Name"]:w.name, [language==="fr"?"Poste":language==="ar"?"المنصب":"Position"]:w.position, [language==="fr"?"Salaire initial":language==="ar"?"الراتب الابتدائي":"Starting"]:String((w as any).startingSalary ?? ""), [language==="fr"?"Salaire mensuel":language==="ar"?"الراتب الشهري":"Monthly"]:String((w as any).monthlySalary ?? ""), [language==="fr"?"Solde":language==="ar"?"الرصيد":"Balance"]:String(w.balance??"") })); }
  } catch(e){ console.error(e); }
  return [];
}
