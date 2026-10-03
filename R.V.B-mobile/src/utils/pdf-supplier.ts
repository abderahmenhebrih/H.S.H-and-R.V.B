import type { SupplierProfile, SupplierPurchase, SupplierPayment } from "@/types/supplier";

export function sanitizeForSupplierPdf(supplier: SupplierProfile, purchases: SupplierPurchase[], payments: SupplierPayment[], currency: string) {
  return {
    header: "Poultry Business Suite — Supplier Profile",
    supplier: {
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address || null,
      identificationNumber: supplier.identificationNumber || null,
      email: supplier.email || null,
      notes: supplier.notes || null,
      currentBalance: supplier.balance,
      currency,
    },
    recentPurchases: purchases.slice(0, 10).map(p => ({ id: p.id, date: p.date, total: p.total, items: p.items.slice(0,3).map(i=> ({productId:i.productId, quantity:i.quantity, weightKg:i.weightKg, price:i.price, total:i.total})) })),
    recentPayments: payments.slice(0, 10).map(p => ({ amount: p.amount, date: p.date, note: p.note })),
    generatedAt: Date.now(),
  };
}

export function buildSupplierPdfHtml(data: ReturnType<typeof sanitizeForSupplierPdf>): string {
  const esc = (s:string)=> s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const fmt = (n:number)=> new Intl.NumberFormat("fr-DZ").format(n) + " " + data.supplier.currency;
  const fmtDate = (ms:number)=> new Date(ms).toLocaleDateString("fr-FR");
  const s = data.supplier;
  return `
  <html><head><meta charset="utf-8" /><style>
  body{font-family: Helvetica, Arial, sans-serif; padding:24px; color:#0F172A}
  h1{font-size:20px; color:#0F766E; border-bottom:2px solid #0F766E; padding-bottom:8px}
  h2{font-size:14px; color:#334155; margin-top:18px; border-bottom:1px solid #E2E8F0; padding-bottom:4px}
  table{width:100%; border-collapse:collapse; margin-top:8px}
  td,th{border:1px solid #E2E8F0; padding:6px 8px; font-size:11px; text-align:left}
  th{background:#F8FAFC}
  .label{color:#64748B; font-size:11px}
  .value{font-weight:600}
  </style></head><body>
  <h1>Poultry Business Suite — Supplier Profile</h1>
  <p style="font-size:11px;color:#64748B">Generated ${fmtDate(data.generatedAt)}</p>
  <h2>Supplier Information</h2>
  <table>
  <tr><td class="label">Name</td><td class="value">${esc(s.name)}</td></tr>
  <tr><td class="label">Phone</td><td class="value">${esc(s.phone)}</td></tr>
  <tr><td class="label">Address</td><td class="value">${esc(s.address||"-")}</td></tr>
  <tr><td class="label">ID Number</td><td class="value">${esc(s.identificationNumber||"-")}</td></tr>
  <tr><td class="label">Email</td><td class="value">${esc(s.email||"-")}</td></tr>
  <tr><td class="label">Notes</td><td class="value">${esc(s.notes||"-")}</td></tr>
  <tr><td class="label">Current Balance</td><td class="value">${fmt(s.currentBalance)}</td></tr>
  </table>
  <h2>Recent Purchases/Supplies (${data.recentPurchases.length})</h2>
  <table><tr><th>Date</th><th>Total</th><th>Items</th></tr>
  ${data.recentPurchases.length ? data.recentPurchases.map(p=> `<tr><td>${fmtDate(p.date)}</td><td>${fmt(p.total)}</td><td>${p.items.map(i=> `${esc(i.productId)} x${i.quantity} ${i.weightKg}kg @${i.price}`).join("<br/>")}</td></tr>`).join("") : `<tr><td colspan="3">No purchases recorded.</td></tr>`}
  </table>
  <h2>Recent Payments (${data.recentPayments.length})</h2>
  <table><tr><th>Date</th><th>Amount</th><th>Note</th></tr>
  ${data.recentPayments.length ? data.recentPayments.map(p=> `<tr><td>${fmtDate(p.date)}</td><td>${fmt(p.amount)}</td><td>${esc(p.note||"")}</td></tr>`).join("") : `<tr><td colspan="3">No payments recorded.</td></tr>`}
  </table>
  </body></html>`;
}
