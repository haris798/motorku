import React, { useState } from 'react';
import { AppSettings, SyncStatus, OilLog, FuelLog } from '../types';
import { testSupabaseConnection, SUPABASE_SQL_SCRIPT, getSupabaseClient } from '../lib/supabaseClient';
import { sendTelegramNotification } from '../utils/telegram';
import {
  Settings, Database, Send, Calendar, Milestone, Moon, Sun, Eye, EyeOff,
  Clipboard, Check, ShieldCheck, HelpCircle, LogIn, LogOut, RefreshCw, AlertTriangle,
  Download
} from 'lucide-react';

interface SettingsTabProps {
  settings: AppSettings;
  syncStatus: SyncStatus;
  user: any;
  oilLogs: OilLog[];
  fuelLogs: FuelLog[];
  onUpdateSettings: (newSettings: AppSettings) => void;
  onTriggerSync: () => Promise<void>;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export default function SettingsTab({
  settings,
  syncStatus,
  user,
  oilLogs,
  fuelLogs,
  onUpdateSettings,
  onTriggerSync,
  onOpenAuth,
  onLogout
}: SettingsTabProps) {
  // Local form state for Supabase
  const [supabaseUrl, setSupabaseUrl] = useState(settings.supabase.url);
  const [supabaseKey, setSupabaseKey] = useState(settings.supabase.anonKey);
  const [showKey, setShowKey] = useState(false);
  const [dbConnecting, setDbConnecting] = useState(false);
  const [dbMessage, setDbMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auth local state
  const [authEmail, setAuthEmail] = useState(settings.supabase.email || '');
  const [authPassword, setAuthPassword] = useState(settings.supabase.password || '');

  // Local form state for Telegram
  const [tgToken, setTgToken] = useState(settings.telegram.botToken);
  const [tgChatId, setTgChatId] = useState(settings.telegram.chatId);
  const [tgEnabled, setTgEnabled] = useState(settings.telegram.enabled);
  const [tgDays, setTgDays] = useState(settings.telegram.notifyOnDaysBefore);
  const [tgKm, setTgKm] = useState(settings.telegram.notifyOnKmBefore);
  const [showTgToken, setShowTgToken] = useState(false);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgMessage, setTgMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Local form state for Intervals
  const [intervalKm, setIntervalKm] = useState(settings.oilChangeIntervalKm);
  const [intervalDays, setIntervalDays] = useState(settings.oilChangeIntervalDays);
  const [fuelPrice, setFuelPrice] = useState(settings.fuelPricePerLiter || 10000);

  const [copiedSql, setCopiedSql] = useState(false);

  // Handle Save General Intervals
  const handleSaveIntervals = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      ...settings,
      oilChangeIntervalKm: Number(intervalKm),
      oilChangeIntervalDays: Number(intervalDays),
      fuelPricePerLiter: Number(fuelPrice)
    });
    alert('Pengaturan interval ganti oli dan harga BBM berhasil disimpan!');
  };

  // Handle Test & Connect Supabase
  const handleConnectSupabase = async () => {
    setDbMessage(null);
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setDbMessage({ type: 'error', text: 'URL dan Anon Key Supabase wajib diisi.' });
      return;
    }

    setDbConnecting(true);
    const result = await testSupabaseConnection(supabaseUrl.trim(), supabaseKey.trim());

    if (result.success) {
      setDbMessage({ type: 'success', text: result.message });

      // Update global settings
      onUpdateSettings({
        ...settings,
        supabase: {
          url: supabaseUrl.trim(),
          anonKey: supabaseKey.trim(),
          email: authEmail.trim(),
          password: authPassword.trim(),
          connected: true
        }
      });
      // Save to localStorage immediately so Supabase client loads it
      localStorage.setItem('supabase_url', supabaseUrl.trim());
      localStorage.setItem('supabase_anon_key', supabaseKey.trim());
      localStorage.setItem('supabase_email', authEmail.trim());
      localStorage.setItem('supabase_password', authPassword.trim());

      // Attempt login if email and password are provided
      if (authEmail.trim() && authPassword.trim()) {
        const client = getSupabaseClient();
        if (client) {
          try {
            const { error: signInError } = await client.auth.signInWithPassword({
              email: authEmail.trim(),
              password: authPassword.trim(),
            });
            if (signInError) {
              setDbMessage({ type: 'error', text: `Tersambung ke Supabase, tetapi gagal login: ${signInError.message}` });
            } else {
              setDbMessage({ type: 'success', text: 'Berhasil terhubung ke Supabase dan masuk akun!' });
            }
          } catch (err: any) {
            console.error(err);
            setDbMessage({ type: 'error', text: `Gagal login: ${err.message}` });
          }
        }
      }
    } else {
      setDbMessage({ type: 'error', text: result.message });
    }
    setDbConnecting(false);
  };

  // Handle Save Telegram Configurations
  const handleSaveTelegram = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      ...settings,
      telegram: {
        ...settings.telegram,
        botToken: tgToken.trim(),
        chatId: tgChatId.trim(),
        enabled: tgEnabled,
        notifyOnDaysBefore: Number(tgDays),
        notifyOnKmBefore: Number(tgKm)
      }
    });
    alert('Pengaturan notifikasi Telegram berhasil disimpan!');
  };

  // Handle Test Telegram Alert
  const handleTestTelegram = async () => {
    setTgMessage(null);
    if (!tgToken.trim() || !tgChatId.trim()) {
      setTgMessage({ type: 'error', text: 'Token Bot dan Chat ID diperlukan untuk melakukan uji coba.' });
      return;
    }

    setTgTesting(true);
    const text = '<b>🔔 UJI COBA NOTIFIKASI TELEGRAM 🔔</b>\n\nHalo! Koneksi Telegram Bot Anda berhasil terhubung dengan Aplikasi <b>Oil & Fuel Tracker Motor</b>.\n\nSistem siap mengirimkan pengingat jadwal ganti oli otomatis secara real-time!';
    const result = await sendTelegramNotification(tgToken.trim(), tgChatId.trim(), text);
    setTgTesting(false);

    if (result.success) {
      setTgMessage({ type: 'success', text: 'Notifikasi uji coba berhasil terkirim! Silakan periksa Telegram Anda.' });
    } else {
      setTgMessage({ type: 'error', text: result.message });
    }
  };

  // Copy SQL script to clipboard
  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Download all logs as backup JSON file
  const handleDownloadBackup = () => {
    try {
      const backupData = {
        app: 'Motor.ku Tracker',
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        data: {
          oilLogs,
          fuelLogs,
          settings
        }
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;

      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.download = `motorku_backup_${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();

      // Cleanup
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Gagal mengunduh cadangan:', error);
      alert('Gagal membuat file cadangan.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 1. Header & General Controls */}

      {/* 2. Oil Intervals Configurations (user limit setting) */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-3">
          <Calendar className="w-5 h-5 text-indigo-500" /> Interval Penjadwalan Ganti Oli
        </h3>

        <form onSubmit={handleSaveIntervals} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-semibold capitalize tracking-wider text-slate-400 mb-1.5">
              Interval Berdasarkan Jarak (Kilometer)
            </label>
            <div className="relative">
              <input
                id="set-interval-km"
                type="number"
                required
                value={intervalKm}
                onChange={(e) => setIntervalKm(Number(e.target.value))}
                placeholder="Contoh: 2000"
                className="w-full py-2.5 pl-3 pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs font-semibold"
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-xs font-bold text-slate-400 pointer-events-none">
                KM
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Rekomendasi umum ganti oli motor adalah setiap <b>2.000 km - 3.000 km</b>.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold capitalize tracking-wider text-slate-400 mb-1.5">
              Interval Berdasarkan Waktu (Hari)
            </label>
            <div className="relative">
              <input
                id="set-interval-days"
                type="number"
                required
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                placeholder="Contoh: 90"
                className="w-full py-2.5 pl-3 pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs font-semibold"
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-xs font-bold text-slate-400 pointer-events-none">
                Hari
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Disarankan ganti oli maksimal setiap <b>90 hari</b> (3 bulan) meski jarak belum tercapai.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold capitalize tracking-wider text-slate-400 mb-1.5">
              Harga BBM per Liter (Pertalite)
            </label>
            <div className="relative">
              <input
                id="set-fuel-price"
                type="number"
                required
                value={fuelPrice}
                onChange={(e) => setFuelPrice(Number(e.target.value))}
                placeholder="Contoh: 10000"
                className="w-full py-2.5 pl-3 pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs font-semibold"
              />
              <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-[10px] font-bold text-slate-400 pointer-events-none">
                Rp/L
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Digunakan untuk <b>konversi otomatis rupiah ke liter</b> saat catat BBM (Default Pertalite: Rp 10.000/L).</p>
          </div>

          <div className="md:col-span-3 flex justify-end">
            <button
              id="btn-save-intervals"
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Simpan Pengaturan
            </button>
          </div>
        </form>
      </div>

      {/* 2.5 Backup & Data Export Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-3">
          <Download className="w-5 h-5 text-indigo-500" /> Cadangan & Ekspor Data
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
          Amankan data Anda secara mandiri. Unduh seluruh riwayat ganti oli dan catatan konsumsi bahan bakar (BBM) Anda dalam format file JSON. File cadangan ini dapat Anda simpan secara lokal sebagai tindakan pencegahan kehilangan data jika terjadi kegagalan sistem atau penghapusan cache browser.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800/60">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">File Cadangan Motor.ku</h4>
            <p className="text-[10px] text-slate-400">
              Total catatan: <span className="font-bold text-slate-700 dark:text-slate-300">{oilLogs.length} Ganti Oli</span> dan <span className="font-bold text-slate-700 dark:text-slate-300">{fuelLogs.length} BBM</span>
            </p>
          </div>
          <button
            id="btn-download-backup"
            type="button"
            onClick={handleDownloadBackup}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-2 shadow-xs self-stretch sm:self-auto justify-center"
          >
            <Download className="w-4 h-4" /> Download Cadangan (JSON)
          </button>
        </div>
      </div>

      {/* 3. Supabase Cloud Sync Configuration */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs space-y-6">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center justify-between gap-2 border-b border-slate-50 dark:border-slate-800 pb-3">
          <span className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-500" /> Sinkronisasi Database Supabase (Real-Time)
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${settings.supabase.connected
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
            }`}>
            {settings.supabase.connected ? 'Terhubung ke Cloud' : 'Mode Offline / Lokal'}
          </span>
        </h3>

        {/* Cloud Sync details / Auth Block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/60">
          <div>
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Status Akun Cloud</h4>
            {user ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-slate-500">
                  Masuk sebagai: <b className="text-slate-700 dark:text-slate-200">{user.email}</b>
                </p>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-slate-400">Sinkronisasi otomatis aktif</span>
                </div>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-slate-500 leading-relaxed mb-3">
                  Anda sedang dalam mode lokal. Hubungkan ke Supabase dengan memasukkan URL, API Key, Email, dan Password di bawah.
                </p>
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Data Offline Pending</h4>
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">
                Data lokal belum tersinkron: <b className="text-indigo-600 dark:text-indigo-400">{syncStatus.pendingSyncCount} baris</b>
              </p>
              {syncStatus.lastSyncedAt && (
                <p className="text-[10px] text-slate-400">
                  Sinkronisasi terakhir: {new Date(syncStatus.lastSyncedAt).toLocaleTimeString('id-ID')}
                </p>
              )}
              <button
                id="btn-sync-now"
                onClick={onTriggerSync}
                disabled={syncStatus.isSyncing || !settings.supabase.connected || !user}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-xs flex items-center gap-1 disabled:opacity-50 cursor-pointer transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin text-indigo-500' : ''}`} />
                {syncStatus.isSyncing ? 'Menyinkronkan...' : 'Sinkronisasikan Sekarang'}
              </button>
              {!user && settings.supabase.connected && (
                <p className="text-[9px] text-amber-500">Silakan masuk akun terlebih dahulu untuk melakukan sinkronisasi.</p>
              )}
            </div>
          </div>
        </div>

        {/* Credentials Inputs */}
        <div className="space-y-4 pt-4 border-t border-slate-50 dark:border-slate-800">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Supabase Project URL
            </label>
            <input
              id="input-supabase-url"
              type="text"
              placeholder="https://your-project.supabase.co"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0F1C] text-slate-900 dark:text-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-xs font-mono placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Supabase Anon / Public API Key
            </label>
            <div className="relative">
              <input
                id="input-supabase-key"
                type={showKey ? 'text' : 'password'}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                className="w-full py-3 pl-4 pr-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0F1C] text-slate-900 dark:text-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-xs font-mono placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
              />
              <button
                id="toggle-supabase-key-visibility"
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Email Auth
            </label>
            <input
              id="input-supabase-email"
              type="email"
              placeholder="haris443@gmail.com"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0F1C] text-slate-900 dark:text-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-xs font-mono placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Password Auth
            </label>
            <input
              id="input-supabase-password"
              type="password"
              placeholder="••••••••"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0F1C] text-slate-900 dark:text-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-xs font-mono placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-all"
            />
          </div>

          {dbMessage && (
            <div className={`p-3 rounded-xl text-xs flex gap-2 border ${dbMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-150 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-150 dark:border-rose-900/40 text-rose-800 dark:text-rose-300'
              }`}>
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{dbMessage.text}</span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              id="btn-test-supabase"
              type="button"
              onClick={handleConnectSupabase}
              disabled={dbConnecting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              {dbConnecting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menghubungkan...
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" /> Simpan & Hubungkan Database
                </>
              )}
            </button>
          </div>
        </div>


        {/* 4. Telegram Alert Configurations */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-3">
            <Send className="w-5 h-5 text-indigo-500" /> Notifikasi (Telegram Bot API)
          </h3>

          <form onSubmit={handleSaveTelegram} className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Aktifkan Pengingat Telegram
                </label>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="toggle-telegram"
                  type="checkbox"
                  checked={tgEnabled}
                  onChange={(e) => setTgEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold capitalize tracking-wider text-slate-400 mb-1">
                  Telegram Bot Token
                </label>
                <div className="relative">
                  <input
                    id="input-telegram-token"
                    type={showTgToken ? 'text' : 'password'}
                    required={tgEnabled}
                    placeholder="1234567890:ABCdefGhIJKlmNoPQRsT..."
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    disabled={!tgEnabled}
                    className="w-full py-2.5 pl-3 pr-10 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs disabled:opacity-50"
                  />
                  <button
                    id="toggle-telegram-token-visibility"
                    type="button"
                    onClick={() => setShowTgToken(!showTgToken)}
                    disabled={!tgEnabled}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                  >
                    {showTgToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold capitalize tracking-wider text-slate-400 mb-1">
                  Telegram Chat ID Pengguna
                </label>
                <input
                  id="input-telegram-chatid"
                  type="text"
                  required={tgEnabled}
                  placeholder="Contoh: 987654321"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  disabled={!tgEnabled}
                  className="w-full py-2.5 px-3 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs disabled:opacity-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold capitalize tracking-wider text-slate-400 mb-1">
                  Kirim Peringatan Hari Sebelum Ganti Oli
                </label>
                <div className="relative">
                  <input
                    id="input-telegram-days-before"
                    type="number"
                    required={tgEnabled}
                    value={tgDays}
                    onChange={(e) => setTgDays(Number(e.target.value))}
                    disabled={!tgEnabled}
                    className="w-full py-2.5 pl-3 pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs disabled:opacity-50 font-bold"
                  />
                  <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-[10px] font-bold text-slate-400 pointer-events-none capitalize">
                    Hari
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold capitalize tracking-wider text-slate-400 mb-1">
                  Kirim Peringatan Jarak Sebelum Ganti Oli (km)
                </label>
                <div className="relative">
                  <input
                    id="input-telegram-km-before"
                    type="number"
                    required={tgEnabled}
                    value={tgKm}
                    onChange={(e) => setTgKm(Number(e.target.value))}
                    disabled={!tgEnabled}
                    className="w-full py-2.5 pl-3 pr-12 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs disabled:opacity-50 font-bold"
                  />
                  <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-[10px] font-bold text-slate-400 pointer-events-none capitalize">
                    KM
                  </span>
                </div>
              </div>
            </div>

            {tgMessage && (
              <div className={`p-3 rounded-xl text-xs flex gap-2 border ${tgMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-150 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-150 dark:border-rose-900/40 text-rose-800 dark:text-rose-300'
                }`}>
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{tgMessage.text}</span>
              </div>
            )}

            <div className="flex flex-col md:flex-row justify-between gap-3 pt-3 border-t border-slate-50 dark:border-slate-850">
              {/* Instruction tooltip */}
              <div className="text-[10px] text-slate-400 max-w-md flex items-center gap-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-850">
                <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Cari <b>@BotFather</b> di Telegram untuk membuat bot Anda. Dapatkan Token, lalu kirim pesan apa saja ke <b>@userinfobot</b> untuk mengetahui Chat ID Anda.</span>
              </div>

              <div className="flex gap-2 self-end">
                <button
                  id="btn-test-telegram"
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={tgTesting || !tgEnabled}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {tgTesting ? 'Mengirim Uji Coba...' : 'Tes Notifikasi'}
                </button>
                <button
                  id="btn-save-telegram"
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Simpan
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      );
}
