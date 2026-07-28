import { useState, useEffect, useRef } from 'react';
import { OilLog, FuelLog, AppSettings, Jarak } from '../types';
import { formatIDR } from '../utils/export';
import { fetchJarakRecords } from '../lib/supabaseClient';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line
} from 'recharts';
import {
  Gauge, Droplets, Fuel, AlertTriangle, CheckCircle2, TrendingUp, Coins, Activity,
  RefreshCw, Timer, Zap, Flame,
  Battery, Wrench, Clock, Target, Milestone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardProps {
  oilLogs: OilLog[];
  fuelLogs: FuelLog[];
  settings: AppSettings;
  onNavigate: (tab: string) => void;
}

// ─── Animated Counter Component ─────────────────────────────────────────────
function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  decimals = 0,
  duration = 1.5,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const to = value;

    const animate = (now: number) => {
      const elapsed = (now - start) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        ref.current = requestAnimationFrame(animate);
      }
    };

    ref.current = requestAnimationFrame(animate);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [value, duration]);

  return (
    <span>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  );
}

// ─── Stagger Container ───────────────────────────────────────────────────────
const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getMonthYearKey = (dateStr: string) => {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
};

const getOilHealthColor = (pct: number) => {
  if (pct > 40) return { stroke: '#10b981', bg: 'bg-emerald-500', light: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-900/40', ring: 'ring-emerald-500/30' };
  if (pct > 15) return { stroke: '#f59e0b', bg: 'bg-amber-500', light: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-900/40', ring: 'ring-amber-500/30' };
  return { stroke: '#ef4444', bg: 'bg-rose-500', light: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-900/40', ring: 'ring-rose-500/30' };
};

// ─── Dashboard Component ─────────────────────────────────────────────────────
export default function Dashboard({ oilLogs, fuelLogs, settings, onNavigate }: DashboardProps) {
  // ── Derived Data ──────────────────────────────────────────────────────────
  const maxOilMileage = oilLogs.length > 0 ? Math.max(...oilLogs.map(l => l.mileage)) : 0;
  const maxFuelMileage = fuelLogs.length > 0 ? Math.max(...fuelLogs.map(l => l.mileage)) : 0;
  const currentMileage = Math.max(maxOilMileage, maxFuelMileage);
  const allMileages = [...oilLogs.map(l => l.mileage), ...fuelLogs.map(l => l.mileage)].filter(m => m > 0);
  const minMileage = allMileages.length > 0 ? Math.min(...allMileages) : 0;
  const odometerSpan = currentMileage - minMileage;

  const lastOilLog = oilLogs.length > 0 ? oilLogs[0] : null;
  let elapsedKm = 0, remainingKm = settings.oilChangeIntervalKm, oilLifeKmPercent = 100;
  let elapsedDays = 0, remainingDays = settings.oilChangeIntervalDays, oilLifeDaysPercent = 100;

  if (lastOilLog) {
    elapsedKm = currentMileage - lastOilLog.mileage;
    remainingKm = Math.max(0, settings.oilChangeIntervalKm - elapsedKm);
    oilLifeKmPercent = Math.max(0, Math.min(100, Math.round((remainingKm / settings.oilChangeIntervalKm) * 100)));
    const lastDate = new Date(lastOilLog.date);
    const today = new Date();
    const elapsedMs = today.getTime() - lastDate.getTime();
    elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
    remainingDays = Math.max(0, settings.oilChangeIntervalDays - elapsedDays);
    oilLifeDaysPercent = Math.max(0, Math.min(100, Math.round((remainingDays / settings.oilChangeIntervalDays) * 100)));
  }
  const oilLifePercent = lastOilLog ? Math.min(oilLifeKmPercent, oilLifeDaysPercent) : 0;
  const healthColor = getOilHealthColor(oilLifePercent);

  // BBM Analytics
  const totalFuelCost = fuelLogs.reduce((sum, l) => sum + l.cost, 0);
  const totalLiters = fuelLogs.reduce((sum, l) => sum + l.liters, 0);
  const logsWithEfficiency = fuelLogs.filter(l => l.efficiency && l.efficiency > 0);
  const avgEfficiency = logsWithEfficiency.length > 0
    ? logsWithEfficiency.reduce((sum, l) => sum + (l.efficiency || 0), 0) / logsWithEfficiency.length : 0;
  const totalOilCost = oilLogs.reduce((sum, l) => sum + l.cost, 0);
  const totalExpenses = totalFuelCost + totalOilCost;

  // Monthly chart data
  const monthlyDataMap = new Map<string, { month: string; fuel: number; oil: number }>();
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = getMonthYearKey(d.toISOString());
    monthlyDataMap.set(key, { month: key, fuel: 0, oil: 0 });
  }
  fuelLogs.forEach(log => {
    const key = getMonthYearKey(log.date);
    if (monthlyDataMap.has(key)) monthlyDataMap.get(key)!.fuel += log.cost;
    else monthlyDataMap.set(key, { month: key, fuel: log.cost, oil: 0 });
  });
  oilLogs.forEach(log => {
    const key = getMonthYearKey(log.date);
    if (monthlyDataMap.has(key)) monthlyDataMap.get(key)!.oil += log.cost;
    else monthlyDataMap.set(key, { month: key, fuel: 0, oil: log.cost });
  });
  const sortedMonthlyData = Array.from(monthlyDataMap.values());

  // Efficiency trend
  const efficiencyTrendData = [...fuelLogs]
    .filter(l => l.efficiency && l.efficiency > 0)
    .reverse()
    .slice(-10)
    .map(log => ({
      date: new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
      'Efisiensi (km/L)': Number(log.efficiency?.toFixed(1)) || 0,
      'Rata-rata': Number(avgEfficiency.toFixed(1))
    }));

  // Chart style helpers
  const chartTooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(12px)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    padding: '10px 14px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  };

  // ── Jarak Tempuh (bulanan) ───────────────────────────────────────────────
  const [jarakData, setJarakData] = useState<Jarak[]>([]);
  const [jarakLoading, setJarakLoading] = useState(false);

  const loadJarak = async () => {
    setJarakLoading(true);
    try {
      const { records, error } = await fetchJarakRecords();
      if (!error) setJarakData(records);
    } catch { /* ignore */ }
    finally { setJarakLoading(false); }
  };

  useEffect(() => { loadJarak(); }, []);

  // Group jarak by month and sum total_km
  const jarakMonthMap = new Map<string, number>();
  for (const r of jarakData) {
    const key = getMonthYearKey(r.date);
    jarakMonthMap.set(key, (jarakMonthMap.get(key) || 0) + r.total_km);
  }
  const sortedJarakMonths = Array.from(jarakMonthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  const thisMonthKey = getMonthYearKey(new Date().toISOString());
  const thisMonthKm = jarakMonthMap.get(thisMonthKey) || 0;
  const totalKm = jarakData.reduce((sum, r) => sum + r.total_km, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-5 md:space-y-6 px-0 md:px-1"
    >
      {/* ═══════════════════════ 1. HERO HEADER ═══════════════════════ */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-900 text-white shadow-2xl shadow-indigo-600/20 dark:shadow-black/40">
        {/* Decorative blobs */}
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-indigo-400/10 rounded-full blur-2xl pointer-events-none" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative z-10 p-5 md:p-7 lg:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/15 backdrop-blur-sm rounded-xl ring-1 ring-white/20">
                  <Gauge className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight font-display">
                    Dashboard Motor
                  </h1>
                  <p className="text-indigo-200/80 dark:text-slate-400 text-sm mt-0.5">
                    Pantau performa, efisiensi, dan biaya perawatan motor Anda
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('oil')}
                className="px-4 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-semibold rounded-xl text-sm flex items-center gap-2 transition-all cursor-pointer border border-white/15 shadow-lg"
              >
                <Droplets className="w-4 h-4" /> Catat Oli
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('fuel')}
                className="px-4 py-2.5 bg-white/95 text-indigo-700 font-semibold rounded-xl text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-indigo-500/25"
              >
                <Fuel className="w-4 h-4" /> Isi BBM
              </motion.button>
            </div>
          </div>

          {/* Mini stats row */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Timer, label: 'Total Pencatatan', value: `${oilLogs.length + fuelLogs.length} log` },
              { icon: Target, label: 'Rata-rata km/hari', value: avgEfficiency > 0 ? `${avgEfficiency.toFixed(1)} km/L` : '-' },
              { icon: Flame, label: 'Total Biaya BBM', value: formatIDR(totalFuelCost) },
              { icon: Wrench, label: 'Servis Oli', value: `${oilLogs.length}x ganti` },
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

      {/* ═══════════════════════ 2. ALERT BANNER ═══════════════════════ */}
      <AnimatePresence mode="wait">
        {lastOilLog && (remainingKm <= settings.telegram.notifyOnKmBefore || remainingDays <= settings.telegram.notifyOnDaysBefore) ? (
          <motion.div
            key="alert-danger"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
            className="relative overflow-hidden rounded-xl border border-red-200/60 dark:border-red-900/40 bg-gradient-to-r from-red-50 to-red-50/50 dark:from-red-950/30 dark:to-red-950/10"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(239,68,68,0.06),transparent_60%)] pointer-events-none" />
            <div className="relative flex items-start gap-3.5 p-4 md:p-5">
              <div className="p-2.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-red-800 dark:text-red-300 text-sm md:text-base">
                  ⚠️ Jadwal Ganti Oli Sudah Dekat!
                </p>
                <p className="text-sm text-red-700/80 dark:text-red-400/70 mt-1 leading-relaxed">
                  {remainingKm <= 0 && remainingDays <= 0
                    ? 'Batas kilometer dan hari sudah terlampaui! Segera ganti oli.'
                    : remainingKm <= 0
                      ? `Batas kilometer sudah terlampaui! Segera ganti oli motor Anda.`
                      : remainingDays <= 0
                        ? `Batas hari sudah terlampaui! Segera ganti oli motor Anda.`
                        : `Tersisa ${remainingKm.toLocaleString('id-ID')} km atau ${remainingDays} hari lagi.`
                      }
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onNavigate('oil')}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-lg shadow-red-600/20"
              >
                Ganti Oli Sekarang
              </motion.button>
            </div>
          </motion.div>
        ) : lastOilLog ? (
          <motion.div
            key="alert-safe"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
            className="relative overflow-hidden rounded-xl border border-emerald-200/60 dark:border-emerald-900/30 bg-gradient-to-r from-emerald-50 to-emerald-50/30 dark:from-emerald-950/20 dark:to-emerald-950/5"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(16,185,129,0.05),transparent_60%)] pointer-events-none" />
            <div className="relative flex items-center gap-3.5 p-4 md:p-5">
              <div className="p-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-emerald-800 dark:text-emerald-300 text-sm md:text-base">
                  ✅ Oli dalam Kondisi Baik
                </p>
                <p className="text-sm text-emerald-700/70 dark:text-emerald-400/60 mt-0.5">
                  Oli masih aman — tersisa {remainingKm.toLocaleString('id-ID')} km atau {remainingDays} hari lagi
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('oil')}
                className="px-3.5 py-2 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-lg transition-all cursor-pointer shrink-0 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              >
                Lihat Detail
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="alert-empty"
            variants={fadeUp}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
            className="rounded-xl border border-amber-200/60 dark:border-amber-900/30 bg-gradient-to-r from-amber-50 to-amber-50/30 dark:from-amber-950/20 dark:to-amber-950/5 p-4 md:p-5 flex items-center gap-3.5"
          >
            <div className="p-2.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-amber-800 dark:text-amber-300">Belum Ada Data Ganti Oli</p>
              <p className="text-sm text-amber-700/70 dark:text-amber-400/60 mt-0.5">
                Catat ganti oli pertama untuk mulai melacak masa pakai oli
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onNavigate('oil')}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shrink-0 shadow-lg shadow-amber-600/20"
            >
              Catat Sekarang
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════ 3. CORE METRICS ═══════════════════════ */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {[
          {
            icon: Milestone,
            label: 'Jarak Bulan Ini',
            value: jarakLoading ? 0 : thisMonthKm,
            suffix: ' km',
            color: 'from-cyan-500 to-blue-600',
            bgLight: 'bg-cyan-50 dark:bg-cyan-950/30',
            iconColor: 'text-cyan-600 dark:text-cyan-400',
            decimals: 1,
            sub: totalKm > 0
              ? `${sortedJarakMonths.length} bulan tercatat · Total ${totalKm.toFixed(1)} km`
              : !jarakLoading ? 'Belum ada data jarak tempuh' : 'Memuat...',
          },
          {
            icon: TrendingUp, label: 'Rata-rata Konsumsi', value: avgEfficiency, suffix: ' km/L',
            color: 'from-emerald-500 to-teal-600', bgLight: 'bg-emerald-50 dark:bg-emerald-950/30',
            iconColor: 'text-emerald-600 dark:text-emerald-400',
            decimals: 1,
            sub: totalLiters > 0 ? `${totalLiters.toFixed(1)}L total terpakai` : null,
          },
          {
            icon: Coins, label: 'Total Pengeluaran', value: totalExpenses,
            prefixFn: () => 'Rp', bgLight: 'bg-rose-50 dark:bg-rose-950/30',
            iconColor: 'text-rose-600 dark:text-rose-400',
            color: 'from-rose-500 to-pink-600',
            formatCurrency: true,
            sub: `BBM ${formatIDR(totalFuelCost)} + Oli ${formatIDR(totalOilCost)}`,
          },
        ].map((metric, idx) => (
          <motion.div
            key={idx}
            variants={scaleIn}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-sm hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 transition-all duration-300"
          >
            {/* Gradient accent bar */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${metric.color} opacity-60`} />

            <div className="p-4 md:p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${metric.bgLight} ${metric.iconColor} transition-transform duration-300 group-hover:scale-110`}>
                  <metric.icon className="w-5 h-5" />
                </div>
                {'prefixFn' in metric && metric.value > 0 && (
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg">
                    {metric.prefixFn()}
                  </span>
                )}
              </div>
              <span className="block text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                {metric.label}
              </span>
              <div className="flex items-baseline gap-1 flex-wrap">
                {metric.value > 0 ? (
                  <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {metric.formatCurrency ? (
                      formatIDR(metric.value)
                    ) : (
                      <>
                        <AnimatedCounter value={metric.value} decimals={metric.decimals ?? 0} />
                        {metric.suffix && <span className="text-sm font-normal text-slate-400 ml-0.5">{metric.suffix}</span>}
                      </>
                    )}
                  </span>
                ) : (
                  <span className="text-xl md:text-2xl font-extrabold text-slate-300 dark:text-slate-600">—</span>
                )}
              </div>
              {metric.sub && (
                <p className="text-[11px] text-slate-400 mt-1.5 truncate">{metric.sub}</p>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ═══════════════════════ 4. OIL HEALTH + EXPENSES ═══════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        {/* ── Oil Health Card ── */}
        <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-sm">
          {/* Header */}
          <div className="p-5 pb-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                  <Battery className="w-4 h-4" />
                </div>
                Kesehatan Oli
              </h3>
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${healthColor.border} ${healthColor.light} ${healthColor.text}`}>
                {oilLifePercent}%
              </span>
            </div>
            <p className="text-xs text-slate-400">Berdasarkan jarak tempuh dan waktu</p>
          </div>

          {/* Animated Circular Gauge */}
          <div className="flex justify-center py-3">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="68" fill="none" stroke="#e2e8f0" strokeWidth="8" className="dark:stroke-slate-800" />
                <motion.circle
                  cx="80" cy="80" r="68"
                  fill="none"
                  stroke={healthColor.stroke}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 68}
                  initial={{ strokeDashoffset: 2 * Math.PI * 68 }}
                  animate={{
                    strokeDashoffset: 2 * Math.PI * 68 * (1 - oilLifePercent / 100),
                  }}
                  transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
                />
                {/* Glow filter */}
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                  className="text-3xl font-extrabold text-slate-900 dark:text-white font-display"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  {oilLifePercent}%
                </motion.span>
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-widest mt-0.5">
                  Sisa Kualitas
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="px-5 pb-5 space-y-3.5">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Milestone className="w-3 h-3" /> Jarak
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {lastOilLog
                    ? `${elapsedKm.toLocaleString('id-ID')} / ${settings.oilChangeIntervalKm.toLocaleString('id-ID')} km`
                    : '-'}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${healthColor.bg}`}
                  initial={{ width: '0%' }}
                  animate={{ width: `${oilLifeKmPercent}%` }}
                  transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lastOilLog ? `Sisa ${remainingKm.toLocaleString('id-ID')} km` : '—'}
              </p>
            </div>
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Waktu
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {lastOilLog ? `${elapsedDays} / ${settings.oilChangeIntervalDays} hari` : '-'}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${healthColor.bg}`}
                  initial={{ width: '0%' }}
                  animate={{ width: `${oilLifeDaysPercent}%` }}
                  transition={{ duration: 0.8, delay: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lastOilLog ? `Sisa ${remainingDays} hari` : '—'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* ── Monthly Expenses Chart ── */}
        <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-sm lg:col-span-2">
          <div className="p-5 pb-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                  <Activity className="w-4 h-4" />
                </div>
                Pengeluaran Bulanan
              </h3>
              <span className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg font-medium">
                6 bulan terakhir
              </span>
            </div>
            <p className="text-xs text-slate-400">Biaya BBM dan servis oli per bulan</p>
          </div>

          <div className="h-64 md:h-72 w-full px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedMonthlyData} margin={{ top: 10, right: 10, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" strokeOpacity={0.6} />
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" strokeOpacity={0.3} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  stroke="#cbd5e1"
                  className="dark:stroke-slate-800"
                  tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : `${v}`}
                />
                <Tooltip
                  formatter={(value) => [formatIDR(Number(value)), '']}
                  contentStyle={chartTooltipStyle}
                  labelStyle={{ fontWeight: 'bold', color: '#cbd5e1', marginBottom: 6 }}
                  itemStyle={{ padding: '2px 0' }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }}
                />
                <Bar
                  dataKey="fuel"
                  name="Pembelian BBM"
                  fill="#3b82f6"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="oil"
                  name="Servis / Oli"
                  fill="#a78bfa"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* ═══════════════════════ 5. FUEL EFFICIENCY ═══════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        {/* ── Fuel Efficiency Trend ── */}
        <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-sm">
          <div className="p-5 pb-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
                Efisiensi BBM
              </h3>
              {avgEfficiency > 0 && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40">
                  Ø {avgEfficiency.toFixed(1)} km/L
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">Tren efisiensi 10 pengisian terakhir (km/L)</p>
          </div>

          <div className="h-56 md:h-64 w-full px-2 pb-4">
            {efficiencyTrendData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center px-6">
                <div className="p-4 rounded-full bg-slate-50 dark:bg-slate-800/50 mb-3">
                  <Fuel className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Belum Ada Data</p>
                <p className="text-xs text-slate-400 mt-1 text-center max-w-[220px]">
                  Catat minimal 2 pembelian BBM dengan odometer untuk melihat efisiensi
                </p>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onNavigate('fuel')}
                  className="mt-3 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer"
                >
                  Catat BBM
                </motion.button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={efficiencyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" strokeOpacity={0.6} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" strokeOpacity={0.3} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ fontWeight: 'bold', color: '#cbd5e1', marginBottom: 6 }}
                    itemStyle={{ padding: '2px 0' }}
                  />
                  <Legend
                    iconType="plainline"
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Efisiensi (km/L)"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ fill: '#10b981', r: 4, stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="Rata-rata"
                    stroke="#f43f5e"
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    dot={false}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

      </div>

      {/* ═══════════════════════ FOOTER SPACER ═══════════════════════ */}
      <div className="h-2" />
    </motion.div>
  );
}
