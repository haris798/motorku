import { useState, useEffect, useCallback } from 'react';
import { OilLog, FuelLog, AppSettings, SyncStatus } from './types';
import { getSupabaseClient, syncWithSupabase } from './lib/supabaseClient';
import { checkAndSendOilAlert } from './utils/telegram';
import { exportToCSV, exportToPDF } from './utils/export';
import { generateUUID } from './utils/uuid';
import { calculateAndSaveDailyDistance } from './lib/supabaseClient';
import Dashboard from './components/Dashboard';
import OilLogs from './components/OilLogs';
import FuelLogs from './components/FuelLogs';
import SettingsTab from './components/SettingsTab';
import {
  Gauge, Droplets, Fuel, Settings, Cloud, CloudOff, FileSpreadsheet, FileText, RefreshCw,
  Sun, Moon, LogOut
} from 'lucide-react';

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
    url: 'https://pcoyvfhcniscynjkndlw.supabase.co',
    anonKey: 'sb_publishable_4HYaHZhOIECG56Eccpe4sA_xj-Ecy9n',
    connected: true,
  },
  theme: 'light'
};

export default function App() {
  // 1. Core States
  const [oilLogs, setOilLogs] = useState<OilLog[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null);

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [darkMode, setDarkMode] = useState(false);

  // Sync state tracking
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncedAt: null,
    pendingSyncCount: 0,
    isSyncing: false,
  });
  const [syncProgressMsg, setSyncProgressMsg] = useState<string>('');

  const tabsList = [
    { id: 'dashboard', label: 'Dashboard', icon: Gauge },
    { id: 'oil', label: 'Ganti Oli', icon: Droplets },
    { id: 'fuel', label: 'BBM & Efisiensi', icon: Fuel },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ];

  // 2. Load cached data on mount
  useEffect(() => {
    // A. Load Local Settings
    const cachedSettings = localStorage.getItem('oil_tracker_settings');
    let loadedSettings = DEFAULT_SETTINGS;
    if (cachedSettings) {
      try {
        const parsed = JSON.parse(cachedSettings);
        loadedSettings = { ...DEFAULT_SETTINGS, ...parsed };
        setSettings(loadedSettings);
      } catch (e) {
        console.error('Error loading settings from cache', e);
      }
    }

    // B. Load Logs
    const cachedOil = localStorage.getItem('oil_tracker_oil_logs');
    if (cachedOil) {
      try {
        setOilLogs(JSON.parse(cachedOil));
      } catch (e) { }
    }

    const cachedFuel = localStorage.getItem('oil_tracker_fuel_logs');
    if (cachedFuel) {
      try {
        setFuelLogs(JSON.parse(cachedFuel));
      } catch (e) { }
    }

    // C. Setup Theme
    const isDark = loadedSettings.theme === 'dark' || localStorage.getItem('oil_tracker_theme') === 'dark';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // D. Fetch Supabase User Session if configured
    const client = getSupabaseClient();
    if (client) {
      client.auth.getUser().then(async ({ data: { user: sbUser } }) => {
        if (sbUser) {
          setUser(sbUser);
        } else {
          // Auto-login using saved credentials if available
          const savedEmail = localStorage.getItem('supabase_email');
          const savedPassword = localStorage.getItem('supabase_password');

          if (savedEmail && savedPassword) {
            try {
              const { data: { user: signInUser }, error } = await client.auth.signInWithPassword({
                email: savedEmail,
                password: savedPassword,
              });
              if (signInUser && !error) {
                setUser(signInUser);
              } else {
                console.warn('Auto-login gagal:', error?.message);
              }
            } catch (err) {
              console.error('Auto-login exception:', err);
            }
          }
        }
      });

      // Listen for auth state changes
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser(session.user);
        } else {
          setUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  // Update pending sync count whenever logs change or deletions are queued
  useEffect(() => {
    let deletedIds: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('deleted_log_ids') || '[]');
      if (Array.isArray(parsed)) deletedIds = parsed;
    } catch (e) {}
    setSyncStatus(prev => ({
      ...prev,
      pendingSyncCount: deletedIds.length
    }));
  }, [oilLogs, fuelLogs]);

  // 3. Online/Offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-trigger sync if online & logged in
      if (settings.supabase.connected && user) {
        handleTriggerSync();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [settings.supabase.connected, user, oilLogs, fuelLogs]);

  // 4. Periodically check for Telegram Alerts on app load / log updates
  useEffect(() => {
    if (settings.telegram.enabled && oilLogs.length > 0) {
      const maxOilMileage = Math.max(...oilLogs.map(l => l.mileage));
      const maxFuelMileage = fuelLogs.length > 0 ? Math.max(...fuelLogs.map(l => l.mileage)) : 0;
      const currentMileage = Math.max(maxOilMileage, maxFuelMileage);

      const lastOil = oilLogs[0]; // sorted descending

      checkAndSendOilAlert(
        currentMileage,
        lastOil ? { date: lastOil.date, mileage: lastOil.mileage } : null,
        settings.telegram,
        settings.oilChangeIntervalKm,
        settings.oilChangeIntervalDays
      ).then((res) => {
        if (res.triggered) {
          console.log('Telegram Alert dispatched!', res.message);
          // Set lastNotifiedDate to prevent duplication today
          const todayStr = new Date().toISOString().split('T')[0];
          const updated = {
            ...settings,
            telegram: {
              ...settings.telegram,
              lastNotifiedDate: todayStr
            }
          };
          setSettings(updated);
          localStorage.setItem('oil_tracker_settings', JSON.stringify(updated));
        }
      });
    }
  }, [oilLogs, fuelLogs, settings.telegram.enabled]);

  // 5. Auto-sync jarak setiap hari jam 18:00
  useEffect(() => {
    if (!isOnline || !user || !settings.supabase.connected) return;

    const AUTO_SYNC_KEY = 'jarak_autosync_date';
    const SYNC_HOUR = 18; // 18:00 WIB

    const checkAndRun = () => {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const lastSyncDate = localStorage.getItem(AUTO_SYNC_KEY);

      // Only run if past 18:00 and not yet synced today
      if (now.getHours() >= SYNC_HOUR && lastSyncDate !== today) {
        console.log('[AutoSync] Menghitung jarak tempuh hari ini...');
        calculateAndSaveDailyDistance(today).then((result) => {
          if (result.success) {
            console.log('[AutoSync] Berhasil:', result.message);
            localStorage.setItem(AUTO_SYNC_KEY, today);
          } else {
            console.warn('[AutoSync] Gagal:', result.message);
          }
        });
      }
    };

    // Run immediately on mount if conditions are met
    checkAndRun();

    // Then check every 60 seconds
    const interval = setInterval(checkAndRun, 60 * 1000);

    return () => clearInterval(interval);
  }, [isOnline, user, settings.supabase.connected]);

  // 6. Global Actions
  const handleUpdateSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('oil_tracker_settings', JSON.stringify(newSettings));

    // Also save credentials directly for client initialization helper
    if (newSettings.supabase.url && newSettings.supabase.anonKey) {
      localStorage.setItem('supabase_url', newSettings.supabase.url);
      localStorage.setItem('supabase_anon_key', newSettings.supabase.anonKey);
    }
  }, []);

  const handleToggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const nextDark = !prev;
      if (nextDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('oil_tracker_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('oil_tracker_theme', 'light');
      }
      return nextDark;
    });
  }, []);

  // Perform full database cloud sync
  const handleTriggerSync = useCallback(async (customOilLogs?: OilLog[], customFuelLogs?: FuelLog[]) => {
    if (!isOnline) {
      alert('Tidak ada koneksi internet. Sinkronisasi ditunda.');
      return;
    }
    setSyncStatus(prev => ({ ...prev, isSyncing: true }));
    setSyncProgressMsg('Menghubungkan ke Supabase...');

    try {
      const logsToSyncOil = customOilLogs || oilLogs;
      const logsToSyncFuel = customFuelLogs || fuelLogs;
      const result = await syncWithSupabase(logsToSyncOil, logsToSyncFuel, (progress) => {
        setSyncProgressMsg(progress);
      });

      if (result.success) {
        // Update local logs with merged data
        setOilLogs(result.syncedOilLogs);
        setFuelLogs(result.syncedFuelLogs);

        localStorage.setItem('oil_tracker_oil_logs', JSON.stringify(result.syncedOilLogs));
        localStorage.setItem('oil_tracker_fuel_logs', JSON.stringify(result.syncedFuelLogs));

        setSyncStatus({
          lastSyncedAt: new Date().toISOString(),
          pendingSyncCount: 0,
          isSyncing: false
        });
        setSyncProgressMsg('Sinkronisasi selesai!');
        setTimeout(() => setSyncProgressMsg(''), 3000);
      } else {
        setSyncStatus(prev => ({ ...prev, isSyncing: false }));
        setSyncProgressMsg('');
        alert(result.message);
      }
    } catch (e: any) {
      setSyncStatus(prev => ({ ...prev, isSyncing: false }));
      setSyncProgressMsg('');
      alert(`Gagal sinkronisasi: ${e.message || e}`);
    }
  }, [isOnline, oilLogs, fuelLogs, settings.supabase.connected]);

  const handleLogout = async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut();
      setUser(null);
      // Clean supabase keys from settings on logout to ensure safety
      const clearedSettings = {
        ...settings,
        supabase: { url: '', anonKey: '', connected: false }
      };
      setSettings(clearedSettings);
      localStorage.removeItem('supabase_url');
      localStorage.removeItem('supabase_anon_key');
      localStorage.setItem('oil_tracker_settings', JSON.stringify(clearedSettings));
      alert('Anda telah keluar dari akun cloud.');
    }
  };

  // Log handlers
  const handleAddOilLog = (logData: Omit<OilLog, 'id'>) => {
    const newLog: OilLog = {
      ...logData,
      id: generateUUID(),
      user_id: user?.id,
      updated_at: new Date().toISOString()
    };
    const updated = [newLog, ...oilLogs];
    setOilLogs(updated);
    localStorage.setItem('oil_tracker_oil_logs', JSON.stringify(updated));

    if (settings.supabase.connected && user) {
      handleTriggerSync(updated, undefined);
    }
  };

  const handleEditOilLog = (id: string, updatedData: Partial<OilLog>) => {
    const updated = oilLogs.map(log => {
      if (log.id === id) {
        return {
          ...log,
          ...updatedData,
          updated_at: new Date().toISOString()
        };
      }
      return log;
    });
    setOilLogs(updated);
    localStorage.setItem('oil_tracker_oil_logs', JSON.stringify(updated));

    if (settings.supabase.connected && user) {
      handleTriggerSync(updated, undefined);
    }
  };

  const handleDeleteOilLog = (id: string) => {
    const updated = oilLogs.filter(log => log.id !== id);
    setOilLogs(updated);
    localStorage.setItem('oil_tracker_oil_logs', JSON.stringify(updated));

    // Queue deletion id
    const deletedIds: string[] = JSON.parse(localStorage.getItem('deleted_log_ids') || '[]');
    deletedIds.push(id);
    localStorage.setItem('deleted_log_ids', JSON.stringify(deletedIds));

    if (settings.supabase.connected && user) {
      handleTriggerSync(updated, undefined);
    }
  };

  const handleAddFuelLog = (logData: Omit<FuelLog, 'id'>) => {
    const newLog: FuelLog = {
      ...logData,
      id: generateUUID(),
      user_id: user?.id,
      updated_at: new Date().toISOString()
    };
    const updated = [newLog, ...fuelLogs];
    setFuelLogs(updated);
    localStorage.setItem('oil_tracker_fuel_logs', JSON.stringify(updated));

    if (settings.supabase.connected && user) {
      handleTriggerSync(undefined, updated);
    }
  };

  const handleEditFuelLog = (id: string, updatedData: Partial<FuelLog>) => {
    const updated = fuelLogs.map(log => {
      if (log.id === id) {
        return {
          ...log,
          ...updatedData,
          updated_at: new Date().toISOString()
        };
      }
      return log;
    });
    setFuelLogs(updated);
    localStorage.setItem('oil_tracker_fuel_logs', JSON.stringify(updated));

    if (settings.supabase.connected && user) {
      handleTriggerSync(undefined, updated);
    }
  };

  const handleDeleteFuelLog = (id: string) => {
    const updated = fuelLogs.filter(log => log.id !== id);
    setFuelLogs(updated);
    localStorage.setItem('oil_tracker_fuel_logs', JSON.stringify(updated));

    // Queue deletion id
    const deletedIds: string[] = JSON.parse(localStorage.getItem('deleted_log_ids') || '[]');
    deletedIds.push(id);
    localStorage.setItem('deleted_log_ids', JSON.stringify(deletedIds));

    if (settings.supabase.connected && user) {
      handleTriggerSync(undefined, updated);
    }
  };

  // Auto sync when online and logged in (e.g. on initial load or after login)
  useEffect(() => {
    if (isOnline && user && settings.supabase.connected) {
      handleTriggerSync();
    }
  }, [isOnline, user, settings.supabase.connected]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col md:flex-row overflow-hidden pb-16 md:pb-0">

      {/* 1. Desktop Sidebar (md and larger) */}
      <aside className="hidden md:flex w-64 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col shrink-0 h-screen sticky top-0 justify-between select-none">
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Logo & Header */}
          <div className="p-6 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-600/25 flex items-center justify-center">
                <Gauge className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white leading-none font-display">
                  MOTO-LOG
                </h1>
                <span className="text-[12px] text-slate-400 dark:text-slate-500 font-medium tracking-wide">Oil & Fuel Tracker</span>
              </div>
            </div>
            <button
              onClick={handleToggleDarkMode}
              className="p-2 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl cursor-pointer transition-all border border-slate-150 dark:border-slate-800 shadow-xs"
              title={darkMode ? 'Mode Terang' : 'Mode Gelap'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Nav Tabs */}
          <nav className="p-4 space-y-1 flex-1">
            {tabsList.map((tab) => {
              const IconComponent = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3.5 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-3 cursor-pointer ${isActive
                      ? 'bg-indigo-50/70 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100/40 dark:border-indigo-900/20'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 border border-transparent'
                    }`}
                >
                  <div className={`w-1 h-4 rounded-full ${isActive ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-transparent'}`} />
                  <IconComponent className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sync Status Bottom Widget */}
        <div className="p-4 border-t border-slate-150 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-150 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold text-slate-450 dark:text-slate-500 capitalize tracking-wider">Cloud Sync</span>
              <div
                className={`w-2.5 h-2.5 rounded-full animate-pulse ${!isOnline
                    ? 'bg-rose-500'
                    : syncStatus.pendingSyncCount > 0
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                title={!isOnline ? 'Offline' : syncStatus.pendingSyncCount > 0 ? 'Tertunda sinkronisasi' : 'Sinkron'}
              />
            </div>

            <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300 truncate">
              {!isOnline
                ? 'Koneksi Offline'
                : syncStatus.pendingSyncCount > 0
                  ? `${syncStatus.pendingSyncCount} data belum disinkron`
                  : 'Data Terbaca Sinkron'}
            </p>

            {settings.supabase.connected && user && (
              <button
                onClick={handleTriggerSync}
                disabled={syncStatus.isSyncing || !isOnline}
                className="mt-2.5 w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-lg text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                <span>{syncStatus.isSyncing ? 'Sinkronisasi...' : 'Sinkron Sekarang'}</span>
              </button>
            )}

            <div className="mt-2.5 w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-550 ${!isOnline
                    ? 'bg-rose-500 w-1/3'
                    : syncStatus.pendingSyncCount > 0
                      ? 'bg-amber-500 w-2/3'
                      : 'bg-emerald-500 w-full'
                  }`}
              />
            </div>
          </div>
        </div>
      </aside>

      {/* 2. Main Area Panel */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">

        {/* Mobile Header (md and smaller) */}
        <header className="sticky top-0 z-45 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/80 transition-colors md:hidden shrink-0 pt-[env(safe-area-inset-top)]">
          <div className="px-4 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-600 rounded-xl text-white shadow-md">
                <Gauge className="w-4 h-4" />
              </span>
              <div>
                <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white font-display leading-none">
                  Motor.ku Tracker
                </h1>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Jurnal BBM</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleToggleDarkMode}
                className="p-2 bg-slate-50 dark:bg-slate-800/60 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl cursor-pointer transition-all border border-slate-100 dark:border-slate-800/40"
                title="Ganti Tema"
              >
                {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Mobile Bottom Navigation Bar (App Tensi Style) */}
        <nav id="mobile-bottom-nav" className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-150 dark:border-slate-800/80 pb-safe-bottom z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.25)] flex items-center justify-around h-16 select-none">
          {tabsList.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex flex-col items-center justify-center h-full relative cursor-pointer group transition-all"
              >
                <div className={`absolute inset-y-1.5 inset-x-2 rounded-2xl transition-all duration-300 -z-10 ${isActive
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/20'
                    : 'bg-transparent group-hover:bg-slate-50 dark:group-hover:bg-slate-800/10'
                  }`} />

                <IconComponent className={`w-5 h-5 transition-all duration-300 ${isActive
                    ? 'text-indigo-600 dark:text-indigo-400 scale-110'
                    : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-400'
                  }`} />

                <span className={`text-[11px] mt-1 font-bold tracking-wide transition-all duration-300 ${isActive
                    ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                    : 'text-slate-400 dark:text-slate-500'
                  }`}>
                  {tab.label}
                </span>

                {isActive && (
                  <span className="absolute bottom-1 w-1 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.6)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Desktop Header Row (md and larger) */}
        <header className="hidden md:flex h-20 border-b border-slate-150 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md items-center justify-between px-8 select-none shrink-0">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
              {activeTab === 'dashboard' && 'Overview Performa'}
              {activeTab === 'oil' && 'Riwayat Servis & Ganti Oli'}
              {activeTab === 'fuel' && 'Pencatatan BBM & Efisiensi'}
              {activeTab === 'settings' && 'Pengaturan'}
            </h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
              {user ? `Terhubung: ${user.email}` : 'Mode Penyimpanan Lokal Aktif (Offline Ready)'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Online Badge */}
            <span
              className={`inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-xl ${isOnline
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100/60 dark:border-emerald-900/30'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-100/60 dark:border-rose-900/30'
                }`}
            >
              {isOnline ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </span>

            {/* Cloud trigger */}
            {user ? (
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Hi, <b className="text-slate-800 dark:text-slate-200">{user.email.split('@')[0]}</b>
                </span>
              </div>
            ) : (
              <button
                id="btn-nav-cloud-connect"
                onClick={() => setActiveTab('settings')}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-bold rounded-xl shadow-md cursor-pointer transition-all"
              >
                <Cloud className="w-4 h-4" />
                <span>Hubungkan Cloud</span>
              </button>
            )}

            {/* Exports */}
            <div className="flex items-center border-l border-slate-200 dark:border-slate-800 pl-3 gap-1.5">
              <button
                id="btn-export-pdf"
                onClick={() => exportToPDF(oilLogs, fuelLogs)}
                title="Cetak Laporan PDF"
                className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-rose-600 transition-all cursor-pointer"
              >
                <FileText className="w-4.5 h-4.5" />
              </button>
              <button
                id="btn-export-csv"
                onClick={() => exportToCSV(oilLogs, fuelLogs, 'all')}
                title="Unduh Laporan CSV"
                className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-emerald-600 transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={handleToggleDarkMode}
              className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-indigo-600 transition-all cursor-pointer"
              title="Ganti Tema"
            >
              {darkMode ? <Sun className="w-4.5 h-4.5 text-amber-500" /> : <Moon className="w-4.5 h-4.5 text-slate-600" />}
            </button>
          </div>
        </header>

        {/* Sync Progress Indicator Banner */}
        {syncProgressMsg && (
          <div className="w-full bg-indigo-600 text-white text-center py-2 text-sm font-bold animate-pulse flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>{syncProgressMsg}</span>
          </div>
        )}

        {/* 3. Main Stage Container */}
        <main className="flex-1 p-6 sm:p-8 pb-28 md:pb-8 overflow-y-auto max-w-7xl w-full mx-auto space-y-6">
          {activeTab === 'dashboard' && (
            <Dashboard
              oilLogs={oilLogs}
              fuelLogs={fuelLogs}
              settings={settings}
              onNavigate={(tab) => {
                setActiveTab(tab);
                // Open modal if they clicked add oil/fuel on dashboard to make it quick
                setTimeout(() => {
                  const btnId = tab === 'oil' ? 'btn-add-oil-log' : 'btn-add-fuel-log';
                  document.getElementById(btnId)?.click();
                }, 100);
              }}
            />
          )}

          {activeTab === 'oil' && (
            <OilLogs
              logs={oilLogs}
              onAddLog={handleAddOilLog}
              onEditLog={handleEditOilLog}
              onDeleteLog={handleDeleteOilLog}
              settings={settings}
            />
          )}

          {activeTab === 'fuel' && (
            <FuelLogs
              logs={fuelLogs}
              onAddLog={handleAddFuelLog}
              onEditLog={handleEditFuelLog}
              onDeleteLog={handleDeleteFuelLog}
              settings={settings}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              settings={settings}
              syncStatus={syncStatus}
              user={user}
              oilLogs={oilLogs}
              fuelLogs={fuelLogs}
              onUpdateSettings={handleUpdateSettings}
              onTriggerSync={handleTriggerSync}
              onOpenAuth={() => setActiveTab('settings')}
              onLogout={handleLogout}
            />
          )}
        </main>

        {/* 4. Geometric Footer / Bottom Bar */}
        <footer className="h-12 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between px-6 sm:px-8 bg-white/20 dark:bg-slate-900/30 text-[12px] text-slate-400 dark:text-slate-500 capitalize tracking-widest font-mono font-semibold shrink-0 select-none">
        </footer>
      </div>
    </div>
  );
}
