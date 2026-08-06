import { createClient } from '@supabase/supabase-js';
import { OilLog, FuelLog } from '../types';

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  
  if (type === 'start_sync') {
    const { localOilLogs, localFuelLogs, deletedIds, userId, settings, supabaseUrl, supabaseKey } = payload;
    
    try {
      const client = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      });
      
      // 1. Process deletions
      if (deletedIds && deletedIds.length > 0) {
        self.postMessage({ type: 'progress', payload: 'Menghapus data yang didelete saat offline...' });
        await client.from('oil_logs').delete().in('id', deletedIds).eq('user_id', userId);
        await client.from('fuel_logs').delete().in('id', deletedIds).eq('user_id', userId);
      }
      
      // 2. Sync Oil Logs
      self.postMessage({ type: 'progress', payload: 'Sinkronisasi riwayat ganti oli...' });
      const { data: remoteOilLogs, error: oilError } = await client
        .from('oil_logs')
        .select('*')
        .eq('user_id', userId);
        
      if (oilError) throw new Error(`Gagal fetch oli: ${oilError.message}`);
      
      const safeRemoteOilLogs = Array.isArray(remoteOilLogs) ? remoteOilLogs : [];
      const mergedOilLogs: OilLog[] = [...localOilLogs];
      const remoteOilMap = new Map<string, any>(safeRemoteOilLogs.map(item => [item.id, item]));

      for (const local of localOilLogs) {
        const remote = remoteOilMap.get(local.id);
        if (!remote) {
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
          if (!insErr) {
            const index = mergedOilLogs.findIndex(item => item.id === local.id);
            if (index !== -1) mergedOilLogs[index].user_id = userId;
          }
        } else {
          const localTime = new Date(local.updated_at || 0).getTime();
          const remoteTime = new Date(remote.updated_at || 0).getTime();
          
          if (localTime > remoteTime) {
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
            const index = mergedOilLogs.findIndex(item => item.id === local.id);
            if (index !== -1) {
              mergedOilLogs[index] = { ...remote };
            }
          }
        }
      }
      
      for (const remote of safeRemoteOilLogs) {
        if (!localOilLogs.some((l: OilLog) => l.id === remote.id)) {
          mergedOilLogs.push({ ...remote });
        }
      }
      
      // 3. Sync Fuel Logs
      self.postMessage({ type: 'progress', payload: 'Sinkronisasi riwayat pembelian BBM...' });
      const { data: remoteFuelLogs, error: fuelError } = await client
        .from('fuel_logs')
        .select('*')
        .eq('user_id', userId);
        
      if (fuelError) throw new Error(`Gagal fetch BBM: ${fuelError.message}`);
      
      const safeRemoteFuelLogs = Array.isArray(remoteFuelLogs) ? remoteFuelLogs : [];
      const mergedFuelLogs: FuelLog[] = [...localFuelLogs];
      const remoteFuelMap = new Map<string, any>(safeRemoteFuelLogs.map(item => [item.id, item]));

      for (const local of localFuelLogs) {
        const remote = remoteFuelMap.get(local.id);
        if (!remote) {
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
          if (!insErr) {
            const index = mergedFuelLogs.findIndex(item => item.id === local.id);
            if (index !== -1) mergedFuelLogs[index].user_id = userId;
          }
        } else {
          const localTime = new Date(local.updated_at || 0).getTime();
          const remoteTime = new Date(remote.updated_at || 0).getTime();
          
          if (localTime > remoteTime) {
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
            const index = mergedFuelLogs.findIndex(item => item.id === local.id);
            if (index !== -1) {
              mergedFuelLogs[index] = { ...remote };
            }
          }
        }
      }
      
      for (const remote of safeRemoteFuelLogs) {
        if (!localFuelLogs.some((l: FuelLog) => l.id === remote.id)) {
          mergedFuelLogs.push({ ...remote });
        }
      }
      
      mergedOilLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      mergedFuelLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      self.postMessage({ type: 'progress', payload: 'Sinkronisasi pengaturan...' });
      await client.from('user_settings').upsert({
        user_id: userId,
        settings: settings,
        updated_at: new Date().toISOString()
      });
      
      self.postMessage({
        type: 'success',
        payload: {
          syncedOilLogs: mergedOilLogs,
          syncedFuelLogs: mergedFuelLogs
        }
      });
      
    } catch (error: any) {
      self.postMessage({
        type: 'error',
        payload: error.message || String(error)
      });
    }
  }
};
