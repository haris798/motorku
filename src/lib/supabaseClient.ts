import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OilLog, FuelLog, ColotaLocation, Jarak } from '../types';
import { calculateTotalDistance } from '../utils/distance';

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

/**
 * Robust Sync Engine
 * Syncs oil logs and fuel logs.
 * Handles:
 * - Insert offline-created logs to remote
 * - Fetch remote-created logs to local
 * - Update existing logs based on `updated_at` timestamp
 * - Process deletions (stored in local 'deleted_ids' list)
 */
export async function syncWithSupabase(
  localOilLogs: OilLog[],
  localFuelLogs: FuelLog[],
  onSyncProgress: (status: string) => void
): Promise<{
  syncedOilLogs: OilLog[];
  syncedFuelLogs: FuelLog[];
  success: boolean;
  message: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { syncedOilLogs: localOilLogs, syncedFuelLogs: localFuelLogs, success: false, message: 'Supabase belum dikonfigurasi.' };
  }

  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) {
      return { syncedOilLogs: localOilLogs, syncedFuelLogs: localFuelLogs, success: false, message: 'Silakan login terlebih dahulu untuk sinkronisasi.' };
    }

    const userId = user.id;
    onSyncProgress('Sinkronisasi dimulai...');

    // 1. Process deletions
    let deletedIds: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('deleted_log_ids') || '[]');
      if (Array.isArray(parsed)) deletedIds = parsed;
    } catch (e) {
      // ignore
    }
    if (deletedIds.length > 0) {
      onSyncProgress('Menghapus data yang didelete saat offline...');
      // Delete oil logs
      await client.from('oil_logs').delete().in('id', deletedIds).eq('user_id', userId);
      // Delete fuel logs
      await client.from('fuel_logs').delete().in('id', deletedIds).eq('user_id', userId);
      // Clear local deletion log
      localStorage.setItem('deleted_log_ids', '[]');
    }

    // 2. Sync Oil Logs
    onSyncProgress('Sinkronisasi riwayat ganti oli...');
    // Fetch remote oil logs
    const { data: remoteOilLogs, error: oilError } = await client
      .from('oil_logs')
      .select('*')
      .eq('user_id', userId);

    if (oilError) throw new Error(`Gagal fetch oli: ${oilError.message}`);

    const safeRemoteOilLogs = Array.isArray(remoteOilLogs) ? remoteOilLogs : [];
    const safeLocalOilLogs = Array.isArray(localOilLogs) ? localOilLogs : [];

    const mergedOilLogs: OilLog[] = [...safeLocalOilLogs];
    const remoteOilMap = new Map<string, any>(safeRemoteOilLogs.map(item => [item.id, item]));

    // Check local vs remote
    for (const local of safeLocalOilLogs) {
      const remote = remoteOilMap.get(local.id);
      if (!remote) {
        // Exists locally but not remotely -> Upload to remote
        const { error: insErr } = await client.from('oil_logs').insert({
          id: local.id,
          user_id: userId,
          date: local.date,
          mileage: local.mileage,
          cost: local.cost,
          oil_brand: local.oil_brand,
          oil_type: local.oil_type,
          notes: local.notes || '',
          rating: local.rating || 5,
          updated_at: local.updated_at || new Date().toISOString()
        });
        if (insErr) {
          console.error('Gagal upload oli log:', insErr);
        } else {
          // Sync user_id back to local merged list so it's persisted properly
          const index = mergedOilLogs.findIndex(item => item.id === local.id);
          if (index !== -1) {
            mergedOilLogs[index].user_id = userId;
          }
        }
      } else {
        // Exists in both -> Compare timestamps
        const localTime = new Date(local.updated_at || 0).getTime();
        const remoteTime = new Date(remote.updated_at || 0).getTime();

        if (localTime > remoteTime) {
          // Local is newer -> Update remote
          await client.from('oil_logs').update({
            date: local.date,
            mileage: local.mileage,
            cost: local.cost,
            oil_brand: local.oil_brand,
            oil_type: local.oil_type,
            notes: local.notes || '',
            rating: local.rating || 5,
            updated_at: local.updated_at || new Date().toISOString()
          }).eq('id', local.id).eq('user_id', userId);
        } else if (remoteTime > localTime) {
          // Remote is newer -> Update local list
          const index = mergedOilLogs.findIndex(item => item.id === local.id);
          if (index !== -1) {
            mergedOilLogs[index] = {
              id: remote.id,
              user_id: remote.user_id,
              date: remote.date,
              mileage: remote.mileage,
              cost: remote.cost,
              oil_brand: remote.oil_brand,
              oil_type: remote.oil_type,
              notes: remote.notes,
              rating: remote.rating,
              created_at: remote.created_at,
              updated_at: remote.updated_at
            };
          }
        }
      }
    }

    // Add remote logs that are not present locally
    for (const remote of safeRemoteOilLogs) {
      const localExists = safeLocalOilLogs.some(l => l.id === remote.id);
      if (!localExists) {
        mergedOilLogs.push({
          id: remote.id,
          user_id: remote.user_id,
          date: remote.date,
          mileage: remote.mileage,
          cost: remote.cost,
          oil_brand: remote.oil_brand,
          oil_type: remote.oil_type,
          notes: remote.notes,
          rating: remote.rating,
          created_at: remote.created_at,
          updated_at: remote.updated_at
        });
      }
    }

    // 3. Sync Fuel Logs
    onSyncProgress('Sinkronisasi riwayat pembelian BBM...');
    // Fetch remote fuel logs
    const { data: remoteFuelLogs, error: fuelError } = await client
      .from('fuel_logs')
      .select('*')
      .eq('user_id', userId);

    if (fuelError) throw new Error(`Gagal fetch BBM: ${fuelError.message}`);

    const safeRemoteFuelLogs = Array.isArray(remoteFuelLogs) ? remoteFuelLogs : [];
    const safeLocalFuelLogs = Array.isArray(localFuelLogs) ? localFuelLogs : [];

    const mergedFuelLogs: FuelLog[] = [...safeLocalFuelLogs];
    const remoteFuelMap = new Map<string, any>(safeRemoteFuelLogs.map(item => [item.id, item]));

    for (const local of safeLocalFuelLogs) {
      const remote = remoteFuelMap.get(local.id);
      if (!remote) {
        // Exists locally but not remotely -> Upload
        const { error: insErr } = await client.from('fuel_logs').insert({
          id: local.id,
          user_id: userId,
          date: local.date,
          mileage: local.mileage,
          liters: local.liters,
          cost: local.cost,
          fuel_type: local.fuel_type,
          efficiency: local.efficiency || null,
          notes: local.notes || '',
          updated_at: local.updated_at || new Date().toISOString()
        });
        if (insErr) {
          console.error('Gagal upload bbm log:', insErr);
        } else {
          // Sync user_id back to local merged list so it's persisted properly
          const index = mergedFuelLogs.findIndex(item => item.id === local.id);
          if (index !== -1) {
            mergedFuelLogs[index].user_id = userId;
          }
        }
      } else {
        // Compare timestamps
        const localTime = new Date(local.updated_at || 0).getTime();
        const remoteTime = new Date(remote.updated_at || 0).getTime();

        if (localTime > remoteTime) {
          // Local is newer -> Update remote
          await client.from('fuel_logs').update({
            date: local.date,
            mileage: local.mileage,
            liters: local.liters,
            cost: local.cost,
            fuel_type: local.fuel_type,
            efficiency: local.efficiency || null,
            notes: local.notes || '',
            updated_at: local.updated_at || new Date().toISOString()
          }).eq('id', local.id).eq('user_id', userId);
        } else if (remoteTime > localTime) {
          // Remote is newer -> Update local
          const index = mergedFuelLogs.findIndex(item => item.id === local.id);
          if (index !== -1) {
            mergedFuelLogs[index] = {
              id: remote.id,
              user_id: remote.user_id,
              date: remote.date,
              mileage: remote.mileage,
              liters: remote.liters,
              cost: remote.cost,
              fuel_type: remote.fuel_type,
              efficiency: remote.efficiency,
              notes: remote.notes,
              created_at: remote.created_at,
              updated_at: remote.updated_at
            };
          }
        }
      }
    }

    // Add remote fuel logs not present locally
    for (const remote of safeRemoteFuelLogs) {
      const localExists = safeLocalFuelLogs.some(l => l.id === remote.id);
      if (!localExists) {
        mergedFuelLogs.push({
          id: remote.id,
          user_id: remote.user_id,
          date: remote.date,
          mileage: remote.mileage,
          liters: remote.liters,
          cost: remote.cost,
          fuel_type: remote.fuel_type,
          efficiency: remote.efficiency,
          notes: remote.notes,
          created_at: remote.created_at,
          updated_at: remote.updated_at
        });
      }
    }

    // Sort logs descending by date
    mergedOilLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    mergedFuelLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Update settings in cloud if needed
    onSyncProgress('Sinkronisasi pengaturan...');
    const localSettings = localStorage.getItem('oil_tracker_settings');
    if (localSettings) {
      const parsedSettings = JSON.parse(localSettings);
      await client.from('user_settings').upsert({
        user_id: userId,
        settings: parsedSettings,
        updated_at: new Date().toISOString()
      });
    }

    return {
      syncedOilLogs: mergedOilLogs,
      syncedFuelLogs: mergedFuelLogs,
      success: true,
      message: 'Sinkronisasi berhasil!'
    };
  } catch (error: any) {
    console.error('Sync failed:', error);
    return {
      syncedOilLogs: localOilLogs,
      syncedFuelLogs: localFuelLogs,
      success: false,
      message: `Sinkronisasi gagal: ${error.message || error}`
    };
  }
}

