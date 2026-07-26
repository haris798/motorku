export interface OilLog {
  id: string;
  user_id?: string;
  date: string;
  mileage: number; // in km
  cost: number; // in IDR
  oil_brand: string;
  oil_type: string; // e.g., Synthetic, Mineral
  notes?: string;
  rating?: number; // 1 to 5 rating of performance
  created_at?: string;
  updated_at?: string;
}

export interface FuelLog {
  id: string;
  user_id?: string;
  date: string;
  mileage: number; // Odometer reading in km
  liters: number;
  cost: number; // in IDR
  fuel_type: string; // e.g., Pertalite, Pertamax, Pertamax Turbo
  efficiency?: number; // calculated km/L
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  notifyOnDaysBefore: number; // notify when oil life is low (e.g., 7 days remaining)
  notifyOnKmBefore: number; // notify when oil life is low (e.g., 200 km remaining)
  lastNotifiedDate?: string; // prevent spamming
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  email?: string;
  password?: string;
  connected: boolean;
}

export interface AppSettings {
  oilChangeIntervalKm: number; // e.g., 2000 km
  oilChangeIntervalDays: number; // e.g., 90 days
  fuelPricePerLiter: number; // Price of fuel per liter in IDR
  telegram: TelegramConfig;
  supabase: SupabaseConfig;
  theme: 'light' | 'dark';
}

export interface SyncStatus {
  lastSyncedAt: string | null;
  pendingSyncCount: number;
  isSyncing: boolean;
}

/**
 * A location data point recorded by a GPS tracking device
 */
export interface ColotaLocation {
  id: string;
  userid?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  accuracy?: number;
  recorded_at: string; // timestamp when the location was recorded
  created_at?: string;
}

/**
 * Calculated daily distance traveled from location data
 */
export interface JarakTempuh {
  id: string;
  user_id?: string;
  date: string; // tanggal perjalanan (YYYY-MM-DD)
  total_distance_km: number; // total jarak tempuh dalam kilometer
  source: 'colota' | 'manual';
  created_at?: string;
  updated_at?: string;
}

/**
 * Parameters for calculating distance from colota_locations
 */
export interface DistanceCalculationParams {
  date: string; // tanggal yang akan dihitung (YYYY-MM-DD)
  userId?: string;
}
