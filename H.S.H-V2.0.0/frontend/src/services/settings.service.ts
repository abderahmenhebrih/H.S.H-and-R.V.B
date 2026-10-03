import { settingsRepository } from "../repositories/settings.repository";
import type { Settings } from "../types/settings/settings";
import { setCachedSettings } from "../lib/settings";
import { BaseService } from "./base.service";

export class SettingsService extends BaseService {
  async get(): Promise<Settings | undefined> {
    return settingsRepository.get();
  }

  async save(settings: Settings): Promise<void> {
    await settingsRepository.save(settings);
    // Publish to the session-shared live cache (see lib/settings). This is
    // the funnel for every Dexie write, so newly mounted shells start from
    // the current preference instead of flashing the default.
    setCachedSettings(settings);
  }

  async delete(): Promise<void> {
    await settingsRepository.delete();
  }
}

export const settingsService = new SettingsService();
