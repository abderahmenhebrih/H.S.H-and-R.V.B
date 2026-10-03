import type { CustomerProfile, CustomerSale, CustomerPayment, CustomerOrder } from "@/types/customer";

export function sanitizeForCustomerPdf(customer: CustomerProfile, sales: CustomerSale[], payments: CustomerPayment[], orders: CustomerOrder[], currency: string) {
  return {
    header: "Poultry Business Suite — Customer Profile",
    customer: {
      name: customer.name,
      phone: customer.phone,
      address: customer.address || null,
      type: customer.type,
      identificationNumber: customer.identificationNumber || null,
      email: customer.email || null,
      notes: customer.notes || null,
      currentBalance: customer.balance,
      currency,
    },
    recentSales: sales.slice(0, 10).map(s => ({ id: s.id, date: s.date, total: s.total, items: s.items.slice(0,3).map(i=> ({productId:i.productId, quantity:i.quantity, weightKg:i.weightKg, price:i.price, total:i.total})) })),
    recentPayments: payments.slice(0, 10).map(p => ({ amount: p.amount, date: p.date, note: p.note })),
    recentOrders: orders.slice(0, 10).map(o => ({ id: o.id, status: o.status, total: o.total, submittedAt: o.submittedAt, items: o.items.slice(0,2).map(i=> ({productId:i.productId, quantity:i.quantity, weightKg:i.weightKg, price:i.price})) })),
    generatedAt: Date.now(),
  };
}

export function buildCustomerPdfHtml(data: ReturnType<typeof sanitizeForCustomerPdf>): string {
  const esc = (s:string)=> s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const fmt = (n:number)=> new Intl.NumberFormat("fr-DZ").format(n) + " " + data.customer.currency;
  const fmtDate = (ms:number)=> new Date(ms).toLocaleDateString("fr-FR");
  const c = data.customer;
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
  <h1>Poultry Business Suite — Customer Profile</h1>
  <p style="font-size:11px;color:#64748B">Generated ${fmtDate(data.generatedAt)}</p>
  <h2>Customer Information</h2>
  <table>
  <tr><td class="label">Name</td><td class="value">${esc(c.name)}</td></tr>
  <tr><td class="label">Phone</td><td class="value">${esc(c.phone)}</td></tr>
  <tr><td class="label">Address</td><td class="value">${esc(c.address||"-")}</td></tr>
  <tr><td class="label">Type</td><td class="value">${esc(c.type)}</td></tr>
  <tr><td class="label">ID Number</td><td class="value">${esc(c.identificationNumber||"-")}</td></tr>
  <tr><td class="label">Email</td><td class="value">${esc(c.email||"-")}</td></tr>
  <tr><td class="label">Notes</td><td class="value">${esc(c.notes||"-")}</td></tr>
  <tr><td class="label">Current Balance</td><td class="value">${fmt(c.currentBalance)}</td></tr>
  </table>
  <h2>Recent Sales/Shipments (${data.recentSales.length})</h2>
  <table><tr><th>Date</th><th>Total</th><th>Items</th></tr>
  ${data.recentSales.length ? data.recentSales.map(s=> `<tr><td>${fmtDate(s.date)}</td><td>${fmt(s.total)}</td><td>${s.items.map(i=> `${esc(i.productId)} x${i.quantity} ${i.weightKg}kg @${i.price}`).join("<br/>")}</td></tr>`).join("") : `<tr><td colspan="3">No sales recorded.</td></tr>`}
  </table>
  <h2>Recent Payments (${data.recentPayments.length})</h2>
  <table><tr><th>Date</th><th>Amount</th><th>Note</th></tr>
  ${data.recentPayments.length ? data.recentPayments.map(p=> `<tr><td>${fmtDate(p.date)}</td><td>${fmt(p.amount)}</td><td>${esc(p.note||"")}</td></tr>`).join("") : `<tr><td colspan="3">No payments recorded.</td></tr>`}
  </table>
  <h2>Recent Orders (${data.recentOrders.length})</h2>
  <table><tr><th>Status</th><th>Total</th><th>Submitted</th></tr>
  ${data.recentOrders.length ? data.recentOrders.map(o=> `<tr><td>${esc(o.status)}</td><td>${fmt(o.total)}</td><td>${fmtDate(o.submittedAt)}</td></tr>`).join("") : `<tr><td colspan="3">No orders.</td></tr>`}
  </table>
  </body></html>`;
}
