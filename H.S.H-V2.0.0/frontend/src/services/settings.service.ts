import { settingsRepository } from "../repositories/settings.repository";
import type { Settings } from "../types/settings/settings";
import { BaseService } from "./base.service";

export class SettingsService extends BaseService {
  async get(): Promise<Settings | undefined> {
    return settingsRepository.get();
  }

  async save(settings: Settings): Promise<void> {
    await settingsRepository.save(settings);
  }

  async delete(): Promise<void> {
    await settingsRepository.delete();
  }
}

export const settingsService = new SettingsService();
