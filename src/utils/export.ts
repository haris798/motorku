import { OilLog, FuelLog } from '../types';

/**
 * Helper to format currency in Indonesian Rupiah
 */
function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Exports data to CSV format and triggers a download
 */
export function exportToCSV(
  oilLogs: OilLog[],
  fuelLogs: FuelLog[],
  type: 'oil' | 'fuel' | 'all'
) {
  const BOM = '\uFEFF'; // Excel UTF-8 BOM

  if (type === 'oil' || type === 'all') {
    let csvContent = 'No,Tanggal,Odometer (km),Merek Oli,Tipe Oli,Biaya (Rp),Rating Performa (1-5),Catatan\n';
    
    oilLogs.forEach((log, index) => {
      const row = [
        index + 1,
        log.date,
        log.mileage,
        `"${log.oil_brand.replace(/"/g, '""')}"`,
        `"${log.oil_type.replace(/"/g, '""')}"`,
        log.cost,
        log.rating || 5,
        `"${(log.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
      csvContent += row + '\n';
    });

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Riwayat_Ganti_Oli_Motor_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (type === 'fuel' || type === 'all') {
    let csvContent = 'No,Tanggal,Odometer (km),Jumlah (Liter),Biaya (Rp),Jenis BBM,Efisiensi (km/L),Catatan\n';
    
    fuelLogs.forEach((log, index) => {
      const row = [
        index + 1,
        log.date,
        log.mileage,
        log.liters,
        log.cost,
        `"${log.fuel_type.replace(/"/g, '""')}"`,
        log.efficiency ? log.efficiency.toFixed(2) : '-',
        `"${(log.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
      csvContent += row + '\n';
    });

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Riwayat_Konsumsi_BBM_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Triggers a beautiful print layout of the logs which can be saved directly as PDF by the user
 */
export function exportToPDF(oilLogs: OilLog[], fuelLogs: FuelLog[]) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up diblokir! Harap izinkan pop-up untuk mencetak laporan PDF.');
    return;
  }

  // Calculate quick stats
  const totalOilCost = oilLogs.reduce((sum, log) => sum + log.cost, 0);
  const totalFuelCost = fuelLogs.reduce((sum, log) => sum + log.cost, 0);
  const totalLiters = fuelLogs.reduce((sum, log) => sum + log.liters, 0);
  
  // Average fuel efficiency
  const logsWithEfficiency = fuelLogs.filter(log => log.efficiency && log.efficiency > 0);
  const avgEfficiency = logsWithEfficiency.length > 0
    ? (logsWithEfficiency.reduce((sum, log) => sum + (log.efficiency || 0), 0) / logsWithEfficiency.length).toFixed(2)
    : '-';

  const maxMileage = Math.max(
    oilLogs.length > 0 ? oilLogs[0].mileage : 0,
    fuelLogs.length > 0 ? fuelLogs[0].mileage : 0
  );

  const formattedDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Laporan Performa & Perawatan Motor</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 24px;
          background-color: #ffffff;
          font-size: 14px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 3px double #cbd5e1;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .title-area h1 {
          margin: 0;
          font-size: 24px;
          color: #0f172a;
          letter-spacing: -0.5px;
        }
        .title-area p {
          margin: 4px 0 0 0;
          color: #64748b;
          font-size: 13px;
        }
        .meta-area {
          text-align: right;
          font-size: 12px;
          color: #475569;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .stat-card {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 16px;
          background-color: #f8fafc;
        }
        .stat-label {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .stat-value {
          font-size: 18px;
          font-weight: bold;
          color: #0f172a;
        }
        h2 {
          font-size: 16px;
          border-left: 4px solid #0284c7;
          padding-left: 8px;
          margin: 24px 0 12px 0;
          color: #0f172a;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          page-break-inside: auto;
        }
        tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        th {
          background-color: #f1f5f9;
          color: #475569;
          font-weight: 600;
          text-align: left;
          padding: 8px 12px;
          font-size: 11px;
          text-transform: uppercase;
          border-bottom: 2px solid #cbd5e1;
        }
        td {
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 12px;
        }
        .rating-stars {
          color: #eab308;
          font-weight: bold;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 11px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
        }
        @media print {
          body {
            padding: 0;
          }
          button {
            display: none;
          }
          .no-print {
            display: none;
          }
        }
        .btn-print {
          background-color: #0284c7;
          color: white;
          border: none;
          padding: 10px 18px;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
          margin-bottom: 16px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .btn-print:hover {
          background-color: #0369a1;
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 12px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <span style="font-weight: 500; color: #334155;">Laporan Cetak Siap. Silakan klik tombol di samping untuk mencetak atau simpan ke PDF.</span>
        <button onclick="window.print()" class="btn-print">
          🖨️ Cetak / Simpan PDF
        </button>
      </div>

      <div class="header">
        <div class="title-area">
          <h1>Laporan Perawatan & Konsumsi BBM Motor</h1>
          <p>Dokumentasi Performa Kendaraan Secara Berkala</p>
        </div>
        <div class="meta-area">
          <div>Dicetak pada:</div>
          <div style="font-weight: 600; color: #0f172a; margin-top: 2px;">${formattedDate}</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Odometer Terakhir</div>
          <div class="stat-value">${maxMileage.toLocaleString('id-ID')} km</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Rata-rata Konsumsi BBM</div>
          <div class="stat-value">${avgEfficiency} km/L</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Biaya Ganti Oli</div>
          <div class="stat-value">${formatIDR(totalOilCost)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Pengeluaran BBM</div>
          <div class="stat-value">${formatIDR(totalFuelCost)}</div>
        </div>
      </div>

      <h2>Riwayat Penggantian Oli Motor</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 5%">No</th>
            <th style="width: 15%">Tanggal</th>
            <th style="width: 15%">Odometer</th>
            <th style="width: 25%">Merek & Tipe Oli</th>
            <th style="width: 15%">Biaya</th>
            <th style="width: 10%">Rating Oli</th>
            <th style="width: 15%">Catatan</th>
          </tr>
        </thead>
        <tbody>
          ${oilLogs.length === 0 
            ? '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">Belum ada data penggantian oli</td></tr>'
            : oilLogs.map((log, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>${log.mileage.toLocaleString('id-ID')} km</td>
                  <td><strong>${log.oil_brand}</strong><br><span style="font-size:10px; color:#64748b">${log.oil_type}</span></td>
                  <td>${formatIDR(log.cost)}</td>
                  <td class="rating-stars">${'★'.repeat(log.rating || 5)}${'☆'.repeat(5 - (log.rating || 5))}</td>
                  <td style="font-style: italic; color: #475569">${log.notes || '-'}</td>
                </tr>
              `).join('')
          }
        </tbody>
      </table>

      <h2>Riwayat Pembelian & Konsumsi BBM</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 5%">No</th>
            <th style="width: 15%">Tanggal</th>
            <th style="width: 15%">Odometer</th>
            <th style="width: 15%">Jenis BBM</th>
            <th style="width: 15%">Pembelian</th>
            <th style="width: 15%">Biaya</th>
            <th style="width: 10%">Efisiensi</th>
            <th style="width: 10%">Catatan</th>
          </tr>
        </thead>
        <tbody>
          ${fuelLogs.length === 0 
            ? '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">Belum ada data pembelian BBM</td></tr>'
            : fuelLogs.map((log, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>${log.mileage.toLocaleString('id-ID')} km</td>
                  <td><strong>${log.fuel_type}</strong></td>
                  <td>${log.liters.toLocaleString('id-ID')} Liter</td>
                  <td>${formatIDR(log.cost)}</td>
                  <td style="font-weight: bold; color: ${log.efficiency && log.efficiency > 15 ? '#16a34a' : '#d97706'}">
                    ${log.efficiency ? `${log.efficiency.toFixed(1)} km/L` : '-'}
                  </td>
                  <td style="font-style: italic; color: #475569">${log.notes || '-'}</td>
                </tr>
              `).join('')
          }
        </tbody>
      </table>

      <div class="footer">
        <p>Laporan ini dibuat secara otomatis oleh Aplikasi <b>Oil & Fuel Tracker Motor</b>.</p>
        <p>Sistem Pelacakan Mandiri & Sinkronisasi Real-Time.</p>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
