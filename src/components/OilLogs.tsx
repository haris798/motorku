import { useState, type FormEvent } from 'react';
import { OilLog, AppSettings } from '../types';
import { formatIDR } from '../utils/export';
import {
  Plus, Trash2, Edit3, Calendar, Search, Wrench, Star, X, ArrowUpDown, AlertCircle,
  Droplets, Gauge, DollarSign, Clock, ListFilter, Shield, Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OilLogsProps {
  logs: OilLog[];
  onAddLog: (log: Omit<OilLog, 'id'>) => void;
  onEditLog: (id: string, updatedLog: Partial<OilLog>) => void;
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

// ─── Component ───────────────────────────────────────────────────────────────
export default function OilLogs({ logs, onAddLog, onEditLog, onDeleteLog, settings }: OilLogsProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState<number | ''>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('All');
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

  const handleOpenEdit = (log: OilLog) => {
    setEditingId(log.id);
    setDate(log.date);
    setCost(log.cost);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cNum = Number(cost);
    if (!cost || cNum < 0) {
      setFormError('Biaya ganti oli tidak boleh bernilai negatif.');
      return;
    }
    let mNum = 0;
    if (editingId) {
      const existing = logs.find(l => l.id === editingId);
      mNum = existing ? existing.mileage : 0;
    } else {
      mNum = logs.length > 0 ? Math.max(...logs.map(l => l.mileage)) : 0;
    }
    const logData = { date, mileage: mNum, cost: cNum, oil_brand: 'Yamalube', oil_type: 'Yamalube Standard', notes: '', rating: 5 };
    if (editingId) onEditLog(editingId, logData);
    else onAddLog(logData);
    resetForm();
    setIsFormOpen(false);
  };

  // Filtering & Sorting
  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.oil_brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.oil_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBrand = brandFilter === 'All' || log.oil_brand.toLowerCase() === brandFilter.toLowerCase();
    return matchesSearch && matchesBrand;
  });
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const tA = new Date(a.date).getTime();
    const tB = new Date(b.date).getTime();
    return sortOrder === 'desc' ? tB - tA : tA - tB;
  });
  const uniqueBrands = ['All', ...Array.from(new Set(logs.map(l => l.oil_brand)))];

  // Stats
  const totalOilCost = logs.reduce((s, l) => s + l.cost, 0);
  const lastOilLog = logs.length > 0 ? logs[0] : null;
  const maxOilMileage = logs.length > 0 ? Math.max(...logs.map(l => l.mileage)) : 0;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5 md:space-y-6 px-0 md:px-1">
      {/* ════════════════════ 1. HERO HEADER ════════════════════ */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 text-white shadow-2xl shadow-indigo-600/20 dark:shadow-black/40">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

        <div className="relative z-10 p-5 md:p-7 lg:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/15 backdrop-blur-sm rounded-xl ring-1 ring-white/20">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight font-display">
                    Servis & Ganti Oli
                  </h1>
                  <p className="text-indigo-200/80 dark:text-slate-400 text-sm mt-0.5">
                    Catat riwayat penggantian oli dan pantau biaya perawatan motor
                  </p>
                </div>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              id="btn-add-oil-log"
              onClick={handleOpenAdd}
              className="px-4 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-semibold rounded-xl text-sm flex items-center gap-2 transition-all cursor-pointer border border-white/15 shadow-lg"
            >
              <Plus className="w-4 h-4" /> Catat Ganti Oli
            </motion.button>
          </div>

          {/* Mini stats row */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Droplets, label: 'Total Servis', value: `${logs.length}x ganti` },
              { icon: DollarSign, label: 'Total Biaya', value: formatIDR(totalOilCost) },
              { icon: Shield, label: 'Merek Populer', value: uniqueBrands.filter(b => b !== 'All').length > 0 ? uniqueBrands.filter(b => b !== 'All')[0] : '-' },
              { icon: Gauge, label: 'Odometer Terakhir', value: maxOilMileage > 0 ? `${maxOilMileage.toLocaleString('id-ID')} km` : '-' },
            ].map((item, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <div className="flex items-center gap-2 text-indigo-200/70 text-[11px] font-medium uppercase tracking-wider mb-1">
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
            id="oil-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari merek oli, tipe, atau catatan..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 text-sm transition-all shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2 shadow-xs">
          <ListFilter className="w-4 h-4 text-indigo-500 shrink-0" />
          <select
            id="oil-brand-filter"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="flex-1 bg-transparent text-slate-800 dark:text-white text-sm focus:outline-hidden"
          >
            {uniqueBrands.map(brand => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          id="oil-sort-toggle"
          onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
          className="flex items-center justify-center gap-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl py-2.5 px-3 text-sm shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
        >
          <ArrowUpDown className="w-4 h-4 text-indigo-500" />
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
              id="oil-form-modal"
              className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-slate-800/80 dark:to-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                    <Wrench className="w-4 h-4" />
                  </div>
                  {editingId ? 'Edit Catatan Ganti Oli' : 'Tambah Catatan Ganti Oli'}
                </h3>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  id="close-oil-form"
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
                      Tanggal Ganti
                    </label>
                    <input
                      id="oil-date"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full py-2.5 px-3.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Biaya Ganti Oli (Rp)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-bold text-sm">Rp</span>
                      <input
                        id="oil-cost"
                        type="number"
                        required
                        placeholder="50.000"
                        value={cost}
                        onChange={(e) => setCost(e.target.value ? Number(e.target.value) : '')}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    id="btn-cancel-oil"
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-sm hover:opacity-80 transition-all cursor-pointer"
                  >
                    Batal
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    id="btn-submit-oil"
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-indigo-600/20"
                  >
                    {editingId ? 'Simpan Perubahan' : 'Simpan Catatan'}
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
            <Wrench className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          </div>
          <p className="font-bold text-base text-slate-500 dark:text-slate-400">Belum Ada Riwayat Ganti Oli</p>
          <p className="text-sm text-slate-400 mt-1 max-w-xs">Catat penggantian oli pertama Anda untuk mulai melacak riwayat perawatan.</p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleOpenAdd}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4 inline mr-1" /> Catat Ganti Oli
          </motion.button>
        </motion.div>
      ) : (
        <>
          {/* Summary Bar */}
          <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
            {[
              { icon: DollarSign, label: 'Total Biaya Oli', value: formatIDR(totalOilCost), color: 'indigo' },
              { icon: Gauge, label: 'Odometer Terakhir', value: maxOilMileage > 0 ? `${maxOilMileage.toLocaleString('id-ID')} km` : '-', color: 'violet' },
              { icon: Award, label: 'Total Servis', value: `${logs.length}x`, color: 'indigo' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                variants={scaleIn}
                className={`p-3 rounded-xl border text-center ${
                  stat.color === 'indigo'
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-100/60 dark:border-indigo-900/30'
                    : 'bg-violet-50/60 dark:bg-violet-950/20 border-violet-100/60 dark:border-violet-900/30'
                }`}
              >
                <stat.icon className={`w-4 h-4 mx-auto mb-1 ${
                  stat.color === 'indigo' ? 'text-indigo-500' : 'text-violet-500'
                }`} />
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{stat.label}</span>
                <span className="text-sm md:text-base font-extrabold text-slate-800 dark:text-white">{stat.value}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Cards Grid */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedLogs.map((log) => (
              <motion.div
                key={log.id}
                variants={scaleIn}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                id={`oil-card-${log.id}`}
                className="group relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-300"
              >
                {/* Gradient accent bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-600 opacity-60" />

                <div className="p-5">
                  {/* Top Row */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 transition-transform duration-300 group-hover:scale-110">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-400">
                          {new Date(log.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        <h4 className="font-bold text-slate-800 dark:text-white mt-0.5 text-base">
                          {log.oil_brand}
                        </h4>
                        <span className="text-[11px] text-slate-400">{log.oil_type}</span>
                      </div>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        id={`btn-edit-oil-${log.id}`}
                        onClick={() => handleOpenEdit(log)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-all cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        id={`btn-delete-oil-${log.id}`}
                        onClick={() => {
                          if (confirm('Apakah Anda yakin ingin menghapus catatan ganti oli ini?')) onDeleteLog(log.id);
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
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Odometer</span>
                      <div className="flex items-baseline justify-center gap-0.5">
                        <span className="text-sm font-extrabold text-slate-800 dark:text-white">{log.mileage.toLocaleString('id-ID')}</span>
                        <span className="text-[10px] text-slate-400">km</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Biaya</span>
                      <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">{formatIDR(log.cost)}</span>
                    </div>
                    <div className="text-center">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Performa</span>
                      <span className="flex items-center justify-center gap-0.5 text-amber-500 font-bold text-sm mt-0.5">
                        {log.rating || 5} <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
                      </span>
                    </div>
                  </div>

                  {/* Notes */}
                  {log.notes && (
                    <div className="mt-3 bg-slate-50/50 dark:bg-slate-950/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40 text-[12px] text-slate-500 italic flex items-start gap-1.5">
                      <span className="text-slate-300 dark:text-slate-600 leading-none">&ldquo;</span>
                      <span>{log.notes}</span>
                      <span className="text-slate-300 dark:text-slate-600 leading-none">&rdquo;</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
