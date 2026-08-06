import localforage from 'localforage';
import { OilLog, FuelLog, AppSettings } from '../types';

// Initialize localforage instances for different stores if needed, 
// but a single default instance is usually fine for this size.
localforage.config({
  name: 'MotorKuTracker',
  version: 1.0,
  storeName: 'motorku_data', // Should be alphanumeric, with underscores
  description: 'Offline storage for MotorKu Tracker'
});

const KEYS = {
  SETTINGS: 'oil_tracker_settings',
  OIL_LOGS: 'oil_tracker_oil_logs',
  FUEL_LOGS: 'oil_tracker_fuel_logs',
  DELETED_IDS: 'deleted_log_ids',
  THEME: 'oil_tracker_theme',
};

export const storage = {
  // --- Settings ---
  async getSettings(): Promise<AppSettings | null> {
    return await localforage.getItem<AppSettings>(KEYS.SETTINGS);
  },
  async saveSettings(settings: AppSettings): Promise<void> {
    await localforage.setItem(KEYS.SETTINGS, settings);
  },

  // --- Oil Logs ---
  async getOilLogs(): Promise<OilLog[]> {
    const logs = await localforage.getItem<OilLog[]>(KEYS.OIL_LOGS);
    return logs || [];
  },
  async saveOilLogs(logs: OilLog[]): Promise<void> {
    await localforage.setItem(KEYS.OIL_LOGS, logs);
  },

  // --- Fuel Logs ---
  async getFuelLogs(): Promise<FuelLog[]> {
    const logs = await localforage.getItem<FuelLog[]>(KEYS.FUEL_LOGS);
    return logs || [];
  },
  async saveFuelLogs(logs: FuelLog[]): Promise<void> {
    await localforage.setItem(KEYS.FUEL_LOGS, logs);
  },

  // --- Deleted IDs ---
  async getDeletedIds(): Promise<string[]> {
    const ids = await localforage.getItem<string[]>(KEYS.DELETED_IDS);
    return ids || [];
  },
  async addDeletedId(id: string): Promise<void> {
    const ids = await this.getDeletedIds();
    ids.push(id);
    await localforage.setItem(KEYS.DELETED_IDS, ids);
  },
  async clearDeletedIds(): Promise<void> {
    await localforage.setItem(KEYS.DELETED_IDS, []);
  },

  // --- Theme ---
  async getTheme(): Promise<string | null> {
    return await localforage.getItem<string>(KEYS.THEME);
  },
  async saveTheme(theme: string): Promise<void> {
    await localforage.setItem(KEYS.THEME, theme);
  },
};
