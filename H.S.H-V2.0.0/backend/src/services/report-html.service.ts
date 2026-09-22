import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { CustomerModel } from "../models/customer.model";
import { SupplierModel } from "../models/supplier.model";
import { BankAccountModel } from "../models/bank-account.model";
import { WorkerModel } from "../models/worker.model";
import { ExpenseModel } from "../models/expense.model";
import { VehicleModel } from "../models/vehicle.model";
import { SaleModel } from "../models/sale.model";
import { PurchaseModel } from "../models/purchase.model";
import { PaymentModel } from "../models/payment.model";
import { TransferModel } from "../models/transfer.model";
import { ProductModel } from "../models/product.model";

type Category = "customers" | "suppliers" | "accounts" | "workers" | "expenses" | "vehicles";
type PaperSize = "A4" | "Letter" | "Legal";
type Margins = "normal" | "narrow" | "wide";

type GenerateHtmlOptions = {
  category: Category;
  entity: string; // single id or "all"
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  mode: "selected" | "all";
  paperSize: PaperSize;
  margins: Margins;
  scale: number;
  documentHeaderFooter: boolean;
  repeatHeader: boolean;
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}

function serialForDate(date: number, index: number) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const seq = String(index + 1).padStart(3, "0");
  return `${dd}${mm}${yyyy}${seq}`;
}

function formatCurrency(amount: number, currency: string = "DA") {
  return `${amount.toFixed(2)} ${currency}`;
}

function getLogoDataUrl(): string {
  try {
    const possiblePaths = [
      path.join(process.cwd(), "..", "frontend", "public", "chicken.jpg"),
      path.join(process.cwd(), "frontend", "public", "chicken.jpg"),
      path.join(__dirname, "..", "..", "..", "frontend", "public", "chicken.jpg"),
      path.join(__dirname, "..", "..", "frontend", "public", "chicken.jpg"),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const data = fs.readFileSync(p);
        const base64 = data.toString("base64");
        const ext = path.extname(p).toLowerCase() === ".png" ? "png" : "jpeg";
        return `data:image/${ext};base64,${base64}`;
      }
    }
  } catch {}
  return "";
}

