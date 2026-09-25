import { Storage } from './storage';
import { sendWhatsAppText, sendWhatsAppFile, getWhatsAppStatus } from './whatsapp';
import { BroadcastSchedule, Contact, BroadcastLog, ScheduleRow } from '@/types';

// Singleton worker tracker in global scope
const globalForScheduler = globalThis as unknown as {
  schedulerTimer?: NodeJS.Timeout | null;
  isProcessingSchedule?: boolean;
};

// Helper for anti-ban random delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getRandomDelay(minSec: number, maxSec: number): number {
  const min = Math.max(1, minSec);
  const max = Math.max(min, maxSec);
  const seconds = Math.floor(Math.random() * (max - min + 1)) + min;
  return seconds * 1000;
}

// Helper to get Date object in WIB (Asia/Jakarta, UTC+7)
export function getWibDate(offsetDays = 0): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);
  if (offsetDays !== 0) {
    wib.setDate(wib.getDate() + offsetDays);
  }
  return wib;
}

export function formatIndonesianDate(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDO_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function parseDateString(str?: string): Date | null {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  // DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(trimmed)) {
    const parts = trimmed.split(/[\/\-]/).map(Number);
    const day = parts[0];
    const month = parts[1] - 1;
    let year = parts[2];
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }

  // "26 September 2026"
  for (let mIdx = 0; mIdx < INDO_MONTHS.length; mIdx++) {
    const mName = INDO_MONTHS[mIdx];
    if (trimmed.toLowerCase().includes(mName.toLowerCase())) {
      const nums = trimmed.match(/\d+/g);
      if (nums && nums.length >= 2) {
        const day = Number(nums[0]);
        const year = Number(nums[1]);
        return new Date(year, mIdx, day);
      }
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

export function matchesScheduleRow(row: ScheduleRow, targetDate: Date): boolean {
  const rowDateStr = row.tanggal || row.hari || '';
  if (!rowDateStr) return false;

  const parsed = parseDateString(rowDateStr);
  if (parsed) {
    return isSameDay(parsed, targetDate);
  }

  const dayName = INDO_DAYS[targetDate.getDay()];
  if (rowDateStr.toLowerCase().includes(dayName.toLowerCase())) {
    return true;
  }

  return false;
}

// Replace template variables with full context
export function personalizeMessage(
  template: string,
  contact: { name: string; phone: string; group?: string },
  scheduleTitle?: string,
  scheduleContext?: {
    tanggalFormatted?: string;
    waktuFormatted?: string;
    kegiatanText?: string;
    jadwalFormatted?: string;
    petugasText?: string;
    lokasiText?: string;
    keteranganText?: string;
  }
): string {
  const nowWib = getWibDate();
  const dateFormatted = scheduleContext?.tanggalFormatted || formatIndonesianDate(nowWib);
  const timeFormatted =
    scheduleContext?.waktuFormatted ||
    nowWib.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return template
    .replace(/\{nama\}/gi, contact.name || 'Sahabat')
    .replace(/\{name\}/gi, contact.name || 'Sahabat')
    .replace(/\{nomor\}/gi, contact.phone)
    .replace(/\{phone\}/gi, contact.phone)
    .replace(/\{grup\}/gi, contact.group || 'Umum')
    .replace(/\{group\}/gi, contact.group || 'Umum')
    .replace(/\{jadwal\}/gi, scheduleContext?.jadwalFormatted || scheduleTitle || 'Jadwal')
    .replace(/\{kegiatan\}/gi, scheduleContext?.kegiatanText || scheduleTitle || 'Kegiatan')
    .replace(/\{tanggal\}/gi, dateFormatted)
    .replace(/\{waktu\}/gi, timeFormatted)
    .replace(/\{jam\}/gi, timeFormatted)
    .replace(/\{petugas\}/gi, scheduleContext?.petugasText || '-')
    .replace(/\{lokasi\}/gi, scheduleContext?.lokasiText || '-')
    .replace(/\{keterangan\}/gi, scheduleContext?.keteranganText || '-');
}

// Process single broadcast recipient
export async function sendBroadcastToRecipient(
  schedule: BroadcastSchedule,
  contact: { name: string; phone: string; group?: string },
  scheduleContext?: {
    tanggalFormatted?: string;
    waktuFormatted?: string;
    kegiatanText?: string;
    jadwalFormatted?: string;
    petugasText?: string;
    lokasiText?: string;
    keteranganText?: string;
  }
): Promise<BroadcastLog> {
  const isScheduleTextMode = schedule.sendMode === 'schedule_text';
  const personalizedText = personalizeMessage(
    schedule.message,
    contact,
    schedule.title,
    scheduleContext
  );

  const log: BroadcastLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    scheduleId: schedule.id,
    scheduleTitle: schedule.title,
    recipientPhone: contact.phone,
    recipientName: contact.name,
    messageText: personalizedText,
    hasAttachment: isScheduleTextMode ? false : Boolean(schedule.attachedFile),
    attachmentName: isScheduleTextMode ? undefined : schedule.attachedFile?.originalName,
    status: 'queued',
    sentAt: new Date().toISOString(),
  };

  try {
    const senderAcc = schedule.recipients.senderAccountId || 'rotation';
    if (!isScheduleTextMode && schedule.attachedFile) {
      await sendWhatsAppFile(
        contact.phone,
        schedule.attachedFile.localPath,
        schedule.attachedFile.originalName,
        schedule.attachedFile.mimeType,
        personalizedText,
        senderAcc
      );
    } else {
      // Send TEXT ONLY
      await sendWhatsAppText(contact.phone, personalizedText, senderAcc);
    }
    log.status = 'success';
  } catch (error: any) {
    log.status = 'failed';
    log.errorDetails = error?.message || 'Gagal mengirim pesan';
    console.error(`Gagal mengirim ke ${contact.phone}:`, error?.message);
  }

  Storage.addLog(log);
  return log;
}

// Run single scheduled job
export async function executeSchedule(schedule: BroadcastSchedule): Promise<void> {
  console.log(`[SCHEDULER] Menjalankan jadwal: ${schedule.title} (${schedule.id})`);

  let scheduleContext: any = undefined;

  // Handle Send Mode: Schedule Text
  if (schedule.sendMode === 'schedule_text' && schedule.extractedSchedule?.rows) {
    const scope = schedule.scheduleScope || 'today';
    const offset = scope === 'tomorrow' ? 1 : 0;
    const targetDate = getWibDate(offset);

    const rows = schedule.extractedSchedule.rows;
    let matchedRows: ScheduleRow[] = [];

    if (scope === 'week') {
      const next7Days = Array.from({ length: 7 }, (_, i) => getWibDate(i));
      matchedRows = rows.filter((r) => next7Days.some((d) => matchesScheduleRow(r, d)));
    } else {
      matchedRows = rows.filter((r) => matchesScheduleRow(r, targetDate));
    }

    if (matchedRows.length === 0) {
      if (schedule.noRowAction === 'fallback_text' && schedule.fallbackText) {
        console.log(`[SCHEDULER] Tidak ada baris kegiatan hari ini. Mengirim pesan cadangan...`);
        scheduleContext = {
          jadwalFormatted: schedule.fallbackText,
          kegiatanText: 'Pesan Cadangan',
        };
      } else {
        console.log(`[SCHEDULER] Lewati pengiriman untuk ${schedule.title}: Tidak ada kegiatan pada tanggal ${formatIndonesianDate(targetDate)}.`);
        Storage.updateSchedule(schedule.id, { lastRun: new Date().toISOString() });
        return;
      }
    } else {
      const jadwalList = matchedRows
        .map(
          (r) =>
            `▸ ${r.waktu ? r.waktu + '  ' : ''}${r.kegiatan || 'Kegiatan'}${
              r.petugas ? ' — ' + r.petugas : ''
            }${r.lokasi ? ' (' + r.lokasi + ')' : ''}`
        )
        .join('\n');

      scheduleContext = {
        tanggalFormatted: formatIndonesianDate(targetDate),
        waktuFormatted: matchedRows[0]?.waktu || '',
        kegiatanText: matchedRows.map((r) => r.kegiatan).filter(Boolean).join(', '),
        jadwalFormatted: jadwalList,
        petugasText: matchedRows.map((r) => r.petugas).filter(Boolean).join(', '),
        lokasiText: matchedRows.map((r) => r.lokasi).filter(Boolean).join(', '),
        keteranganText: matchedRows.map((r) => r.keterangan).filter(Boolean).join(', '),
      };
    }
  }

  // Determine recipients
  const allContacts = Storage.getContacts();
  let targetContacts: { name: string; phone: string; group?: string }[] = [];

  if (schedule.recipients.type === 'all') {
    targetContacts = allContacts;
  } else if (schedule.recipients.type === 'group' && schedule.recipients.targetGroup) {
    targetContacts = allContacts.filter((c) => c.group === schedule.recipients.targetGroup);
  } else if (schedule.recipients.type === 'custom' && schedule.recipients.customPhones) {
    targetContacts = schedule.recipients.customPhones.map((phone) => {
      const match = allContacts.find((c) => c.phone.includes(phone) || phone.includes(c.phone));
      return {
        name: match ? match.name : 'Penerima',
        phone,
        group: match?.group,
      };
    });
  } else if (schedule.recipients.type === 'wa_group' && schedule.recipients.targetWaGroups) {
    targetContacts = schedule.recipients.targetWaGroups.map((g) => ({
      name: g.name,
      phone: g.id,
      group: 'Grup WA',
    }));
  } else if (schedule.recipients.type === 'contacts') {
    if (schedule.recipients.selectedContacts && schedule.recipients.selectedContacts.length > 0) {
      targetContacts = schedule.recipients.selectedContacts;
    } else if (schedule.recipients.customPhones && schedule.recipients.customPhones.length > 0) {
      targetContacts = schedule.recipients.customPhones.map((phone) => {
        const match = allContacts.find((c) => c.phone.includes(phone) || phone.includes(c.phone));
        return {
          name: match ? match.name : 'Penerima',
          phone,
          group: match?.group,
        };
      });
    }
  }

  if (targetContacts.length === 0) {
    console.log(`[SCHEDULER] Tidak ada kontak penerima untuk jadwal ${schedule.title}`);
    if (schedule.scheduleType === 'once') {
      Storage.updateSchedule(schedule.id, {
        status: 'completed',
        lastRun: new Date().toISOString(),
      });
    }
    return;
  }

  // Iterate contacts with anti-ban delay
  for (let i = 0; i < targetContacts.length; i++) {
    const contact = targetContacts[i];
    await sendBroadcastToRecipient(schedule, contact, scheduleContext);

    // Apply delay if there are more contacts
    if (i < targetContacts.length - 1) {
      const delayMs = getRandomDelay(schedule.antiBanDelayMin || 3, schedule.antiBanDelayMax || 7);
      console.log(`[ANTI-BAN] Jeda ${delayMs / 1000} detik sebelum kontak berikutnya...`);
      await sleep(delayMs);
    }
  }

  // Check if all schedule file dates have passed
  let isExpired = false;
  if (schedule.sendMode === 'schedule_text' && schedule.extractedSchedule?.rows) {
    const todayWib = getWibDate(0);
    const rows = schedule.extractedSchedule.rows;
    const futureRows = rows.filter((r) => {
      const parsed = parseDateString(r.tanggal || r.hari);
      return parsed ? parsed >= todayWib : true;
    });
    if (rows.length > 0 && futureRows.length === 0) {
      isExpired = true;
      console.log(`[SCHEDULER] Semua tanggal pada file jadwal sudah lewat: ${schedule.title}`);
    }
  }

  // Update schedule status
  const nowIso = new Date().toISOString();
  if (schedule.scheduleType === 'once' || isExpired) {
    Storage.updateSchedule(schedule.id, {
      status: 'completed',
      isExpired: isExpired || schedule.isExpired,
      lastRun: nowIso,
    });
  } else {
    Storage.updateSchedule(schedule.id, {
      lastRun: nowIso,
    });
  }
}

// Check pending schedules
export async function checkAndRunPendingSchedules(): Promise<void> {
  if (globalForScheduler.isProcessingSchedule) return;

  const waStatus = await getWhatsAppStatus();
  if (waStatus.status !== 'connected' && waStatus.connectedCount === 0) {
    return; // Cannot broadcast if WA is disconnected
  }

  globalForScheduler.isProcessingSchedule = true;

  try {
    const schedules = Storage.getSchedules().filter((s) => s.status === 'active');
    const now = getWibDate();

    for (const sch of schedules) {
      let shouldRun = false;

      if (sch.scheduleType === 'once') {
        const schedTime = new Date(sch.scheduledTime);
        if (now >= schedTime && !sch.lastRun) {
          shouldRun = true;
        }
      } else if (sch.scheduleType === 'daily' && sch.recurringTime) {
        const [targetHour, targetMin] = sch.recurringTime.split(':').map(Number);
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        if (currentHour === targetHour && currentMin === targetMin) {
          if (!sch.lastRun) {
            shouldRun = true;
          } else {
            const lastRunDate = new Date(sch.lastRun);
            const isToday = isSameDay(lastRunDate, now);
            if (!isToday) {
              shouldRun = true;
            }
          }
        }
      } else if (sch.scheduleType === 'weekly' && sch.recurringTime && sch.recurringDay !== undefined) {
        const currentDay = now.getDay();
        const [targetHour, targetMin] = sch.recurringTime.split(':').map(Number);

        if (currentDay === sch.recurringDay && now.getHours() === targetHour && now.getMinutes() === targetMin) {
          if (!sch.lastRun) {
            shouldRun = true;
          } else {
            const lastRunDate = new Date(sch.lastRun);
            const isToday = isSameDay(lastRunDate, now);
            if (!isToday) {
              shouldRun = true;
            }
          }
        }
      }

      if (shouldRun) {
        await executeSchedule(sch);
      }
    }
  } catch (error) {
    console.error('[SCHEDULER] Error processing schedules:', error);
  } finally {
    globalForScheduler.isProcessingSchedule = false;
  }
}

// Start Background Worker (runs every 15 seconds)
export function startSchedulerDaemon(): void {
  if (globalForScheduler.schedulerTimer) {
    return;
  }

  console.log('[SCHEDULER] Memulai background scheduler daemon...');
  checkAndRunPendingSchedules();

  globalForScheduler.schedulerTimer = setInterval(() => {
    checkAndRunPendingSchedules();
  }, 15000);
}
