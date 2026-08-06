import { create } from 'zustand';
import { OilLog, FuelLog, AppSettings, SyncStatus } from '../types';
import { storage } from '../lib/storage';
import { generateUUID } from '../utils/uuid';
import { User } from '@supabase/supabase-js';

const DEFAULT_SETTINGS: AppSettings = {
  oilChangeIntervalKm: 2000,
  oilChangeIntervalDays: 90,
  fuelPricePerLiter: 10,
  telegram: {
    botToken: '',
    chatId: '',
    enabled: false,
    notifyOnDaysBefore: 7,
    notifyOnKmBefore: 200,
  },
  supabase: {
    url: '',
    anonKey: '',
    connected: false,
  },
  theme: 'light'
};

interface AppState {
  // State
  oilLogs: OilLog[];
  fuelLogs: FuelLog[];
  settings: AppSettings;
  user: User | null;
  activeTab: string;
  isOnline: boolean;
  darkMode: boolean;
  syncStatus: SyncStatus;
  syncProgressMsg: string;

  // Actions - Init
  initStore: () => Promise<void>;
  
  // Actions - Settings
  setSettings: (newSettings: AppSettings) => Promise<void>;
  setDarkMode: (isDark: boolean) => Promise<void>;
  setActiveTab: (tab: string) => void;
  setOnlineStatus: (isOnline: boolean) => void;
  
  // Actions - Auth
  setUser: (user: User | null) => void;
  
  // Actions - Sync
  setSyncStatus: (status: Partial<SyncStatus>) => void;
  setSyncProgressMsg: (msg: string) => void;
  triggerSync: () => Promise<void>;

  // Actions - Oil Logs
  addOilLog: (logData: Omit<OilLog, 'id'>) => Promise<void>;
  editOilLog: (id: string, updatedData: Partial<OilLog>) => Promise<void>;
  deleteOilLog: (id: string) => Promise<void>;

  // Actions - Fuel Logs
  addFuelLog: (logData: Omit<FuelLog, 'id'>) => Promise<void>;
  editFuelLog: (id: string, updatedData: Partial<FuelLog>) => Promise<void>;
  deleteFuelLog: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  oilLogs: [],
  fuelLogs: [],
  settings: DEFAULT_SETTINGS,
  user: null,
  activeTab: 'dashboard',
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  darkMode: false,
  syncStatus: {
    lastSyncedAt: null,
    pendingSyncCount: 0,
    isSyncing: false,
  },
  syncProgressMsg: '',

  initStore: async () => {
    const settings = await storage.getSettings() || DEFAULT_SETTINGS;
    const oilLogs = await storage.getOilLogs();
    const fuelLogs = await storage.getFuelLogs();
    const theme = await storage.getTheme();
    const deletedIds = await storage.getDeletedIds();

    const isDark = settings.theme === 'dark' || theme === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    set({ 
      settings, 
      oilLogs, 
      fuelLogs, 
      darkMode: isDark,
      syncStatus: {
        lastSyncedAt: null,
        pendingSyncCount: deletedIds.length,
        isSyncing: false
      }
    });
  },

  setSettings: async (newSettings: AppSettings) => {
    await storage.saveSettings(newSettings);
    set({ settings: newSettings });
  },

