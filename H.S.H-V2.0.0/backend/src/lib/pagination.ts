/**
 * Optional, backward-compatible list pagination.
 *
 * When the caller passes no `page`/`limit` query params, `parsePaging`
 * returns null and endpoints MUST run their exact legacy unbounded query —
 * existing web clients depend on full lists. When params are present,
 * endpoints apply DB-level skip/limit and append paging metadata.
 */
export interface Paging {
  page: number;
  limit: number;
  skip: number;
}

const ABS_MAX = 500;

export function parsePaging(
  query: any,
  opts?: { defaultLimit?: number; maxLimit?: number },
): Paging | null {
  const rawPage = query?.page;
  const rawLimit = query?.limit;
  if (rawPage === undefined && rawLimit === undefined) return null;
  const first = (v: any) => (Array.isArray(v) ? v[0] : v);
  const maxLimit = Math.min(Math.max(opts?.maxLimit ?? 200, 1), ABS_MAX);
  const limit = Math.min(Math.max(Number(first(rawLimit)) || opts?.defaultLimit || 50, 1), maxLimit);
  const page = Math.max(Number(first(rawPage)) || 1, 1);
  return { page, limit, skip: (page - 1) * limit };
}

export function pagingMeta(total: number, paging: Paging): {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
} {
  return {
    total,
    page: paging.page,
    limit: paging.limit,
    totalPages: Math.max(1, Math.ceil(total / paging.limit)),
    hasMore: paging.skip + paging.limit < total,
  };
}