// ============================================================
// NEW: Functions for colota_locations and jarak
// ============================================================

/**
 * Fetch all GPS location data for a specific date from colota_locations.
 * Filters by tst (Unix epoch in seconds) to get locations within the given date.
 */
export async function fetchLocationsByDate(
  date: string
): Promise<{ locations: ColotaLocation[]; error: string | null }> {
  const client = getSupabaseClient();
  if (!client) {
    return { locations: [], error: 'Supabase belum dikonfigurasi.' };
  }

  try {
    // Convert date to Unix epoch range (seconds)
    const startOfDay = new Date(`${date}T00:00:00Z`).getTime() / 1000;
    const endOfDay = new Date(`${date}T23:59:59Z`).getTime() / 1000;

    // Query locations by tst (Unix epoch timestamp) - no user filter since table has no user column
    const { data, error } = await client
      .from('colota_locations')
      .select('*')
      .gte('tst', startOfDay)
      .lt('tst', endOfDay)
      .order('tst', { ascending: true });

    if (error) {
      return { locations: [], error: `Gagal mengambil data lokasi: ${error.message}` };
    }

    return { locations: (data || []) as ColotaLocation[], error: null };
  } catch (err: any) {
    return { locations: [], error: err.message || 'Terjadi kesalahan saat mengambil data lokasi.' };
  }
}

