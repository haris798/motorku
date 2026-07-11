import { TelegramConfig } from '../types';

/**
 * Sends a notification message via the Telegram Bot API
 */
export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  message: string
): Promise<{ success: boolean; message: string }> {
  if (!botToken || !chatId) {
    return { success: false, message: 'Bot Token atau Chat ID belum dikonfigurasi.' };
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();
    if (data.ok) {
      return { success: true, message: 'Notifikasi Telegram berhasil dikirim!' };
    } else {
      return { success: false, message: `Gagal dari Telegram: ${data.description}` };
    }
  } catch (error: any) {
    console.error('Error sending Telegram message:', error);
    return { success: false, message: error.message || 'Terjadi kesalahan koneksi internet.' };
  }
}

/**
 * Checks if we need to send an oil change alert and sends it if appropriate
 */
export async function checkAndSendOilAlert(
  currentMileage: number,
  lastOilLog: { date: string; mileage: number } | null,
  config: TelegramConfig,
  intervalKm: number,
  intervalDays: number
): Promise<{ triggered: boolean; message?: string }> {
  if (!config.enabled || !config.botToken || !config.chatId) {
    return { triggered: false };
  }

  // If there are no oil change logs, we can't calculate remaining life
  if (!lastOilLog) {
    return { triggered: false };
  }

  const todayStr = new Date().toISOString().split('T')[0];
  
  // Prevent spamming: only notify once per day
  if (config.lastNotifiedDate === todayStr) {
    return { triggered: false };
  }

  const elapsedKm = currentMileage - lastOilLog.mileage;
  const remainingKm = intervalKm - elapsedKm;

  const lastDate = new Date(lastOilLog.date);
  const today = new Date();
  const elapsedMs = today.getTime() - lastDate.getTime();
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
  const remainingDays = intervalDays - elapsedDays;

  const needsKmAlert = remainingKm <= config.notifyOnKmBefore;
  const needsDaysAlert = remainingDays <= config.notifyOnDaysBefore;

  if (needsKmAlert || needsDaysAlert) {
    const formattedDate = new Date(lastOilLog.date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const text = `<b>🏍️ PENGINGAT GANTI OLI MOTOR 🏍️</b>\n\n` +
      `Halo! Sistem mendeteksi bahwa oli motor Anda sudah mendekati batas pemakaian.\n\n` +
      `📊 <b>Informasi Saat Ini:</b>\n` +
      `• Odometer Terakhir: <b>${currentMileage.toLocaleString('id-ID')} km</b>\n` +
      `• Servis Terakhir: <b>${formattedDate}</b> (pada <b>${lastOilLog.mileage.toLocaleString('id-ID')} km</b>)\n\n` +
      `⚠️ <b>Sisa Masa Pakai Oli:</b>\n` +
      `• Sisa Jarak: <pre>${remainingKm <= 0 ? 'SEGERA GANTI (Lewat ' + Math.abs(remainingKm) + ' km)' : remainingKm.toLocaleString('id-ID') + ' km'}</pre>\n` +
      `• Sisa Waktu: <pre>${remainingDays <= 0 ? 'SEGERA GANTI (Lewat ' + Math.abs(remainingDays) + ' hari)' : remainingDays + ' hari'}</pre>\n\n` +
      `💡 <i>Interval Pengaturan: Setiap ${intervalKm.toLocaleString('id-ID')} km atau ${intervalDays} hari. Silakan ganti oli di bengkel langganan Anda demi performa mesin yang prima!</i>`;

    const res = await sendTelegramNotification(config.botToken, config.chatId, text);
    if (res.success) {
      return { triggered: true, message: 'Notifikasi pengingat dikirim ke Telegram!' };
    }
  }

  return { triggered: false };
}
