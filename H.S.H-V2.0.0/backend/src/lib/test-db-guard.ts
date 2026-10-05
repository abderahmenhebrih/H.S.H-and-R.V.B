/**
 * Central fail-closed guard separating ordinary integration tests from
 * intentional live-production QA.
 *
 * Two entry points:
 * - assertSafeTestDatabase(uri): ordinary tests call this BEFORE connecting.
 *   Refuses unconditionally when the resolved database is production.
 *   There is deliberately NO override: ordinary tests must never mutate prod.
 * - assertLiveQaTarget(uri): intentional live-QA scripts call this BEFORE
 *   connecting. Requires ALLOW_PRODUCTION_QA=1 plus an explicit liveQa flag.
 *
 * Multiple signals are combined (§7): exact production database name parsed
 * from the URI, the known production cluster fingerprint, and the test-runner
 * environment flags. Refusal happens before any connection/mutation.
 */

export const PRODUCTION_DB_NAMES: readonly string[] = ["hebrih-slaughter-house"];

export const PRODUCTION_CLUSTER_FINGERPRINTS: readonly string[] = ["omxs0ia"];

/** Tags of real management identities that destructive QA must never delete
 * without an explicit destructive override. */
export const PROTECTED_MANAGER_TAGS: readonly string[] = ["abattoire"];

export const REFUSAL_MESSAGE =
  "REFUSING TO RUN TESTS AGAINST PRODUCTION DATABASE";

export function isTestRunner(): boolean {
  return process.env.NODE_ENV === "test" || process.env.RVB_TEST_MODE === "true";
}

export function dbNameFromUri(uri: string): string | null {
  try {
    const withoutQuery = String(uri).split("?")[0].trim();
    // Strip mongodb://credentials@host... / mongodb+srv://... prefixes
    const slashIdx = withoutQuery.indexOf("/", withoutQuery.indexOf("://") + 3);
    if (slashIdx === -1) return null;
    const last = withoutQuery.slice(slashIdx + 1).trim();
    if (!last) return null;
    return decodeURIComponent(last);
  } catch {
    return null;
  }
}

function isProductionDbName(db: string | null): boolean {
  if (!db) return false;
  return (PRODUCTION_DB_NAMES as readonly string[]).includes(db.toLowerCase());
}

function hitsProductionCluster(uri: string): boolean {
  const lower = String(uri).toLowerCase();
  return PRODUCTION_CLUSTER_FINGERPRINTS.some((fp) => lower.includes(fp.toLowerCase()));
}

/**
 * Ordinary integration tests: abort before connecting when the target is
 * production. No override exists on this path by design.
 * @returns the resolved (non-production) database name, or null if unparseable.
 */
export function assertSafeTestDatabase(uri: string | undefined | null): string | null {
  if (!uri || !String(uri).trim()) {
    throw new Error(`${REFUSAL_MESSAGE}: MONGODB_URI is not set.`);
  }
  const db = dbNameFromUri(uri);
  if (isProductionDbName(db)) {
    throw new Error(
      `${REFUSAL_MESSAGE} (database "${db}"). Ordinary tests must target a test database ` +
        `(e.g. hebrih-slaughter-house-test or hebrih-slaughter-house-test-<runId>). ` +
        `Intentional live QA must use assertLiveQaTarget with ALLOW_PRODUCTION_QA=1.`,
    );
  }
  if (!db && hitsProductionCluster(uri)) {
    throw new Error(
      `${REFUSAL_MESSAGE} (unparseable database on a production cluster host). ` +
        `Refusing to guess: set an explicit test database name.`,
    );
  }
  return db;
}

/**
 * Intentional live-production QA scripts: require an explicit opt-in AND an
 * explicit caller-side liveQa flag. Never usable by ordinary test suites.
 */
export function assertLiveQaTarget(uri: string | undefined | null, opts?: { liveQa?: boolean }): string | null {
  if (!uri || !String(uri).trim()) {
    throw new Error("Live QA aborted: MONGODB_URI is not set.");
  }
  if (opts?.liveQa !== true) {
    throw new Error(
      "Live QA aborted: caller did not declare liveQa:true. Ordinary tests must use assertSafeTestDatabase.",
    );
  }
  if (process.env.ALLOW_PRODUCTION_QA !== "1") {
    throw new Error(
      "Live QA aborted: ALLOW_PRODUCTION_QA=1 is required for intentional production access. Nothing was modified.",
    );
  }
  return dbNameFromUri(uri);
}

/**
 * Destructive QA/cleanup scripts: refuse to delete a real management account
 * unless an explicit destructive override is supplied. Normal DELETE API
 * semantics are unchanged (this helper is only for QA/cleanup scripts).
 */
export async function assertRealManagerDeletable(
  accountsCollection: { findOne: (filter: any) => Promise<any> },
  opts?: { destructiveOverride?: boolean },
): Promise<void> {
  const override = opts?.destructiveOverride ?? process.env.ALLOW_DELETE_REAL_MANAGER === "YES";
  if (override) return;
  for (const tag of PROTECTED_MANAGER_TAGS) {
    const found = await accountsCollection.findOne({ tag }).catch(() => null);
    if (found) {
      throw new Error(
        `Destructive QA aborted: real management account @${tag} exists in the target database. ` +
          `Set ALLOW_DELETE_REAL_MANAGER=YES to override. Nothing was modified.`,
      );
    }
  }
}
