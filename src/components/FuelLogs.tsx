import { useState, type FormEvent } from 'react';
import { FuelLog, AppSettings } from '../types';
import { formatIDR } from '../utils/export';
import { 
  Plus, Trash2, Edit3, Calendar, Search, Fuel, X, ArrowUpDown, AlertCircle, Sparkles
} from 'lucide-react';

interface FuelLogsProps {
  logs: FuelLog[];
  onAddLog: (log: Omit<FuelLog, 'id'>) => void;
  onEditLog: (id: string, updatedLog: Partial<FuelLog>) => void;
  onDeleteLog: (id: string) => void;
  settings: AppSettings;
}

export default function FuelLogs({ logs, onAddLog, onEditLog, onDeleteLog, settings }: FuelLogsProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState<number | ''>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [fuelTypeFilter, setFuelTypeFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const resetForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setCost('');
    setFormError(null);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (log: FuelLog) => {
    setEditingId(log.id);
    setDate(log.date);
    setCost(log.cost);
    setFormError(null);
    setIsFormOpen(true);
  };

  /**
   * Calculate fuel efficiency on submission
   * Formula: (Current Mileage - Previous Mileage) / Current Liters
   */
  const calculateEfficiencyValue = (currentMile: number, currentLiters: number): number | undefined => {
    // 1. Sort all logs in ascending mileage to find the previous one correctly
    // If editing, exclude current editing item from the previous calculation check
    const sortedOtherLogs = logs
      .filter(l => l.id !== editingId)
      .sort((a, b) => a.mileage - b.mileage);

    // 2. Find log with largest mileage less than currentMile
    let prevLog: FuelLog | null = null;
    for (let i = sortedOtherLogs.length - 1; i >= 0; i--) {
      if (sortedOtherLogs[i].mileage < currentMile) {
        prevLog = sortedOtherLogs[i];
        break;
      }
    }

    if (prevLog) {
      const distance = currentMile - prevLog.mileage;
      if (distance > 0 && currentLiters > 0) {
        return distance / currentLiters;
      }
    }
    return undefined;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cNum = Number(cost);

    if (!cost || cNum <= 0) {
      setFormError('Biaya pembelian bbm (Rp) harus lebih besar dari 0.');
      return;
    }

    // Auto-calculate liters based on settings parameter
    const pricePerLiter = (settings?.fuelPricePerLiter || 10) * 1000;
    const lNum = Number((cNum / pricePerLiter).toFixed(2));

    // Fallback mileage to the latest known odometer or 0
    let mNum = 0;
    if (editingId) {
      const existing = logs.find(l => l.id === editingId);
      mNum = existing ? existing.mileage : 0;
    } else {
      mNum = logs.length > 0 ? Math.max(...logs.map(l => l.mileage)) : 0;
    }

    // Auto-calculate efficiency
    const efficiency = calculateEfficiencyValue(mNum, lNum);

    const logData = {
      date,
      mileage: mNum,
      liters: lNum,
      cost: cNum,
      fuel_type: 'Pertalite',
      notes: '',
      efficiency
    };

    if (editingId) {
      onEditLog(editingId, logData);
    } else {
      onAddLog(logData);
    }

    resetForm();
    setIsFormOpen(false);
  };

  // Filters
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.fuel_type.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (log.notes || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = fuelTypeFilter === 'All' || log.fuel_type === fuelTypeFilter;
    
    return matchesSearch && matchesType;
  });

  // Sorting
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
  });

  const uniqueFuelTypes = ['All', ...Array.from(new Set(logs.map(l => l.fuel_type)))];

  const getEfficiencyBadge = (eff: number | undefined) => {
    if (!eff) return <span className="text-[12px] bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium">BBM Pertama</span>;
    
    if (eff > 45) {
      return (
        <span className="text-[12px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Sangat Irit ({eff.toFixed(1)} km/L)
        </span>
      );
    } else if (eff > 35) {
      return (
        <span className="text-[12px] bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
          Normal ({eff.toFixed(1)} km/L)
        </span>
      );
    } else {
      return (
        <span className="text-[12px] bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400 px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
          Boros ({eff.toFixed(1)} km/L)
        </span>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Fuel className="w-5 h-5 text-indigo-500" /> Riwayat Pembelian BBM
          </h2>
          <p className="text-sm text-slate-400 mt-1">Pantau rincian biaya BBM, konsumsi liter, dan kalkulasi efisiensi kendaraan Anda.</p>
        </div>
        <button
          id="btn-add-fuel-log"
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10 active:scale-95 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> Catat Pembelian BBM
        </button>
      </div>

      {/* Filters bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="fuel-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari jenis BBM atau catatan..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 text-sm transition-all shadow-xs"
          />
        </div>

        {/* Jenis BBM Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-400">Jenis BBM:</span>
          <select
            id="fuel-type-filter"
            value={fuelTypeFilter}
            onChange={(e) => setFuelTypeFilter(e.target.value)}
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-white rounded-xl py-2 px-3 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 text-sm shadow-xs"
          >
            {uniqueFuelTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Sorting order */}
        <div className="flex items-center gap-2 justify-end">
          <span className="text-sm font-semibold text-slate-400">Urutkan:</span>
          <button
            id="fuel-sort-toggle"
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-white rounded-xl py-2 px-3 text-sm shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
          >
            <ArrowUpDown className="w-4 h-4 text-indigo-500" />
            Tanggal: {sortOrder === 'desc' ? 'Terbaru' : 'Terlama'}
          </button>
        </div>
      </div>

      {/* Main Form Dialog */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div 
            id="fuel-form-modal"
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all"
          >
            <div className="flex justify-between items-center px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Fuel className="w-5 h-5 text-indigo-500" />
                {editingId ? 'Edit Pembelian BBM' : 'Catat Pembelian BBM'}
              </h3>
              <button 
                id="close-fuel-form"
                onClick={resetForm}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 text-sm flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold capitalize tracking-wider text-slate-400 mb-1">
                    Tanggal Pembelian
                  </label>
                  <input
                    id="fuel-date"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold capitalize tracking-wider text-slate-400 mb-1">
                    Biaya Pembelian (Rp)
                  </label>
                  <input
                    id="fuel-cost"
                    type="number"
                    required
                    placeholder="Contoh: 50000"
                    value={cost}
                    onChange={(e) => setCost(e.target.value ? Number(e.target.value) : '')}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold"
                  />
                  {cost && Number(cost) > 0 && (
                    <p className="text-[12px] text-indigo-500 dark:text-indigo-400 mt-1.5 font-medium">
                      Otomatis dikonversi menjadi <b>{(Number(cost) / ((settings?.fuelPricePerLiter || 10) * 1000)).toFixed(2)} Liter</b> Pertalite (berdasarkan harga Rp {(settings?.fuelPricePerLiter || 10)} ribu/L di pengaturan).
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  id="btn-cancel-fuel"
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-sm hover:opacity-80 transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="btn-submit-fuel"
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm hover:bg-indigo-500 transition-all cursor-pointer"
                >
                  Simpan Pembelian
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fuel Logs Grid */}
      {sortedLogs.length === 0 ? (
        <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-xs flex flex-col items-center justify-center text-slate-400">
          <Fuel className="w-12 h-12 text-slate-200 dark:text-slate-700 mb-3" />
          <p className="font-bold text-base">Belum Ada Riwayat BBM</p>
          <p className="text-sm mt-1 max-w-xs">Silakan catat pembelian BBM pertama Anda dengan menekan tombol di atas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedLogs.map((log) => (
            <div 
              id={`fuel-card-${log.id}`}
              key={log.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-xs hover:shadow-md transition-all relative group flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                      <Calendar className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="text-sm font-semibold text-slate-400">
                        {new Date(log.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      <h4 className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {log.fuel_type}
                      </h4>
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      id={`btn-edit-fuel-${log.id}`}
                      onClick={() => handleOpenEdit(log)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      id={`btn-delete-fuel-${log.id}`}
                      onClick={() => {
                        if (confirm('Apakah Anda yakin ingin menghapus catatan bbm ini?')) {
                          onDeleteLog(log.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Core metrics summary */}
                <div className="grid grid-cols-3 gap-2 mt-4 py-3 border-y border-slate-50 dark:border-slate-800/40 text-center">
                  <div>
                    <span className="block text-[12px] font-semibold capitalize tracking-wider text-slate-400">Volume</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-1 block">
                      {log.liters.toLocaleString('id-ID')} L
                    </span>
                  </div>
                  <div>
                    <span className="block text-[12px] font-semibold capitalize tracking-wider text-slate-400">Odometer</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-1 block">
                      {log.mileage.toLocaleString('id-ID')} km
                    </span>
                  </div>
                  <div>
                    <span className="block text-[12px] font-semibold capitalize tracking-wider text-slate-400">Total Biaya</span>
                    <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 block">
                      {formatIDR(log.cost)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Row showing efficiency */}
              <div className="mt-3 flex items-center justify-between gap-2 flex-wrap pt-2">
                {getEfficiencyBadge(log.efficiency)}
                {log.notes && (
                  <span className="text-[12px] text-slate-400 max-w-[50%] truncate italic" title={log.notes}>
                    &ldquo;{log.notes}&rdquo;
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
