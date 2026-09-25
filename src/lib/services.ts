import { Storage } from './storage';
import {
  getWhatsAppGroups,
  getWhatsAppContacts,
  resyncWhatsAppContacts,
} from './whatsapp';
import {
  getWibDate,
  formatIndonesianDate,
  matchesScheduleRow,
  personalizeMessage,
  isSameDay,
} from './scheduler';
import {
  BroadcastSchedule,
  MessageTemplate,
  AttachedFile,
  BroadcastLog,
  Contact,
  ExtractedScheduleData,
} from '@/types';

/**
 * Unified Shared Service Layer
 * Digunakan oleh Web API Dashboard maupun WhatsApp Bot Handler
 */

export const SchedulesService = {
  getAll(): BroadcastSchedule[] {
    return Storage.getSchedules();
  },

  getById(id: string): BroadcastSchedule | undefined {
    return Storage.getSchedules().find((s) => s.id === id);
  },

  create(schedule: BroadcastSchedule): BroadcastSchedule {
    Storage.addSchedule(schedule);
    return schedule;
  },

  update(id: string, updates: Partial<BroadcastSchedule>): BroadcastSchedule | undefined {
    Storage.updateSchedule(id, updates);
    return this.getById(id);
  },

  delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;
    Storage.deleteSchedule(id);
    return true;
  },

  setStatus(id: string, status: 'active' | 'paused' | 'completed'): BroadcastSchedule | undefined {
    return this.update(id, { status });
  },

  getUpcoming(limit = 5): { schedule: BroadcastSchedule; nextRunStr: string }[] {
    const schedules = this.getAll().filter((s) => s.status === 'active');
    const now = getWibDate();

    const mapped = schedules.map((s) => {
      let nextRunStr = '-';
      if (s.scheduleType === 'once') {
        nextRunStr = `${s.scheduledDate || ''} ${s.scheduledTime || ''} WIB`;
      } else if (s.scheduleType === 'daily') {
        nextRunStr = `Setiap Hari ${s.recurringTime || ''} WIB`;
      } else if (s.scheduleType === 'weekly') {
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const dayName = days[s.recurringDay ?? 1];
        nextRunStr = `Setiap ${dayName} ${s.recurringTime || ''} WIB`;
      }
      return { schedule: s, nextRunStr };
    });

    return mapped.slice(0, limit);
  },

  getTodayAndTomorrowPreview(offsetDays: 0 | 1): { scheduleTitle: string; messages: string[] }[] {
    const targetDate = getWibDate(offsetDays);
    const schedules = this.getAll().filter((s) => s.status === 'active');
    const results: { scheduleTitle: string; messages: string[] }[] = [];

    for (const sch of schedules) {
      // Periksa apakah jadwal berjalan pada hari ini/besok
      let matchesDate = false;
      if (sch.scheduleType === 'once' && sch.scheduledDate) {
        const parts = sch.scheduledDate.split('-').map(Number);
        if (parts.length === 3) {
          const schDate = new Date(parts[0], parts[1] - 1, parts[2]);
          matchesDate = isSameDay(schDate, targetDate);
        }
      } else if (sch.scheduleType === 'daily') {
        matchesDate = true;
      } else if (sch.scheduleType === 'weekly' && sch.recurringDay !== undefined) {
        matchesDate = targetDate.getDay() === sch.recurringDay;
      }

      if (!matchesDate) continue;

      const msgs: string[] = [];
      if (sch.sendMode === 'schedule_text' && sch.extractedSchedule?.rows?.length) {
        const matchedRows = sch.extractedSchedule.rows.filter((r) =>
          matchesScheduleRow(r, targetDate)
        );
        if (matchedRows.length > 0) {
          const sampleRow = matchedRows[0];
          const text = personalizeMessage(
            sch.message,
            { name: 'Grup WA / Kontak', phone: '08xxxx' },
            sch.title,
            {
              jadwalFormatted: sampleRow.kegiatan || sampleRow.tanggal || sch.title,
              kegiatanText: sampleRow.kegiatan || '-',
              waktuFormatted: sampleRow.waktu || sch.scheduledTime || sch.recurringTime || '-',
              tanggalFormatted: formatIndonesianDate(targetDate),
              petugasText: sampleRow.petugas || '-',
            }
          );
          msgs.push(text);
        } else if (sch.noRowAction === 'fallback_text' && sch.fallbackText) {
          msgs.push(sch.fallbackText);
        }
      } else {
        const text = personalizeMessage(
          sch.message,
          { name: 'Grup WA / Kontak', phone: '08xxxx' },
          sch.title,
          { tanggalFormatted: formatIndonesianDate(targetDate) }
        );
        msgs.push(text);
      }

      if (msgs.length > 0) {
        results.push({ scheduleTitle: sch.title, messages: msgs });
      }
    }

    return results;
  },
};

export const TemplatesService = {
  getAll(): MessageTemplate[] {
    return Storage.getTemplates();
  },

  getById(id: string): MessageTemplate | undefined {
    return Storage.getTemplates().find((t) => t.id === id);
  },

  create(title: string, content: string, category = 'Umum'): MessageTemplate {
    const tpl: MessageTemplate = {
      id: `t-${Date.now()}`,
      title,
      content,
      category,
      createdAt: new Date().toISOString(),
    };
    Storage.addTemplate(tpl);
    return tpl;
  },

  delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;
    Storage.deleteTemplate(id);
    return true;
  },
};

export const ContactsService = {
  async searchGroups(keyword: string, accountId?: string) {
    const allGroups = await getWhatsAppGroups(accountId);
    if (!keyword.trim()) return allGroups;

    const queryLower = keyword.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    return allGroups.filter((g) => {
      const gName = g.name.toLowerCase();
      const gId = g.id.toLowerCase();
      return queryWords.every((word) => gName.includes(word) || gId.includes(word));
    });
  },

  async searchContacts(keyword: string, accountId?: string) {
    const allContacts = await getWhatsAppContacts(accountId);
    if (!keyword.trim()) return allContacts;

    const queryLower = keyword.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    return allContacts.filter((c) => {
      const cName = c.name.toLowerCase();
      const cPhone = c.phone.toLowerCase();
      return queryWords.every((word) => cName.includes(word) || cPhone.includes(word));
    });
  },

  async resync(accountId?: string) {
    return await resyncWhatsAppContacts(accountId);
  },
};

export const FilesService = {
  getAll(): AttachedFile[] {
    return Storage.getFiles();
  },

  getById(id: string): AttachedFile | undefined {
    return Storage.getFiles().find((f) => f.id === id);
  },

  delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;
    Storage.deleteFile(id);
    return true;
  },
};

export const LogsService = {
  getLatest(limit = 10): BroadcastLog[] {
    return Storage.getLogs().slice(0, limit);
  },
};
