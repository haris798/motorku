import { useState, type FormEvent } from 'react';
import { FuelLog, AppSettings } from '../types';
import { formatIDR } from '../utils/export';
import { fetchJarakRecords } from '../lib/supabaseClient';
import {
  Plus, Trash2, Edit3, Calendar, Search, Fuel, X, ArrowUpDown, AlertCircle, Sparkles,
  TrendingUp, Droplets, DollarSign, Gauge, ListFilter, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FuelLogsProps {
  logs: FuelLog[];
  onAddLog: (log: Omit<FuelLog, 'id'>) => void;
  onEditLog: (id: string, updatedLog: Partial<FuelLog>) => void;
  onDeleteLog: (id: string) => void;
  settings: AppSettings;
}

// ─── Animation Variants ──────────────────────────────────────────────────────
const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getEfficiencyBadge = (eff: number | undefined) => {
  if (!eff) return (
    <span className="text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-full font-semibold">
      BBM Pertama
    </span>
  );
  if (eff > 45) return (
    <span className="text-[11px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 border border-emerald-200/60 dark:border-emerald-900/30">
      <Sparkles className="w-3 h-3" /> Sangat Irit ({eff.toFixed(1)} km/L)
    </span>
  );
  if (eff > 35) return (
    <span className="text-[11px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 border border-amber-200/60 dark:border-amber-900/30">
      Normal ({eff.toFixed(1)} km/L)
    </span>
  );
  return (
    <span className="text-[11px] bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 border border-rose-200/60 dark:border-rose-900/30">
      Boros ({eff.toFixed(1)} km/L)
    </span>
  );
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function FuelLogs({ logs, onAddLog, onEditLog, onDeleteLog, settings }: FuelLogsProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState<number | ''>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [effCalculating, setEffCalculating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fuelTypeFilter, setFuelTypeFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const resetForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setCost('');
    setFormError(null);
    setEditingId(null);
    setIsFormOpen(false);
    setEffCalculating(false);
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

  const calculateEfficiencyFromJarak = async (
    currentDate: string,
    currentLiters: number
  ): Promise<number | undefined> => {
    // Find previous fuel log chronologically
    const sortedLogs = [...logs]
      .filter(l => l.id !== editingId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let prevLog: FuelLog | null = null;
    for (let i = sortedLogs.length - 1; i >= 0; i--) {
      if (new Date(sortedLogs[i].date).getTime() < new Date(currentDate).getTime()) {
        prevLog = sortedLogs[i];
        break;
      }
    }

    if (!prevLog) return undefined;

    // Fetch jarak records between previous fill date and current date
    const { records, error } = await fetchJarakRecords();
    if (error || records.length === 0) return undefined;

    const startDate = prevLog.date;
    const endDate = currentDate;

    const totalKm = records
      .filter(r => r.date >= startDate && r.date <= endDate)
      .reduce((sum, r) => sum + r.total_km, 0);

    if (totalKm > 0 && currentLiters > 0) {
      return totalKm / currentLiters;
    }
    return undefined;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cNum = Number(cost);
    if (!cost || cNum <= 0) {
      setFormError('Biaya pembelian bbm (Rp) harus lebih besar dari 0.');
      return;
    }
    const pricePerLiter = (settings?.fuelPricePerLiter || 10) * 1000;
    const lNum = Number((cNum / pricePerLiter).toFixed(2));

    // Calculate efficiency using jarak table
    setEffCalculating(true);
    const efficiency = await calculateEfficiencyFromJarak(date, lNum);
    setEffCalculating(false);

    // Set mileage to max existing (for record, no longer used for efficiency)
    const mNum = logs.length > 0 ? Math.max(...logs.map(l => l.mileage)) : 0;

    const logData = { date, mileage: mNum, liters: lNum, cost: cNum, fuel_type: 'Pertalite', notes: '', efficiency };
    if (editingId) onEditLog(editingId, logData);
    else onAddLog(logData);
    resetForm();
    setIsFormOpen(false);
  };

  // Filtering & Sorting
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.fuel_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.notes || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = fuelTypeFilter === 'All' || log.fuel_type === fuelTypeFilter;
    return matchesSearch && matchesType;
  });
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    return sortOrder === 'desc' ? tB - tA : tA - tB;
  });
  const uniqueFuelTypes = ['All', ...Array.from(new Set(logs.map(l => l.fuel_type)))];

  // Stats
  const totalFuelCost = logs.reduce((s, l) => s + l.cost, 0);
  const totalLiters = logs.reduce((s, l) => s + l.liters, 0);
  const logsWithEff = logs.filter(l => l.efficiency && l.efficiency > 0);
  const avgEff = logsWithEff.length > 0
    ? logsWithEff.reduce((s, l) => s + (l.efficiency || 0), 0) / logsWithEff.length
    : 0;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5 md:space-y-6 px-0 md:px-1">
      {/* ════════════════════ 1. HERO HEADER ════════════════════ */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 dark:from-slate-900 dark:via-emerald-950 dark:to-slate-900 text-white shadow-2xl shadow-emerald-600/20 dark:shadow-black/40">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

        <div className="relative z-10 p-5 md:p-7 lg:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/15 backdrop-blur-sm rounded-xl ring-1 ring-white/20">
                  <Fuel className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight font-display">
                    Pencatatan BBM
                  </h1>
                  <p className="text-emerald-100/80 dark:text-slate-400 text-sm mt-0.5">
                    Lacak konsumsi bahan bakar, biaya, dan efisiensi kendaraan
                  </p>
                </div>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              id="btn-add-fuel-log"
              onClick={handleOpenAdd}
              className="px-4 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-semibold rounded-xl text-sm flex items-center gap-2 transition-all cursor-pointer border border-white/15 shadow-lg"
            >
              <Plus className="w-4 h-4" /> Catat Pembelian BBM
            </motion.button>
          </div>

          {/* Mini stats row */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Droplets, label: 'Total Liter', value: `${totalLiters.toFixed(1)} L` },
              { icon: DollarSign, label: 'Total Biaya', value: formatIDR(totalFuelCost) },
              { icon: TrendingUp, label: 'Rata-rata Efisiensi', value: avgEff > 0 ? `${avgEff.toFixed(1)} km/L` : '-' },
              { icon: Gauge, label: 'Total Pencatatan', value: `${logs.length}x isi` },
            ].map((item, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <div className="flex items-center gap-2 text-emerald-200/70 text-[11px] font-medium uppercase tracking-wider mb-1">
                  <item.icon className="w-3 h-3" />
                  {item.label}
                </div>
                <span className="text-sm md:text-base font-bold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ════════════════════ 2. FILTERS BAR ════════════════════ */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="fuel-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari jenis BBM atau catatan..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 text-sm transition-all shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2 shadow-xs">
          <ListFilter className="w-4 h-4 text-emerald-500 shrink-0" />
          <select
            id="fuel-type-filter"
            value={fuelTypeFilter}
            onChange={(e) => setFuelTypeFilter(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 dark:text-white text-sm focus:outline-hidden"
          >
            {uniqueFuelTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          id="fuel-sort-toggle"
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl py-2.5 px-3 text-sm shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
        >
          <ArrowUpDown className="w-4 h-4 text-emerald-500" />
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          {sortOrder === 'desc' ? 'Terbaru' : 'Terlama'}
        </motion.button>
      </motion.div>

      {/* ════════════════════ 3. FORM MODAL ════════════════════ */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              id="fuel-form-modal"
              className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-slate-800/80 dark:to-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                    <Fuel className="w-4 h-4" />
                  </div>
                  {editingId ? 'Edit Pembelian BBM' : 'Catat Pembelian BBM'}
                </h3>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  id="close-fuel-form"
                  onClick={resetForm}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-all"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <AnimatePresence>
                  {formError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 text-sm flex gap-2.5"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Tanggal Pembelian
                    </label>
                    <input
                      id="fuel-date"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full py-2.5 px-3.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Biaya Pembelian (Rp)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-bold text-sm">Rp</span>
                      <input
                        id="fuel-cost"
                        type="number"
                        required
                        placeholder="50.000"
                        value={cost}
                        onChange={(e) => setCost(e.target.value ? Number(e.target.value) : '')}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-sm font-semibold transition-all"
                      />
                    </div>
                    {cost && Number(cost) > 0 && (
                      <motion.p
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-2 font-medium flex items-center gap-1.5"
                      >
                        <Droplets className="w-3.5 h-3.5" />
                        Otomatis <b>{(Number(cost) / ((settings?.fuelPricePerLiter || 10) * 1000)).toFixed(2)} Liter</b> Pertalite
                        (Rp{(settings?.fuelPricePerLiter || 10).toLocaleString('id-ID')}rb/L)
                      </motion.p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    id="btn-cancel-fuel"
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-sm hover:opacity-80 transition-all cursor-pointer"
                  >
                    Batal
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    id="btn-submit-fuel"
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
                  >
                    {editingId ? 'Simpan Perubahan' : 'Simpan Pembelian'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════════════════ 4. LOGS GRID ════════════════════ */}
      {sortedLogs.length === 0 ? (
        <motion.div variants={fadeUp} className="text-center p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm flex flex-col items-center justify-center">
          <div className="p-4 rounded-full bg-slate-50 dark:bg-slate-800/50 mb-4">
            <Fuel className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          </div>
          <p className="font-bold text-base text-slate-500 dark:text-slate-400">Belum Ada Riwayat BBM</p>
          <p className="text-sm text-slate-400 mt-1 max-w-xs">Catat pembelian BBM pertama Anda untuk mulai melacak konsumsi dan efisiensi.</p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleOpenAdd}
            className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4 inline mr-1" /> Catat Pembelian BBM
          </motion.button>
        </motion.div>
      ) : (
        <>
          {/* Summary Bar */}
          <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
            {[
              { icon: Droplets, label: 'Total Liter', value: `${totalLiters.toFixed(1)} L`, color: 'blue' },
              { icon: DollarSign, label: 'Total Biaya', value: formatIDR(totalFuelCost), color: 'emerald' },
              { icon: TrendingUp, label: 'Rata-rata Efisiensi', value: avgEff > 0 ? `${avgEff.toFixed(1)} km/L` : '-', color: 'amber' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                variants={scaleIn}
                className={`p-3 rounded-xl border text-center ${
                  stat.color === 'blue'
                    ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-100/60 dark:border-blue-900/30'
                    : stat.color === 'emerald'
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100/60 dark:border-emerald-900/30'
                      : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-100/60 dark:border-amber-900/30'
                }`}
              >
                <stat.icon className={`w-4 h-4 mx-auto mb-1 ${
                  stat.color === 'blue' ? 'text-blue-500' : stat.color === 'emerald' ? 'text-emerald-500' : 'text-amber-500'
                }`} />
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{stat.label}</span>
                <span className="text-sm md:text-base font-extrabold text-slate-800 dark:text-white">{stat.value}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Cards Grid */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedLogs.map((log, index) => (
              <motion.div
                key={log.id}
                variants={scaleIn}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                id={`fuel-card-${log.id}`}
                className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-300"
              >
                {/* Gradient accent bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60" />

                <div className="p-5">
                  {/* Top Row */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 transition-transform duration-300 group-hover:scale-110">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-400">
                          {new Date(log.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        <h4 className="font-bold text-slate-800 dark:text-white mt-0.5 text-base">
                          {log.fuel_type}
                        </h4>
                      </div>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        id={`btn-edit-fuel-${log.id}`}
                        onClick={() => handleOpenEdit(log)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition-all cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        id={`btn-delete-fuel-${log.id}`}
                        onClick={() => {
                          if (confirm('Apakah Anda yakin ingin menghapus catatan BBM ini?')) onDeleteLog(log.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-3 mt-4 py-3 border-y border-slate-50 dark:border-slate-800/40">
                    <div className="text-center">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Volume</span>
                      <div className="flex items-baseline justify-center gap-0.5">
                        <span className="text-sm font-extrabold text-slate-800 dark:text-white">{log.liters.toLocaleString('id-ID')}</span>
                        <span className="text-[10px] text-slate-400">L</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Odometer</span>
                      <div className="flex items-baseline justify-center gap-0.5">
                        <span className="text-sm font-extrabold text-slate-800 dark:text-white">-</span>
                        <span className="text-[10px] text-slate-400"></span>
                      </div>
                    </div>
                    <div className="text-center">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Biaya</span>
                      <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{formatIDR(log.cost)}</span>
                    </div>
                  </div>

                  {/* Bottom Row */}
                  <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                    {getEfficiencyBadge(log.efficiency)}
                    {log.notes && (
                      <span className="text-[11px] text-slate-400 max-w-[50%] truncate italic" title={log.notes}>
                        &ldquo;{log.notes}&rdquo;
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