  setDarkMode: async (isDark: boolean) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      await storage.saveTheme('dark');
    } else {
      document.documentElement.classList.remove('dark');
      await storage.saveTheme('light');
    }
    set({ darkMode: isDark });
  },

  setActiveTab: (tab: string) => set({ activeTab: tab }),
  
  setOnlineStatus: (isOnline: boolean) => set({ isOnline }),
  
  setUser: (user: User | null) => set({ user }),

  setSyncStatus: (status: Partial<SyncStatus>) => set((state) => ({ 
    syncStatus: { ...state.syncStatus, ...status } 
  })),

  setSyncProgressMsg: (msg: string) => set({ syncProgressMsg: msg }),

  triggerSync: async () => {
    const state = get();
    if (!state.isOnline) {
      alert('Tidak ada koneksi internet. Sinkronisasi ditunda.');
      return;
    }
    if (!state.settings.supabase.connected || !state.user) return;

    set({ syncStatus: { ...state.syncStatus, isSyncing: true }, syncProgressMsg: 'Menghubungkan ke Supabase...' });

    try {
      // Lazy load worker
      const SyncWorker = new Worker(new URL('../workers/sync.worker.ts', import.meta.url), { type: 'module' });
      
      SyncWorker.onmessage = async (e) => {
        const { type, payload } = e.data;
        
        if (type === 'progress') {
          set({ syncProgressMsg: payload });
        } else if (type === 'success') {
          const { syncedOilLogs, syncedFuelLogs } = payload;
          
          await storage.saveOilLogs(syncedOilLogs);
          await storage.saveFuelLogs(syncedFuelLogs);
          await storage.clearDeletedIds();
          
          set({ 
            oilLogs: syncedOilLogs, 
            fuelLogs: syncedFuelLogs,
            syncStatus: {
              lastSyncedAt: new Date().toISOString(),
              pendingSyncCount: 0,
              isSyncing: false
            },
            syncProgressMsg: 'Sinkronisasi selesai!'
          });
          
          setTimeout(() => set({ syncProgressMsg: '' }), 3000);
          SyncWorker.terminate();
        } else if (type === 'error') {
          set({ syncStatus: { ...state.syncStatus, isSyncing: false }, syncProgressMsg: '' });
          alert(`Gagal sinkronisasi: ${payload}`);
          SyncWorker.terminate();
        }
      };

      const deletedIds = await storage.getDeletedIds();
      
      SyncWorker.postMessage({
        type: 'start_sync',
        payload: {
          localOilLogs: state.oilLogs,
          localFuelLogs: state.fuelLogs,
          deletedIds,
          userId: state.user.id,
          settings: state.settings,
          supabaseUrl: state.settings.supabase.url,
          supabaseKey: state.settings.supabase.anonKey
        }
      });
      
    } catch (e: any) {
      set({ syncStatus: { ...state.syncStatus, isSyncing: false }, syncProgressMsg: '' });
      alert(`Gagal sinkronisasi worker: ${e.message || e}`);
    }
  },

  addOilLog: async (logData: Omit<OilLog, 'id'>) => {
    const state = get();
    const newLog: OilLog = {
      ...logData,
      id: generateUUID(),
      user_id: state.user?.id,
      updated_at: new Date().toISOString()
    };
    
    const updated = [newLog, ...state.oilLogs];
    await storage.saveOilLogs(updated);
    set({ oilLogs: updated });
    
    if (state.settings.supabase.connected && state.user) {
      state.triggerSync();
    }
  },

  editOilLog: async (id: string, updatedData: Partial<OilLog>) => {
    const state = get();
    const updated = state.oilLogs.map(log => {
      if (log.id === id) {
        return {
          ...log,
          ...updatedData,
          updated_at: new Date().toISOString()
        };
      }
      return log;
    });
    
    await storage.saveOilLogs(updated);
    set({ oilLogs: updated });
    
    if (state.settings.supabase.connected && state.user) {
      state.triggerSync();
    }
  },

  deleteOilLog: async (id: string) => {
    const state = get();
    const updated = state.oilLogs.filter(log => log.id !== id);
    
    await storage.saveOilLogs(updated);
    await storage.addDeletedId(id);
    
    const deletedIds = await storage.getDeletedIds();
    set({ 
      oilLogs: updated,
      syncStatus: { ...state.syncStatus, pendingSyncCount: deletedIds.length }
    });
    
    if (state.settings.supabase.connected && state.user) {
      state.triggerSync();
    }
  },

  addFuelLog: async (logData: Omit<FuelLog, 'id'>) => {
    const state = get();
    const newLog: FuelLog = {
      ...logData,
      id: generateUUID(),
      user_id: state.user?.id,
      updated_at: new Date().toISOString()
    };
    
    const updated = [newLog, ...state.fuelLogs];
    await storage.saveFuelLogs(updated);
    set({ fuelLogs: updated });
    
    if (state.settings.supabase.connected && state.user) {
      state.triggerSync();
    }
  },

  editFuelLog: async (id: string, updatedData: Partial<FuelLog>) => {
    const state = get();
    const updated = state.fuelLogs.map(log => {
      if (log.id === id) {
        return {
          ...log,
          ...updatedData,
          updated_at: new Date().toISOString()
        };
      }
      return log;
    });
    
    await storage.saveFuelLogs(updated);
    set({ fuelLogs: updated });
    
    if (state.settings.supabase.connected && state.user) {
      state.triggerSync();
    }
  },

  deleteFuelLog: async (id: string) => {
    const state = get();
    const updated = state.fuelLogs.filter(log => log.id !== id);
    
    await storage.saveFuelLogs(updated);
    await storage.addDeletedId(id);
    
    const deletedIds = await storage.getDeletedIds();
    set({ 
      fuelLogs: updated,
      syncStatus: { ...state.syncStatus, pendingSyncCount: deletedIds.length }
    });
    
    if (state.settings.supabase.connected && state.user) {
      state.triggerSync();
    }
  },
}));
