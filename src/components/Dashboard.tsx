import { OilLog, FuelLog, AppSettings } from '../types';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line
} from 'recharts';
import { 
  Gauge, Droplets, Fuel, AlertTriangle, CheckCircle2, TrendingUp, Coins, Milestone, ArrowUpRight, Activity, CalendarClock
} from 'lucide-react';

interface DashboardProps {
  oilLogs: OilLog[];
  fuelLogs: FuelLog[];
  settings: AppSettings;
  onNavigate: (tab: string) => void;
}

export default function Dashboard({ oilLogs, fuelLogs, settings, onNavigate }: DashboardProps) {
  // 1. Calculate General Mileage
  const maxOilMileage = oilLogs.length > 0 ? Math.max(...oilLogs.map(l => l.mileage)) : 0;
  const maxFuelMileage = fuelLogs.length > 0 ? Math.max(...fuelLogs.map(l => l.mileage)) : 0;
  const currentMileage = Math.max(maxOilMileage, maxFuelMileage);

  // Odometer Span (from earliest recorded log to latest)
  const allMileages = [...oilLogs.map(l => l.mileage), ...fuelLogs.map(l => l.mileage)].filter(m => m > 0);
  const minMileage = allMileages.length > 0 ? Math.min(...allMileages) : 0;
  const odometerSpan = currentMileage - minMileage;

  // 2. Oil Change Calculations
  const lastOilLog = oilLogs.length > 0 ? oilLogs[0] : null; // sorted desc
  
  let elapsedKm = 0;
  let remainingKm = settings.oilChangeIntervalKm;
  let oilLifeKmPercent = 100;
  
  let elapsedDays = 0;
  let remainingDays = settings.oilChangeIntervalDays;
  let oilLifeDaysPercent = 100;

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

  // Final oil life index is the minimum of mileage health and day health
  const oilLifePercent = lastOilLog ? Math.min(oilLifeKmPercent, oilLifeDaysPercent) : 0;

  // 3. BBM Analytics
  const totalFuelCost = fuelLogs.reduce((sum, l) => sum + l.cost, 0);
  const totalLiters = fuelLogs.reduce((sum, l) => sum + l.liters, 0);
  
  const logsWithEfficiency = fuelLogs.filter(l => l.efficiency && l.efficiency > 0);
  const avgEfficiency = logsWithEfficiency.length > 0
    ? logsWithEfficiency.reduce((sum, l) => sum + (l.efficiency || 0), 0) / logsWithEfficiency.length
    : 0;

  const totalOilCost = oilLogs.reduce((sum, l) => sum + l.cost, 0);
  const totalExpenses = totalFuelCost + totalOilCost;

  // Cost per KM (total fuel cost over distance span)
  const costPerKm = odometerSpan > 0 ? totalFuelCost / odometerSpan : 0;

  // Helper to format currency
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // 4. Prepare Chart Data for Monthly Expenses
  // We aggregate oil & fuel costs by Month-Year (e.g. "Jul 26")
  const monthlyDataMap = new Map<string, { month: string; fuel: number; oil: number }>();
  
  // Helper to parse date to Indonesian Month abbreviation
  const getMonthYearKey = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${months[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
  };

  // Pre-populate last 6 months to guarantee continuous visual timeline
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = getMonthYearKey(d.toISOString());
    monthlyDataMap.set(key, { month: key, fuel: 0, oil: 0 });
  }

  // Populate fuel costs
  fuelLogs.forEach(log => {
    const key = getMonthYearKey(log.date);
    if (monthlyDataMap.has(key)) {
      const val = monthlyDataMap.get(key)!;
      val.fuel += log.cost;
    } else {
      // Dynamic insertion of older logs if they exist
      monthlyDataMap.set(key, { month: key, fuel: log.cost, oil: 0 });
    }
  });

  // Populate oil costs
  oilLogs.forEach(log => {
    const key = getMonthYearKey(log.date);
    if (monthlyDataMap.has(key)) {
      const val = monthlyDataMap.get(key)!;
      val.oil += log.cost;
    } else {
      monthlyDataMap.set(key, { month: key, fuel: 0, oil: log.cost });
    }
  });

  // Convert map to sorted array (chronological order)
  const sortedMonthlyData = Array.from(monthlyDataMap.values());

  // 5. Prepare Chart Data for Fuel Efficiency Trend
  // We'll show the fuel efficiency over consecutive fuel log inputs (limit to 10 entries for neatness)
  const efficiencyTrendData = [...fuelLogs]
    .filter(l => l.efficiency && l.efficiency > 0)
    .reverse() // chronological
    .slice(-10) // last 10 logs
    .map(log => ({
      date: new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
      'Efisiensi (km/L)': Number(log.efficiency?.toFixed(1)) || 0,
      'Rata-rata': Number(avgEfficiency.toFixed(1))
    }));

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-700 dark:from-slate-800 dark:via-indigo-950/70 dark:to-slate-800 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 translate-y-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
        
        <div className="z-10">
          <h1 className="text-3xl md:text-3xl font-extrabold tracking-tight">
            Monitor Performa Motor
          </h1>
          <p className="text-indigo-100 dark:text-slate-300 text-sm md:text-base mt-1 max-w-md">
            Pantau masa pakai oli, hitung efisiensi bahan bakar secara akurat.
          </p>
        </div>

        <div className="flex gap-3 z-10">
          <button
            id="dash-add-oil"
            onClick={() => onNavigate('oil')}
            className="px-4 py-2 bg-white text-indigo-700 dark:bg-slate-900 dark:text-indigo-400 font-bold rounded-xl text-sm flex items-center gap-1.5 shadow-md shadow-black/5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer active:scale-95"
          >
            <Droplets className="w-4 h-4" /> Catat Oli
          </button>
          <button
            id="dash-add-fuel"
            onClick={() => onNavigate('fuel')}
            className="px-4 py-2 bg-indigo-500/30 text-white font-bold rounded-xl text-sm border border-white/20 hover:bg-indigo-500/50 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
          >
            <Fuel className="w-4 h-4" /> Beli BBM
          </button>
        </div>
      </div>

      {/* 2. Overdue / Alert Status */}
      {lastOilLog && (remainingKm <= settings.telegram.notifyOnKmBefore || remainingDays <= settings.telegram.notifyOnDaysBefore) ? (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40 text-red-800 dark:text-red-300 flex items-start gap-3 shadow-xs animate-pulse">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-base">Peringatan: Jadwal Ganti Oli Sudah Dekat!</p>
            <p className="text-sm mt-1 leading-relaxed">
              Oli motor Anda perlu segera diganti. 
              {remainingKm <= 0 ? ' Batas kilometer sudah terlampaui!' : ` Tersisa ${remainingKm.toLocaleString('id-ID')} km lagi.`}
              {remainingDays <= 0 ? ' Batas hari sudah terlampaui!' : ` Tersisa ${remainingDays} hari lagi.`}
            </p>
          </div>
        </div>
      ) : lastOilLog ? (
        <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 dark:bg-emerald-950/10 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-500" />
          <div>
            <p className="font-semibold text-base">Oli dalam Kondisi Baik</p>
            <p className="text-sm mt-0.5">
              Oli motor Anda masih aman untuk digunakan hingga {remainingKm.toLocaleString('id-ID')} km atau {remainingDays} hari ke depan.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-900/30 text-amber-800 dark:text-amber-400 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-semibold text-base">Belum Ada Data Ganti Oli</p>
            <p className="text-sm mt-0.5">
              Silakan tambahkan catatan ganti oli pertama Anda untuk mengaktifkan pelacakan kesehatan oli dan mengaktifkan notifikasi Telegram.
            </p>
          </div>
        </div>
      )}

      {/* 3. Core Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            <Milestone className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-sm font-medium text-slate-400 dark:text-slate-500">Odometer Saat Ini</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-white mt-1 block">
              {currentMileage.toLocaleString('id-ID')} <span className="text-sm font-normal text-slate-400">km</span>
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-sm font-medium text-slate-400 dark:text-slate-500">Rata-rata Konsumsi</span>
            <span className="text-2xl font-bold text-slate-800 dark:text-white mt-1 block">
              {avgEfficiency > 0 ? avgEfficiency.toFixed(1) : '-'} <span className="text-sm font-normal text-slate-400">km/L</span>
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-sm font-medium text-slate-400 dark:text-slate-500">Total Pengeluaran</span>
            <span className="text-xl font-bold text-slate-800 dark:text-white mt-1 block leading-tight">
              {formatIDR(totalExpenses)}
            </span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-sm font-medium text-slate-400 dark:text-slate-500">Est. Biaya per km</span>
            <span className="text-xl font-bold text-slate-800 dark:text-white mt-1 block leading-tight">
              {costPerKm > 0 ? `${formatIDR(costPerKm)}/km` : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Complex Health Widget (Gauge & Details) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Oil health card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Gauge className="w-5 h-5 text-indigo-500" /> Status Sisa Masa Pakai Oli
              </span>
              <span className={`text-sm font-extrabold px-2 py-0.5 rounded-full ${
                oilLifePercent > 40 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400' :
                oilLifePercent > 15 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' :
                'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400'
              }`}>
                {oilLifePercent}%
              </span>
            </div>

            {/* Circular Visual Progress */}
            <div className="relative flex items-center justify-center py-6">
              <svg className="w-36 h-36 transform -rotate-90">
                <circle 
                  cx="72" cy="72" r="64" 
                  className="stroke-slate-100 dark:stroke-slate-800 fill-none stroke-[8px]"
                />
                <circle 
                  cx="72" cy="72" r="64" 
                  className={`fill-none stroke-[10px] stroke-linecap-round transition-all duration-1000 ${
                    oilLifePercent > 40 ? 'stroke-emerald-500' :
                    oilLifePercent > 15 ? 'stroke-amber-500' :
                    'stroke-rose-500'
                  }`}
                  style={{
                    strokeDasharray: 2 * Math.PI * 64,
                    strokeDashoffset: 2 * Math.PI * 64 * (1 - oilLifePercent / 100)
                  }}
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-extrabold text-slate-800 dark:text-white">{oilLifePercent}%</span>
                <span className="text-[12px] text-slate-400 capitalize tracking-wider font-semibold">Sisa Kualitas</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-50 dark:border-slate-800/60 text-sm">
            {/* Km track */}
            <div>
              <div className="flex justify-between font-medium text-slate-500 dark:text-slate-400 mb-1">
                <span>Berdasarkan Jarak (km)</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {lastOilLog ? `${elapsedKm.toLocaleString('id-ID')} / ${settings.oilChangeIntervalKm.toLocaleString('id-ID')} km` : '-'}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${oilLifeKmPercent > 40 ? 'bg-emerald-500' : oilLifeKmPercent > 15 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${oilLifeKmPercent}%` }}
                />
              </div>
              <p className="text-[12px] text-slate-400 mt-1">
                {lastOilLog ? `Sisa ${remainingKm.toLocaleString('id-ID')} km lagi sebelum ganti.` : 'Belum ada data ganti oli.'}
              </p>
            </div>

            {/* Days track */}
            <div>
              <div className="flex justify-between font-medium text-slate-500 dark:text-slate-400 mb-1">
                <span>Berdasarkan Waktu (hari)</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {lastOilLog ? `${elapsedDays} / ${settings.oilChangeIntervalDays} hari` : '-'}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${oilLifeDaysPercent > 40 ? 'bg-emerald-500' : oilLifeDaysPercent > 15 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${oilLifeDaysPercent}%` }}
                />
              </div>
              <p className="text-[12px] text-slate-400 mt-1">
                {lastOilLog ? `Sisa ${remainingDays} hari lagi sebelum ganti.` : 'Belum ada data ganti oli.'}
              </p>
            </div>
          </div>
        </div>

        {/* Analytical Charts */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs lg:col-span-2 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-indigo-500" /> Analitik Pengeluaran Bulanan (Rp)
            </h3>
            <p className="text-sm text-slate-400 mb-4">Grafik 6 bulan terakhir: akumulasi pengeluaran BBM dan penggantian Oli.</p>
          </div>
          <div className="h-64 w-full text-sm">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedMonthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" />
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8' }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                <YAxis 
                  tick={{ fill: '#94a3b8' }} 
                  stroke="#cbd5e1" 
                  className="dark:stroke-slate-800"
                  tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${v/1000}k` : v}
                />
                <Tooltip 
                  formatter={(value) => [formatIDR(Number(value)), '']}
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderRadius: '12px', 
                    border: 'none',
                    color: 'white'
                  }}
                  labelStyle={{ fontWeight: 'bold', color: '#cbd5e1' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                <Bar dataKey="fuel" name="Pembelian BBM" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="oil" name="Servis / Oli" fill="#818cf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Fuel Efficiency Trend Line Chart */}
      <div className="grid grid-cols-1 gap-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" /> Tren Efisiensi Konsumsi Bahan Bakar (km/L)
              </h3>
              <p className="text-sm text-slate-400 mt-0.5">Grafik perbandingan efisiensi BBM pada 10 pengisian terakhir.</p>
            </div>
            {avgEfficiency > 0 ? (
              <span className="text-sm bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-lg border border-emerald-100 dark:border-emerald-900/40 font-semibold self-start md:self-auto">
                Rerata Efisiensi: {avgEfficiency.toFixed(1)} km/L
              </span>
            ) : null}
          </div>

          <div className="h-64 w-full text-sm">
            {efficiencyTrendData.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/10 p-8 text-center text-slate-400">
                <Fuel className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-base font-bold">Data Efisiensi BBM Belum Tersedia</p>
                <p className="text-sm mt-1 max-w-xs">Efisiensi dihitung secara otomatis jika Anda mencatat minimal 2 pembelian BBM dengan odometer yang terus bertambah.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={efficiencyTrendData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:hidden" />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" className="hidden dark:block" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8' }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                  <YAxis tick={{ fill: '#94a3b8' }} stroke="#cbd5e1" className="dark:stroke-slate-800" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderRadius: '12px', 
                      border: 'none',
                      color: 'white'
                    }}
                    labelStyle={{ fontWeight: 'bold', color: '#cbd5e1' }}
                  />
                  <Legend iconType="plainline" />
                  <Line 
                    type="monotone" 
                    dataKey="Efisiensi (km/L)" 
                    stroke="#10b981" 
                    strokeWidth={3} 
                    dot={{ fill: '#10b981', r: 5 }}
                    activeDot={{ r: 8 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Rata-rata" 
                    stroke="#ef4444" 
                    strokeDasharray="5 5" 
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