/**
 * Calculate daily distance from colota_locations and save to jarak.
 * Uses the Haversine formula via calculateTotalDistance().
 * Maps colota field names (lat, lon, tst, vel) to the expected format.
 */
export async function calculateAndSaveDailyDistance(
  date: string
): Promise<{ success: boolean; distanceKm: number; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, distanceKm: 0, message: 'Supabase belum dikonfigurasi.' };
  }

  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) {
      return { success: false, distanceKm: 0, message: 'Silakan login terlebih dahulu.' };
    }

    // 1. Fetch all locations for this date
    const { locations, error } = await fetchLocationsByDate(date);
    if (error) {
      return { success: false, distanceKm: 0, message: error };
    }

    if (locations.length < 2) {
      return {
        success: false,
        distanceKm: 0,
        message: `Data lokasi untuk tanggal ${date} tidak mencukupi (minimal 2 titik koordinat).`
      };
    }

    // 2. Map ColotaLocation fields to the format expected by calculateTotalDistance
    const mappedLocations = locations.map(loc => ({
      latitude: loc.lat,
      longitude: loc.lon,
      recorded_at: new Date(loc.tst * 1000).toISOString(), // convert epoch seconds to ISO
      speed: loc.vel,
    }));

    // 3. Calculate total distance using Haversine formula
    const totalDistanceKm = calculateTotalDistance(mappedLocations);

    // 4. Save or update the result in jarak
    const { error: upsertError } = await client.from('jarak').upsert({
      user_id: user.id,
      date,
      total_km: totalDistanceKm,
      source: 'colota',
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id, date, source',
      ignoreDuplicates: false
    });

    if (upsertError) {
      return {
        success: false,
        distanceKm: totalDistanceKm,
        message: `Gagal menyimpan jarak tempuh: ${upsertError.message}`
      };
    }

    return {
      success: true,
      distanceKm: totalDistanceKm,
      message: `Berhasil! Jarak tempuh tanggal ${date}: ${totalDistanceKm.toFixed(2)} km`
    };
  } catch (err: any) {
    return { success: false, distanceKm: 0, message: err.message || 'Terjadi kesalahan.' };
  }
}

/**
 * Fetch all jarak records for the logged-in user.
 */
export async function fetchJarakRecords(): Promise<{
  records: Jarak[];
  error: string | null;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { records: [], error: 'Supabase belum dikonfigurasi.' };
  }

  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) {
      return { records: [], error: 'Silakan login terlebih dahulu.' };
    }

    const { data, error } = await client
      .from('jarak')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (error) {
      return { records: [], error: `Gagal mengambil jarak tempuh: ${error.message}` };
    }

    return { records: (data || []) as Jarak[], error: null };
  } catch (err: any) {
    return { records: [], error: err.message || 'Terjadi kesalahan.' };
  }
}

