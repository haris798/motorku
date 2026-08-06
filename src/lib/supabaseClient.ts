import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OilLog, FuelLog, Jarak } from '../types';

let supabaseInstance: SupabaseClient | null = null;
let currentUrl = '';
let currentKey = '';

export function getSupabaseClient(url?: string, anonKey?: string): SupabaseClient | null {
  // Try to load from provided args or localStorage
  const defaultUrl = 'https://pcoyvfhcniscynjkndlw.supabase.co';
  const defaultKey = 'sb_publishable_4HYaHZhOIECG56Eccpe4sA_xj-Ecy9n';

  const finalUrl = url || localStorage.getItem('supabase_url') || defaultUrl;
  const finalKey = anonKey || localStorage.getItem('supabase_anon_key') || defaultKey;

  if (!finalUrl || !finalKey) {
    supabaseInstance = null;
    return null;
  }

  // Reuse instance if credentials haven't changed
  if (supabaseInstance && currentUrl === finalUrl && currentKey === finalKey) {
    return supabaseInstance;
  }

  try {
    currentUrl = finalUrl;
    currentKey = finalKey;
    supabaseInstance = createClient(finalUrl, finalKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    });
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return null;
  }
}

// Check if credentials are valid by trying a basic auth or ping check
export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = createClient(url, anonKey);
    // Try to read a dummy request or just get auth state
    const { error } = await client.from('oil_logs').select('id').limit(1);
    
    // If the error is table not found, the connection itself is SUCCESSFUL (the client authenticated)
    // but the tables need to be created.
    if (error && error.code === 'PGRST116') {
      return { success: true, message: 'Koneksi berhasil! Namun tabel belum dibuat. Silakan jalankan script SQL di bawah.' };
    }
    if (error && error.code === '42P01') {
      return { success: true, message: 'Koneksi berhasil! Silakan buat tabel di Supabase menggunakan tab SQL di bawah.' };
    }
    if (error) {
      // If it's a CORS or network error or invalid API key
      return { success: false, message: `Koneksi gagal: ${error.message}` };
    }
    return { success: true, message: 'Koneksi berhasil dan tabel ditemukan!' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Koneksi gagal. Periksa URL dan API Key Anda.' };
  }
}



// ============================================================
// Jarak Tempuh Harian — fetch records grouped for Dashboard
// ============================================================

/**
 * Fetch all jarak records for the logged-in user (to sum by month in the UI).
 */
export async function fetchJarakRecords(): Promise<{
  records: Jarak[];
  error: string | null;
}> {
  const client = getSupabaseClient();
  if (!client) return { records: [], error: 'Supabase belum dikonfigurasi.' };

  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return { records: [], error: 'Silakan login terlebih dahulu.' };

    const { data, error } = await client
      .from('jarak')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (error) return { records: [], error: `Gagal mengambil jarak tempuh: ${error.message}` };
    return { records: (data || []) as Jarak[], error: null };
  } catch (err: any) {
    return { records: [], error: err.message || 'Terjadi kesalahan.' };
  }
}

// SQL Script template to create ALL Supabase tables
export const SUPABASE_SQL_SCRIPT = `-- SCRIPT PEMBUATAN TABEL UNTUK APLIKASI MOTOR.KU TRACKER
-- Jalankan kode berikut di SQL Editor Supabase Anda:

-- ============================================================
-- 1. TABEL UTAMA: Riwayat Ganti Oli
-- ============================================================
CREATE TABLE IF NOT EXISTS oil_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  mileage INTEGER NOT NULL,
  cost NUMERIC NOT NULL,
  oil_brand TEXT NOT NULL,
  oil_type TEXT NOT NULL,
  notes TEXT,
  rating INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 2. TABEL UTAMA: Riwayat Pembelian BBM
-- ============================================================
CREATE TABLE IF NOT EXISTS fuel_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  mileage INTEGER NOT NULL,
  liters NUMERIC NOT NULL,
  cost NUMERIC NOT NULL,
  fuel_type TEXT NOT NULL,
  efficiency NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 3. TABEL UTAMA: Pengaturan Pengguna
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 4. TABEL: Jarak Tempuh Harian
-- ============================================================
CREATE TABLE IF NOT EXISTS jarak (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'colota',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, date, source)
);

CREATE INDEX IF NOT EXISTS idx_jarak_user_date
  ON jarak (user_id, date);

-- ============================================================
-- AKTIFKAN ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE oil_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE jarak ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BUAT POLICY UNTUK RLS
-- ============================================================
CREATE POLICY "Pengguna hanya bisa melihat data olinya sendiri"
  ON oil_logs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa melihat data bbmnya sendiri"
  ON fuel_logs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa melihat pengaturannya sendiri"
  ON user_settings FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Pengguna hanya bisa melihat data jarak tempuhnya sendiri"
  ON jarak FOR ALL USING (auth.uid() = user_id);

`;