async function buildReportPagesHtml(opts: GenerateHtmlOptions): Promise<string> {
  const { category, entity, fromDate, toDate, mode, documentHeaderFooter, repeatHeader } = opts;

  const fromTs = new Date(`${fromDate}T00:00:00`).getTime();
  const toTs = new Date(`${toDate}T23:59:59`).getTime();

  let customers: any[] = [];
  let suppliers: any[] = [];
  let accounts: any[] = [];
  let workers: any[] = [];
  let expenses: any[] = [];
  let vehicles: any[] = [];
  let purchases: any[] = [];
  let sales: any[] = [];
  let payments: any[] = [];
  let transfers: any[] = [];
  let products: any[] = [];
  if (mongoose.connection.readyState !== 1) {
    console.warn("[report-html] DB not connected (readyState", mongoose.connection.readyState, ") — using empty data for PDF generation");
  } else {
    try {
      [customers, suppliers, accounts, workers, expenses, vehicles, purchases, sales, payments, transfers, products] = await Promise.all([
        CustomerModel.find().lean(),
        SupplierModel.find().lean(),
        BankAccountModel.find().lean(),
        WorkerModel.find().lean(),
        ExpenseModel.find().lean(),
        VehicleModel.find().lean(),
        PurchaseModel.find().lean(),
        SaleModel.find().lean(),
        PaymentModel.find().lean(),
        TransferModel.find().lean(),
        ProductModel.find().lean(),
      ]);
    } catch (e) {
      console.warn("[report-html] DB query failed, using empty data:", e instanceof Error ? e.message : e);
      // keep empty arrays — will render "No activity" but still generate valid PDF for testing
    }
  }

  const filteredSales = sales.filter((s: any) => s.date >= fromTs && s.date <= toTs);
  const filteredPurchases = purchases.filter((p: any) => p.date >= fromTs && p.date <= toTs);
  const filteredPayments = payments.filter((p: any) => p.date >= fromTs && p.date <= toTs);
  const filteredExpenses = expenses.filter((e: any) => e.date >= fromTs && e.date <= toTs);
  const filteredTransfers = transfers.filter((tr: any) => tr.date >= fromTs && tr.date <= toTs);

  function getEntityOptions() {
    if (category === "suppliers") return suppliers.map((s: any) => ({ id: s.id, name: s.name }));
    if (category === "customers") return customers.map((c: any) => ({ id: c.id, name: c.name }));
    if (category === "accounts") return accounts.map((a: any) => ({ id: a.id, name: a.name }));
    if (category === "workers") return workers.filter((w: any) => w.status === "active").map((w: any) => ({ id: w.id, name: w.name }));
    if (category === "expenses") return [{ id: "all", name: "Expenses" }];
    if (category === "vehicles") return vehicles.map((v: any) => ({ id: v.id, name: v.name }));
    return [];
  }

  function hasActivity(entityId: string) {
    if (category === "customers") {
      return filteredSales.some((s: any) => s.customerId === entityId) || filteredPayments.some((p: any) => p.entityType === "customer" && p.entityId === entityId);
    }
    if (category === "suppliers") {
      return filteredPurchases.some((p: any) => p.supplierId === entityId) || filteredPayments.some((p: any) => p.entityType === "supplier" && p.entityId === entityId);
    }
    if (category === "accounts") {
      return filteredPayments.some((p: any) => p.accountId === entityId) || filteredTransfers.some((tr: any) => tr.fromAccountId === entityId || tr.toAccountId === entityId) || filteredExpenses.some((e: any) => e.accountId === entityId);
    }
    if (category === "workers") {
      return filteredPayments.some((p: any) => p.entityType === "worker" && p.entityId === entityId);
    }
    if (category === "expenses") {
      return filteredExpenses.length > 0;
    }
    if (category === "vehicles") {
      return filteredExpenses.some((e: any) => e.note?.includes(entityId) || e.note?.includes(vehicles.find((v: any) => v.id === entityId)?.name ?? ""));
    }
    return false;
  }

  function productName(id: string) {
    return (products as any[]).find((p: any) => p.id === id)?.name ?? id.slice(0, 6);
  }

  function getCategoryLabel(cat: Category) {
    if (cat === "customers") return "Customers";
    if (cat === "suppliers") return "Suppliers";
    if (cat === "accounts") return "Bank/Cash Accounts";
    if (cat === "workers") return "Workers";
    if (cat === "expenses") return "Expenses";
    if (cat === "vehicles") return "Vehicles";
    return cat;
  }

  function getEntityDisplayName(id: string) {
    if (id === "all") return "All";
    const opt = getEntityOptions().find((o) => o.id === id);
    return opt?.name ?? id.slice(0, 8);
  }

  function renderTableForEntity(entityId: string): string {
    if (category === "customers") {
      const salesForCustomer = entityId === "all" ? [...filteredSales].sort((a: any, b: any) => a.date - b.date) : filteredSales.filter((s: any) => s.customerId === entityId).sort((a: any, b: any) => a.date - b.date);
      const paymentsForCustomer = entityId === "all" ? [...filteredPayments].filter((p: any) => p.entityType === "customer") : filteredPayments.filter((p: any) => p.entityType === "customer" && p.entityId === entityId);
      if (salesForCustomer.length === 0 && paymentsForCustomer.length === 0) {
        return `<div class="printEmpty"><p>No activity in this period.</p></div>`;
      }
      const rows = [
        ...salesForCustomer.flatMap((sale: any, sIdx: number) =>
          sale.items.map((item: any) => `
            <tr>
              <td>${formatDate(sale.date)}</td>
              <td>${serialForDate(sale.date, sIdx)}</td>
              <td>${productName(item.productId)}</td>
              <td>${item.quantity}</td>
              <td>${item.weightKg.toFixed(2)} kg</td>
              <td>${formatCurrency(item.price)}</td>
              <td>${formatCurrency(item.total)}</td>
            </tr>
          `).join("")
        ),
        ...paymentsForCustomer.map((p: any) => `
          <tr>
            <td>${formatDate(p.date)}</td>
            <td>Payment</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>${formatCurrency(p.amount)}</td>
          </tr>
        `).join(""),
      ].join("");
      const totalSales = salesForCustomer.reduce((s: number, sale: any) => s + sale.total, 0);
      const totalPay = paymentsForCustomer.reduce((s: number, p: any) => s + p.amount, 0);
      return `
        <div class="printTableWrapper">
          <table class="printTable">
            <thead><tr><th>Date</th><th>Serial</th><th>Product</th><th>Quantity</th><th>Weight</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="printSummary"><span>Total Sales: ${formatCurrency(totalSales)}</span><span>Payment: ${formatCurrency(totalPay)}</span></div>
        </div>
      `;
    }
    if (category === "suppliers") {
      const list = entityId === "all" ? [...filteredPurchases] : filteredPurchases.filter((p: any) => p.supplierId === entityId);
      if (list.length === 0) return `<div class="printEmpty"><p>No activity in this period.</p></div>`;
      const rows = list.flatMap((pur: any) => pur.items.map((item: any) => `
        <tr><td>${formatDate(pur.date)}</td><td>${productName(item.productId)}</td><td>${item.quantity}</td><td>${item.weightKg.toFixed(2)} kg</td><td>${formatCurrency(item.price)}</td><td>${formatCurrency(item.total)}</td></tr>
      `)).join("");
      return `<div class="printTableWrapper"><table class="printTable"><thead><tr><th>Date</th><th>Product</th><th>Quantity</th><th>Weight</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (category === "accounts") {
      const pays = entityId === "all" ? [...filteredPayments] : filteredPayments.filter((p: any) => p.accountId === entityId);
      const trans = entityId === "all" ? [...filteredTransfers] : filteredTransfers.filter((tr: any) => tr.fromAccountId === entityId || tr.toAccountId === entityId);
      const exps = entityId === "all" ? [...filteredExpenses] : filteredExpenses.filter((e: any) => e.accountId === entityId);
      if (pays.length === 0 && trans.length === 0 && exps.length === 0) return `<div class="printEmpty"><p>No activity in this period.</p></div>`;
      const rows = [
        ...pays.map((p: any) => `<tr><td>${formatDate(p.date)}</td><td>${p.entityType} · ${formatCurrency(p.amount)}</td><td>${p.note ?? ""}</td></tr>`),
        ...trans.map((tr: any) => `<tr><td>${formatDate(tr.date)}</td><td>Transfer ${formatCurrency(tr.amount)}</td><td>${tr.note ?? ""}</td></tr>`),
        ...exps.map((e: any) => `<tr><td>${formatDate(e.date)}</td><td>${e.name} · ${formatCurrency(e.amount)}</td><td>${e.note ?? ""}</td></tr>`),
      ].join("");
      return `<div class="printTableWrapper"><table class="printTable"><thead><tr><th>Date</th><th>Total</th><th>History</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (category === "workers") {
      const pays = entityId === "all" ? filteredPayments.filter((p: any) => p.entityType === "worker") : filteredPayments.filter((p: any) => p.entityType === "worker" && p.entityId === entityId);
      if (pays.length === 0) return `<div class="printEmpty"><p>No activity in this period.</p></div>`;
      const rows = pays.map((p: any) => `<tr><td>${formatDate(p.date)}</td><td>${formatCurrency(p.amount)}</td><td>${p.note ?? ""}</td></tr>`).join("");
      return `<div class="printTableWrapper"><table class="printTable"><thead><tr><th>Date</th><th>Total</th><th>History</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (category === "expenses") {
      if (filteredExpenses.length === 0) return `<div class="printEmpty"><p>No activity in this period.</p></div>`;
      const rows = filteredExpenses.map((e: any) => `<tr><td>${formatDate(e.date)}</td><td>${e.name}</td><td>${formatCurrency(e.amount)}</td><td>${(accounts as any[]).find((a: any) => a.id === e.accountId)?.name ?? ""}</td></tr>`).join("");
      return `<div class="printTableWrapper"><table class="printTable"><thead><tr><th>Date</th><th>Expense</th><th>Total</th><th>Account</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (category === "vehicles") {
      const related = entityId === "all" ? filteredExpenses.filter((e: any) => e.note?.startsWith("vehicle:")) : filteredExpenses.filter((e: any) => e.note?.includes(entityId) || e.note?.includes(vehicles.find((v: any) => v.id === entityId)?.name ?? ""));
      if (related.length === 0) return `<div class="printEmpty"><p>No activity in this period.</p></div>`;
      const rows = related.map((e: any) => `<tr><td>${formatDate(e.date)}</td><td>${e.name}</td><td>${formatCurrency(e.amount)}</td></tr>`).join("");
      return `<div class="printTableWrapper"><table class="printTable"><thead><tr><th>Date</th><th>Vehicle</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    return `<div class="printEmpty"><p>No activity in this period.</p></div>`;
  }

  let entityIds: string[];
  if (category === "expenses") {
    entityIds = ["all"];
  } else if (mode === "all") {
    entityIds = getEntityOptions().map((o) => o.id).filter((id) => id !== "all" && hasActivity(id));
  } else {
    if (entity === "all") {
      const ids = getEntityOptions().map((o) => o.id).filter((id) => id !== "all" && hasActivity(id));
      entityIds = ids.length ? ids : [];
    } else {
      entityIds = [entity];
    }
  }

  if (entityIds.length === 0) {
    entityIds = ["all"]; // fallback to show empty state in single page
  }

  const logoUrl = getLogoDataUrl();
  const generated = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

  const pagesHtml = entityIds.map((eid) => {
    const tableHtml = renderTableForEntity(eid);
    const entityDisplay = eid === "all" ? getCategoryLabel(category) : getEntityDisplayName(eid);
    return `
      <div class="printEntityPage">
        ${documentHeaderFooter ? `
        <div class="printHeader">
          <div class="printLogo">${logoUrl ? `<img src="${logoUrl}" alt="Hebrih logo" />` : ""}</div>
          <div class="printBrand"><h1>Hebrih Slaughter House</h1><span>Management System</span></div>
        </div>` : ""}
        <div class="printTitleBlock">
          <h2>${getCategoryLabel(category).toUpperCase()} REPORT</h2>
          <div class="printMeta">
            <span>Category: ${getCategoryLabel(category)}</span>
            <span>Entity: ${entityDisplay}</span>
            <span>Period: ${fromDate} → ${toDate}</span>
            <span>Generated: ${generated}</span>
          </div>
        </div>
        <div class="printBody">
          ${tableHtml}
        </div>
        ${documentHeaderFooter ? `<div class="printFooter"><span>Hebrih Slaughter House Management System</span></div>` : ""}
      </div>
    `;
  }).join("");

  // Full HTML with inline CSS matching frontend reportStyles
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${opts.paperSize} portrait; margin: ${opts.margins === "narrow" ? "6mm" : opts.margins === "wide" ? "20mm" : "12mm"}; }
  html, body { margin:0; padding:0; background:#fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; }
  .printEntityPage { break-after: page; page-break-after: always; display:flex; flex-direction:column; min-height: 100vh; padding: 12mm 0; box-sizing:border-box; }
  .printEntityPage:last-child { break-after: auto; page-break-after: auto; }
  .printHeader { display:flex; align-items:center; gap:12px; margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #E2D4C5; }
  .printLogo { width:48px; height:48px; flex:0 0 48px; border-radius:8px; overflow:hidden; background:#FCF6EF; }
  .printLogo img { width:100%; height:100%; object-fit:contain; }
  .printBrand h1 { margin:0; font-size:16px; font-weight:800; color:#2F261F; line-height:1.2; }
  .printBrand span { display:block; margin-top:2px; font-size:11px; color:#81756C; }
  .printTitleBlock { text-align:center; margin:16px 0; padding:12px 0; border-top:1px solid #E2D4C5; border-bottom:1px solid #E2D4C5; }
  .printTitleBlock h2 { margin:0; font-size:18px; font-weight:800; color:#2F261F; letter-spacing:0.04em; text-transform:uppercase; }
  .printMeta { display:flex; flex-wrap:wrap; justify-content:center; gap:12px 24px; margin-top:8px; font-size:11px; color:#81756C; font-weight:600; }
  .printMeta span { white-space:nowrap; }
  .printBody { margin-top:16px; flex:1; }
  .printTableWrapper { overflow:visible; width:100%; }
  .printTable { width:100%; border-collapse:collapse; font-size:11px; color:#1a1a1a; }
  .printTable thead { display: ${repeatHeader ? "table-header-group" : "table-row-group"}; }
  .printTable th { background:#F8F0E7; color:#2F261F; font-weight:700; text-transform:uppercase; font-size:10px; letter-spacing:0.04em; padding:8px 6px; border:1px solid #E2D4C5; text-align:left; white-space:nowrap; }
  .printTable td { padding:6px 6px; border:1px solid #E8DDD0; font-size:11px; color:#1a1a1a; }
  .printTable tr { break-inside:avoid; page-break-inside:avoid; }
  .printSummary { display:flex; justify-content:space-between; gap:12px; margin-top:12px; padding:10px 12px; background:#FDF8F3; border:1px solid #E2D4C5; border-radius:8px; font-size:12px; font-weight:700; color:#2F261F; flex-wrap:wrap; }
  .printEmpty { padding:20px; text-align:center; color:#81756C; font-size:13px; }
  .printEntityTitle { margin:0 0 8px; font-size:14px; font-weight:700; color:#2F261F; padding-bottom:6px; border-bottom:1px solid #E2D4C5; }
  .printFooter { margin-top:auto; padding-top:12px; border-top:1px solid #E2D4C5; text-align:center; font-size:10px; color:#81756C; }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;

  return html;
}

export async function generateReportHtml(opts: GenerateHtmlOptions): Promise<string> {
  return buildReportPagesHtml(opts);
}
