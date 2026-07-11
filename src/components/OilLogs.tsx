import React, { useState } from 'react';
import { OilLog, AppSettings } from '../types';
import { 
  Plus, Trash2, Edit3, Calendar, Search, Wrench, Star, X, Check, ArrowUpDown, AlertCircle, AlertTriangle
} from 'lucide-react';

interface OilLogsProps {
  logs: OilLog[];
  onAddLog: (log: Omit<OilLog, 'id'>) => void;
  onEditLog: (id: string, updatedLog: Partial<OilLog>) => void;
  onDeleteLog: (id: string) => void;
  settings: AppSettings;
}

export default function OilLogs({ logs, onAddLog, onEditLog, onDeleteLog, settings }: OilLogsProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [cost, setCost] = useState<number | ''>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Search & Filter State
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

  const handleSubmit = (e: React.FormEvent) => {
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

    const logData = {
      date,
      mileage: mNum,
      cost: cNum,
      oil_brand: 'Yamalube',
      oil_type: 'Yamalube Standard',
      notes: '',
      rating: 5
    };

    if (editingId) {
      onEditLog(editingId, logData);
    } else {
      onAddLog(logData);
    }

    resetForm();
    setIsFormOpen(false);
  };

  // Filter and Search logic
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.oil_brand.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (log.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.oil_type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesBrand = brandFilter === 'All' || log.oil_brand.toLowerCase() === brandFilter.toLowerCase();
    
    return matchesSearch && matchesBrand;
  });

  // Sort logic
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
  });

  // Unique brands in database for filter dropdown
  const uniqueBrands = ['All', ...Array.from(new Set(logs.map(l => l.oil_brand)))];

  // Formatting Helper
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Top action block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-indigo-500" /> Riwayat Ganti Oli Motor
          </h2>
          <p className="text-xs text-slate-400 mt-1">Kelola dan pantau catatan pemeliharaan oli motor Anda.</p>
        </div>
        <button
          id="btn-add-oil-log"
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10 active:scale-95 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> Catat Ganti Oli
        </button>
      </div>

      {/* Search and Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="oil-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari merek oli atau catatan..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 text-xs transition-all shadow-xs"
          />
        </div>

        {/* Brand Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Merek:</span>
          <select
            id="oil-brand-filter"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-white rounded-xl py-2 px-3 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 text-xs shadow-xs"
          >
            {uniqueBrands.map(brand => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
        </div>

        {/* Sorting order */}
        <div className="flex items-center gap-2 justify-end">
          <span className="text-xs font-semibold text-slate-400">Urutkan:</span>
          <button
            id="oil-sort-toggle"
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-white rounded-xl py-2 px-3 text-xs shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
          >
            <ArrowUpDown className="w-4 h-4 text-indigo-500" />
            Tanggal: {sortOrder === 'desc' ? 'Terbaru' : 'Terlama'}
          </button>
        </div>
      </div>

      {/* Main Form Modal / Slide-down */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div 
            id="oil-form-modal"
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all"
          >
            <div className="flex justify-between items-center px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-500" />
                {editingId ? 'Edit Catatan Ganti Oli' : 'Tambah Catatan Ganti Oli'}
              </h3>
              <button 
                id="close-oil-form"
                onClick={resetForm}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 text-xs flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Tanggal Ganti
                  </label>
                  <input
                    id="oil-date"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Biaya Ganti Oli (Rp)
                  </label>
                  <input
                    id="oil-cost"
                    type="number"
                    required
                    placeholder="Masukkan Rupiah"
                    value={cost}
                    onChange={(e) => setCost(e.target.value ? Number(e.target.value) : '')}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  id="btn-cancel-oil"
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs hover:opacity-80 transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  id="btn-submit-oil"
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-500 transition-all cursor-pointer"
                >
                  Simpan Catatan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logs Table / Cards Grid */}
      {sortedLogs.length === 0 ? (
        <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-xs flex flex-col items-center justify-center text-slate-400">
          <Wrench className="w-12 h-12 text-slate-200 dark:text-slate-700 mb-3" />
          <p className="font-bold text-sm">Belum Ada Riwayat Ganti Oli</p>
          <p className="text-xs mt-1 max-w-xs">Silakan catat penggantian oli pertama Anda dengan menekan tombol di atas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedLogs.map((log) => (
            <div 
              id={`oil-card-${log.id}`}
              key={log.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-xs hover:shadow-md transition-all relative group flex flex-col justify-between"
            >
              {/* Card top row */}
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                      <Calendar className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="text-xs font-semibold text-slate-400">
                        {new Date(log.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      <h4 className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {log.oil_brand} <span className="text-xs font-normal text-slate-400">({log.oil_type})</span>
                      </h4>
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      id={`btn-edit-oil-${log.id}`}
                      onClick={() => handleOpenEdit(log)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      id={`btn-delete-oil-${log.id}`}
                      onClick={() => {
                        if (confirm('Apakah Anda yakin ingin menghapus catatan ganti oli ini?')) {
                          onDeleteLog(log.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Star rating and costs */}
                <div className="grid grid-cols-3 gap-2 mt-4 py-3 border-y border-slate-50 dark:border-slate-800/40 text-center">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Odometer</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1 block">
                      {log.mileage.toLocaleString('id-ID')} km
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Biaya Oli</span>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-1 block">
                      {formatIDR(log.cost)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Performa</span>
                    <span className="flex items-center justify-center gap-0.5 text-amber-500 font-bold text-xs mt-1">
                      {log.rating || 5} <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {log.notes && (
                <div className="mt-3 bg-slate-50/50 dark:bg-slate-950/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40 text-[11px] text-slate-500 italic">
                  &ldquo;{log.notes}&rdquo;
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
