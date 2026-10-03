import { settingsRepository } from "../repositories/settings.repository";
import type { NavigationStyle, Settings } from "../types/settings/settings";
import {
  adoptSettingsSilent,
  DEFAULT_SETTINGS,
  getCachedSettings,
  isValidNavigationStyleValue,
  publishSettings,
  readMirroredNavigationStyle,
  resolveNavigationStyle,
} from "../lib/settings";
import { BaseService } from "./base.service";

// Serialized chain for navigationStyle mutations issued outside the HSH
// settings page queue (RVB settings page, legacy RVB shim). Guarantees rapid
// toggles persist strictly in request order so the LAST selection always
// wins and no delayed async save can overwrite a newer one.
let navigationSaveChain: Promise<unknown> = Promise.resolve();

function normalizeStoredNavigation(
  stored: (Settings & { rvbNavigationStyle?: unknown }) | undefined,
): NavigationStyle | undefined {
  if (!stored) return undefined;
  if (isValidNavigationStyleValue(stored.navigationStyle)) return stored.navigationStyle;
  // One-time adoption of the obsolete Dexie row field, then dropped.
  if (isValidNavigationStyleValue((stored as { rvbNavigationStyle?: unknown }).rvbNavigationStyle)) {
    return (stored as { rvbNavigationStyle?: unknown }).rvbNavigationStyle as NavigationStyle;
  }
  return undefined;
}

export class SettingsService extends BaseService {
  async get(): Promise<Settings | undefined> {
    return settingsRepository.get();
  }

  async save(settings: Settings): Promise<void> {
    await settingsRepository.save(settings);
    // Single canonical funnel: every Dexie write publishes the SAME value
    // to the shared live cache, the cross-tab mirror, and both event
    // channels (persist-then-publish ordering, so cross-tab `storage`
    // readers always find fresh canonical state).
    publishSettings(settings);
  }

  // Canonical loader used by EVERY shell/settings mount. Dexie-first;
  // one-time legacy migration only when no canonical value exists; canonical
  // default otherwise. Silent (no events) — mounts set their own state.
  // Legacy RVB storage is consulted ONLY in the missing-canonical branches
  // below, never as a competing runtime source.
  async loadCanonicalSettings(): Promise<Settings> {
    const stored = await settingsRepository.get();
    if (stored) {
      const nav = normalizeStoredNavigation(stored);
      if (nav !== undefined && stored.navigationStyle === nav) {
        const canonical: Settings = { ...DEFAULT_SETTINGS, ...stored, expenseTypes: stored.expenseTypes ?? [] };
        adoptSettingsSilent(canonical);
        return canonical;
      }
      // Missing/invalid nav, or obsolete row field: adopt once, persist the
      // repaired canonical row (this also heals rows written by older
      // bundles that never stored navigationStyle).
      const rest = { ...stored } as Settings & {
        rvbNavigationStyle?: unknown;
      };
      delete rest.rvbNavigationStyle;
      const normalized: Settings = {
        ...DEFAULT_SETTINGS,
        ...rest,
        navigationStyle: nav ?? resolveNavigationStyle(undefined),
      };
      await this.save(normalized);
      return normalized;
    }
    // No canonical row: one-time legacy migration.
    const mirror = readMirroredNavigationStyle();
    let legacy: NavigationStyle | undefined = mirror;
    if (legacy === undefined) {
      try {
        const { getEffectiveNavigationStyle } = await import("./rvb-ui-preferences.service");
        legacy = await getEffectiveNavigationStyle();
      } catch {
        legacy = undefined;
      }
    }
    const migrated: Settings = {
      ...DEFAULT_SETTINGS,
      ...(legacy !== undefined ? { navigationStyle: legacy } : {}),
    };
    await this.save(migrated);
    return migrated;
  }

  // ONE canonical navigationStyle mutation path (see module chain above).
  // Reads the latest canonical base (live cache first), changes ONLY the
  // navigation field, persists, then publishes. Theme and all other fields
  // are never touched here.
  setNavigationStyle(style: NavigationStyle): Promise<Settings> {
    const run = async (): Promise<Settings> => {
      const resolved = resolveNavigationStyle(style);
      const cached = getCachedSettings();
      const base: Settings = cached ?? (await settingsRepository.get()) ?? DEFAULT_SETTINGS;
      const rest = { ...base } as Settings & {
        rvbNavigationStyle?: unknown;
      };
      delete rest.rvbNavigationStyle;
      const next: Settings = { ...DEFAULT_SETTINGS, ...rest, navigationStyle: resolved };
      await this.save(next);
      return next;
    };
    const pending = navigationSaveChain.then(run, run);
    navigationSaveChain = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  async delete(): Promise<void> {
    await settingsRepository.delete();
  }
}

export const settingsService = new SettingsService();