/**
 * Call get_jarak RPC and fetch total distance from jarak table
 */
export async function fetchJarakTotal(): Promise<{ total_km: number; error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { total_km: 0, error: 'Supabase belum dikonfigurasi.' };
  
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return { total_km: 0, error: 'Silakan login terlebih dahulu.' };

    // Trigger the RPC
    await client.rpc('get_jarak');

    // Fetch from jarak table
    const { data, error } = await client
      .from('jarak')
      .select('total_km')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { total_km: 0, error: `Gagal fetch jarak: ${error.message}` };
    }

    return { total_km: data?.total_km || 0, error: null };
  } catch (err: any) {
    return { total_km: 0, error: err.message || 'Terjadi kesalahan saat mengambil jarak.' };
  }
}

/**
 * Reset total distance in jarak table
 */
export async function resetJarakTotal(): Promise<{ success: boolean; error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase belum dikonfigurasi.' };
  
  try {
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return { success: false, error: 'Silakan login terlebih dahulu.' };

    const { error } = await client
      .from('jarak')
      .update({ total_km: 0 })
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: `Gagal reset jarak: ${error.message}` };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message || 'Terjadi kesalahan saat reset jarak.' };
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
-- 4. TABEL: Data Lokasi GPS (colota_locations)
-- Format standar dari perangkat pelacak GPS (Colota / Traccar)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.colota_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tid TEXT NULL DEFAULT 'default-device'::text,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  acc DOUBLE PRECISION NULL DEFAULT 0,
  alt DOUBLE PRECISION NULL DEFAULT 0,
  vel DOUBLE PRECISION NULL DEFAULT 0,
  bear DOUBLE PRECISION NULL DEFAULT 0,
  batt INTEGER NULL DEFAULT 0,
  bs INTEGER NULL DEFAULT 0,
  tst BIGINT NOT NULL,
  raw_payload JSONB NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT colota_locations_pkey PRIMARY KEY (id)
);

-- Index untuk mempercepat query berdasarkan timestamp
CREATE INDEX IF NOT EXISTS idx_colota_locations_tst
  ON public.colota_locations (tst DESC);

CREATE INDEX IF NOT EXISTS idx_colota_locations_received_at
  ON public.colota_locations (received_at);

-- ============================================================
-- 5. TABEL BARU: Jarak Tempuh Harian (jarak)
-- Menyimpan hasil kalkulasi jarak tempuh harian dari data GPS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.jarak (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  date date not null,
  total_km double precision not null default 0,
  source text not null default 'colota'::text,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint jarak_pkey primary key (id),
  constraint jarak_user_id_date_source_key unique (user_id, date, source),
  constraint jarak_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint jarak_source_check check (
    (
      source = any (array['colota'::text, 'manual'::text])
    )
  )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_jarak_user_date
  ON jarak (user_id, date);

-- ============================================================
-- AKTIFKAN ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE oil_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
-- colota_locations tidak pakai RLS karena tidak ada kolom user
-- ALTER TABLE colota_locations ENABLE ROW LEVEL SECURITY;
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

-- NOTE: colota_locations is an anonymous tracking table (no user_id column).
-- RLS is disabled for this table since there's no user reference.
-- If you need per-user isolation, add a user_id column to the table.

CREATE POLICY "Pengguna hanya bisa melihat data jarak tempuhnya sendiri"
  ON jarak FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- OPSIONAL: Jadwalkan auto-hitung jarak tempuh setiap jam 18:00
-- Jalankan hanya jika ekstensi pg_cron sudah diaktifkan:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
-- ============================================================
-- CREATE OR REPLACE FUNCTION auto_calculate_daily_distance(target_date DATE DEFAULT CURRENT_DATE)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
-- DECLARE
--   start_epoch BIGINT;
--   end_epoch BIGINT;
--   user_row RECORD;
--   loc_count INTEGER;
-- BEGIN
--   start_epoch := EXTRACT(EPOCH FROM target_date::timestamp)::BIGINT;
--   end_epoch := EXTRACT(EPOCH FROM (target_date + INTERVAL '1 day')::timestamp)::BIGINT;
--
--   FOR user_row IN SELECT DISTINCT id FROM auth.users LOOP
--     INSERT INTO jarak (user_id, date, total_km, source, updated_at)
--     VALUES (user_row.id, target_date, 0, 'colota', now())
--     ON CONFLICT (user_id, date, source) DO NOTHING;
--   END LOOP;
-- END;
-- $$;
--
-- Jalankan setiap hari jam 18:00
-- SELECT cron.schedule('jarak-tempuh-harian', '0 18 * * *', 'SELECT auto_calculate_daily_distance();');
`;
