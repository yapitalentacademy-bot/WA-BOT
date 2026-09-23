import { Storage } from './storage';
import { sendWhatsAppText, sendWhatsAppFile, getWhatsAppStatus } from './whatsapp';
import { BroadcastSchedule, Contact, BroadcastLog } from '@/types';

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

// Replace template variables
export function personalizeMessage(
  template: string,
  contact: { name: string; phone: string; group?: string },
  scheduleTitle?: string
): string {
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeFormatted = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return template
    .replace(/\{nama\}/gi, contact.name || 'Sahabat')
    .replace(/\{name\}/gi, contact.name || 'Sahabat')
    .replace(/\{nomor\}/gi, contact.phone)
    .replace(/\{phone\}/gi, contact.phone)
    .replace(/\{grup\}/gi, contact.group || 'Umum')
    .replace(/\{group\}/gi, contact.group || 'Umum')
    .replace(/\{jadwal\}/gi, scheduleTitle || 'Jadwal')
    .replace(/\{kegiatan\}/gi, scheduleTitle || 'Kegiatan')
    .replace(/\{tanggal\}/gi, dateFormatted)
    .replace(/\{waktu\}/gi, timeFormatted)
    .replace(/\{jam\}/gi, timeFormatted);
}

// Process single broadcast recipient
export async function sendBroadcastToRecipient(
  schedule: BroadcastSchedule,
  contact: { name: string; phone: string; group?: string }
): Promise<BroadcastLog> {
  const personalizedText = personalizeMessage(schedule.message, contact, schedule.title);
  const log: BroadcastLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    scheduleId: schedule.id,
    scheduleTitle: schedule.title,
    recipientPhone: contact.phone,
    recipientName: contact.name,
    messageText: personalizedText,
    hasAttachment: Boolean(schedule.attachedFile),
    attachmentName: schedule.attachedFile?.originalName,
    status: 'queued',
    sentAt: new Date().toISOString(),
  };

  try {
    if (schedule.attachedFile) {
      await sendWhatsAppFile(
        contact.phone,
        schedule.attachedFile.localPath,
        schedule.attachedFile.originalName,
        schedule.attachedFile.mimeType,
        personalizedText
      );
    } else {
      await sendWhatsAppText(contact.phone, personalizedText);
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
    await sendBroadcastToRecipient(schedule, contact);

    // Apply delay if there are more contacts
    if (i < targetContacts.length - 1) {
      const delayMs = getRandomDelay(schedule.antiBanDelayMin || 3, schedule.antiBanDelayMax || 7);
      console.log(`[ANTI-BAN] Jeda ${delayMs / 1000} detik sebelum kontak berikutnya...`);
      await sleep(delayMs);
    }
  }

  // Update schedule status
  const nowIso = new Date().toISOString();
  if (schedule.scheduleType === 'once') {
    Storage.updateSchedule(schedule.id, {
      status: 'completed',
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
  if (waStatus.status !== 'connected') {
    return; // Cannot broadcast if WA is disconnected
  }

  globalForScheduler.isProcessingSchedule = true;

  try {
    const schedules = Storage.getSchedules().filter((s) => s.status === 'active');
    const now = new Date();

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

        // Check if hour and minute match
        if (currentHour === targetHour && currentMin === targetMin) {
          // Check if already ran today
          if (!sch.lastRun) {
            shouldRun = true;
          } else {
            const lastRunDate = new Date(sch.lastRun);
            const isToday =
              lastRunDate.getDate() === now.getDate() &&
              lastRunDate.getMonth() === now.getMonth() &&
              lastRunDate.getFullYear() === now.getFullYear();
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
            const isToday =
              lastRunDate.getDate() === now.getDate() &&
              lastRunDate.getMonth() === now.getMonth() &&
              lastRunDate.getFullYear() === now.getFullYear();
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
  // Initial check
  checkAndRunPendingSchedules();

  // Recurring check every 15 seconds
  globalForScheduler.schedulerTimer = setInterval(() => {
    checkAndRunPendingSchedules();
  }, 15000);
}
