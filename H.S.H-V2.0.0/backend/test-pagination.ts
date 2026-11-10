import { parsePaging, pagingMeta } from "./src/lib/pagination";

function eq(a: any, b: any, label: string) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`${label}: expected ${y}, got ${x}`);
}

async function main() {
  // Absent params -> legacy unbounded path (null).
  eq(parsePaging({}), null, "empty query");
  eq(parsePaging({ search: "x" }), null, "unrelated query");
  // Present params -> bounded, clamped, 1-based.
  eq(parsePaging({ limit: "25" }), { page: 1, limit: 25, skip: 0 }, "limit only");
  eq(parsePaging({ page: "3", limit: "10" }), { page: 3, limit: 10, skip: 20 }, "page+limit");
  eq(parsePaging({ page: "0", limit: "0" }), { page: 1, limit: 50, skip: 0 }, "clamp to minimums");
  eq(parsePaging({ limit: "99999" }), { page: 1, limit: 200, skip: 0 }, "cap at default max");
  eq(parsePaging({ limit: "99999" }, { maxLimit: 100 }), { page: 1, limit: 100, skip: 0 }, "custom cap");
  eq(parsePaging({ limit: "10" }, { defaultLimit: 25 }), { page: 1, limit: 10, skip: 0 }, "explicit beats default");
  eq(parsePaging({ page: ["2"], limit: ["5"] }), { page: 2, limit: 5, skip: 5 }, "array query values");
  // Metadata helper.
  eq(
    pagingMeta(95, { page: 2, limit: 25, skip: 25 }),
    { total: 95, page: 2, limit: 25, totalPages: 4, hasMore: true },
    "middle page",
  );
  eq(
    pagingMeta(50, { page: 2, limit: 25, skip: 25 }),
    { total: 50, page: 2, limit: 25, totalPages: 2, hasMore: false },
    "last page",
  );
  console.log("pagination unit test passed.");
}

main().catch((e) => {
  console.error("pagination unit test FAILED:", e?.message || e);
  process.exit(1);
});
