import type { WorkerProfile, WorkerFinancialEvent } from "@/types/worker";

export function sanitizeForPdf(worker: WorkerProfile, events: WorkerFinancialEvent[], currency: string) {
  // Only own information, no tokens, no serverRevision, no _id
  return {
    header: "Poultry Business Suite — Worker Profile",
    worker: {
      name: worker.name,
      position: worker.position,
      phone: worker.phone,
      address: worker.address || null,
      employmentDate: worker.employmentDate,
      monthlySalary: worker.monthlySalary,
      startingSalary: worker.startingSalary,
      currentCredit: worker.balance,
      currency,
    },
    bonuses: events.filter((e) => e.type === "bonus").slice(0, 20).map((e) => ({ amount: e.amount, date: e.createdAt, note: e.note })),
    absences: events.filter((e) => e.type === "absence").slice(0, 20).map((e) => ({ amount: e.amount, date: e.createdAt, note: e.note })),
    recentFinancial: events.slice(0, 10).map((e) => ({ type: e.type, amount: e.amount, date: e.createdAt, note: e.note })),
    generatedAt: Date.now(),
  };
}

export function buildWorkerPdfHtml(data: ReturnType<typeof sanitizeForPdf>): string {
  const { worker, bonuses, absences, recentFinancial } = data;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g,"&gt;");
  const fmt = (n:number)=> new Intl.NumberFormat("fr-DZ").format(n) + " " + worker.currency;
  const fmtDate = (ms:number)=> new Date(ms).toLocaleDateString("fr-FR");
  return `
  <html>
  <head><meta charset="utf-8" /><style>
  body{font-family: Helvetica, Arial, sans-serif; padding:24px; color:#0F172A}
  h1{font-size:20px; color:#0F766E; border-bottom:2px solid #0F766E; padding-bottom:8px}
  h2{font-size:14px; color:#334155; margin-top:18px; border-bottom:1px solid #E2E8F0; padding-bottom:4px}
  table{width:100%; border-collapse:collapse; margin-top:8px}
  td,th{border:1px solid #E2E8F0; padding:6px 8px; font-size:11px; text-align:left}
  th{background:#F8FAFC}
  .label{color:#64748B; font-size:11px}
  .value{font-weight:600}
  </style></head>
  <body>
  <h1>Poultry Business Suite — Worker Profile</h1>
  <p style="font-size:11px;color:#64748B">Generated ${fmtDate(data.generatedAt)}</p>
  <h2>Worker Information</h2>
  <table>
  <tr><td class="label">Name</td><td class="value">${esc(worker.name)}</td></tr>
  <tr><td class="label">Position</td><td class="value">${esc(worker.position)}</td></tr>
  <tr><td class="label">Phone</td><td class="value">${esc(worker.phone)}</td></tr>
  <tr><td class="label">Address</td><td class="value">${esc(worker.address || "-")}</td></tr>
  <tr><td class="label">Employment Date</td><td class="value">${fmtDate(worker.employmentDate)}</td></tr>
  <tr><td class="label">Current Credit</td><td class="value">${fmt(worker.currentCredit)}</td></tr>
  <tr><td class="label">Monthly Salary</td><td class="value">${fmt(worker.monthlySalary)}</td></tr>
  <tr><td class="label">Starting Salary</td><td class="value">${fmt(worker.startingSalary)}</td></tr>
  </table>
  <h2>Bonuses (${bonuses.length})</h2>
  <table><tr><th>Date</th><th>Amount</th><th>Note</th></tr>
  ${bonuses.length ? bonuses.map(b=>`<tr><td>${fmtDate(b.date)}</td><td>${fmt(b.amount)}</td><td>${esc(b.note||"")}</td></tr>`).join("") : `<tr><td colspan="3">No bonuses recorded.</td></tr>`}
  </table>
  <h2>Absences (${absences.length})</h2>
  <table><tr><th>Date</th><th>Amount/Note</th></tr>
  ${absences.length ? absences.map(a=>`<tr><td>${fmtDate(a.date)}</td><td>${esc(a.note||"")}</td></tr>`).join("") : `<tr><td colspan="2">No absences recorded.</td></tr>`}
  </table>
  <h2>Recent Financial History</h2>
  <table><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th></tr>
  ${recentFinancial.length ? recentFinancial.map(f=>`<tr><td>${fmtDate(f.date)}</td><td>${esc(f.type)}</td><td>${fmt(f.amount)}</td><td>${esc(f.note||"")}</td></tr>`).join("") : `<tr><td colspan="4">No financial events.</td></tr>`}
  </table>
  </body></html>
  `;
}
