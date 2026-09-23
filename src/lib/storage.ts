import fs from 'fs';
import path from 'path';
import { Contact, MessageTemplate, BroadcastSchedule, BroadcastLog, AttachedFile } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// Ensure data and upload directories exist
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function getFilePath(filename: string): string {
  ensureDirs();
  return path.join(DATA_DIR, filename);
}

function readJsonFile<T>(filename: string, defaultValue: T): T {
  try {
    const filePath = getFilePath(filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return defaultValue;
  }
}

function writeJsonFile<T>(filename: string, data: T): void {
  try {
    const filePath = getFilePath(filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
  }
}

export const Storage = {
  // CONTACTS
  getContacts(): Contact[] {
    return readJsonFile<Contact[]>('contacts.json', []);
  },
  saveContacts(contacts: Contact[]): void {
    writeJsonFile('contacts.json', contacts);
  },
  addContact(contact: Contact): void {
    const contacts = this.getContacts();
    contacts.unshift(contact);
    this.saveContacts(contacts);
  },
  deleteContact(id: string): void {
    const contacts = this.getContacts().filter((c) => c.id !== id);
    this.saveContacts(contacts);
  },

  // TEMPLATES
  getTemplates(): MessageTemplate[] {
    return readJsonFile<MessageTemplate[]>('templates.json', [
      {
        id: 't-1',
        title: 'Pengumuman Jadwal Kegiatan / Acara',
        content: `Halo {nama},\n\nBerikut kami sampaikan jadwal kegiatan terbaru untuk Anda:\n📅 *Jadwal*: {jadwal}\n⏰ *Waktu*: {waktu}\n📍 *Keterangan*: {kegiatan}\n\nFile dokumen jadwal terlampir pada pesan ini. Silakan dicek dan disimpan.\n\nTerima kasih! 🙏`,
        category: 'Jadwal',
        createdAt: new Date().toISOString(),
      },
      {
        id: 't-2',
        title: 'Pengingat (Reminder) Jadwal Rapat / Kuliah',
        content: `Halo {nama}, mengingatkan kembali bahwa jadwal rapat/kegiatan Anda akan dimulai pada {waktu}.\n\nMohon hadir tepat waktu. Terima kasih!`,
        category: 'Reminder',
        createdAt: new Date().toISOString(),
      },
      {
        id: 't-3',
        title: 'Share Flyer & Dokumen Panduan',
        content: `Halo {nama}!\n\nBerikut kami bagikan flyer jadwal beserta panduan kegiatan resmi untuk Anda. Dokumen selengkapnya bisa langsung Anda buka pada lampiran file di bawah.\n\nSalam sukses! ✨`,
        category: 'Dokumen',
        createdAt: new Date().toISOString(),
      },
    ]);
  },
  saveTemplates(templates: MessageTemplate[]): void {
    writeJsonFile('templates.json', templates);
  },
  addTemplate(tpl: MessageTemplate): void {
    const templates = this.getTemplates();
    templates.unshift(tpl);
    this.saveTemplates(templates);
  },
  deleteTemplate(id: string): void {
    const templates = this.getTemplates().filter((t) => t.id !== id);
    this.saveTemplates(templates);
  },

  // SCHEDULES
  getSchedules(): BroadcastSchedule[] {
    return readJsonFile<BroadcastSchedule[]>('schedules.json', []);
  },
  saveSchedules(schedules: BroadcastSchedule[]): void {
    writeJsonFile('schedules.json', schedules);
  },
  addSchedule(sch: BroadcastSchedule): void {
    const schedules = this.getSchedules();
    schedules.unshift(sch);
    this.saveSchedules(schedules);
  },
  updateSchedule(id: string, updates: Partial<BroadcastSchedule>): void {
    const schedules = this.getSchedules().map((s) => (s.id === id ? { ...s, ...updates } : s));
    this.saveSchedules(schedules);
  },
  deleteSchedule(id: string): void {
    const schedules = this.getSchedules().filter((s) => s.id !== id);
    this.saveSchedules(schedules);
  },

  // FILES (UPLOADED SCHEDULE FILES)
  getFiles(): AttachedFile[] {
    return readJsonFile<AttachedFile[]>('files.json', []);
  },
  saveFiles(files: AttachedFile[]): void {
    writeJsonFile('files.json', files);
  },
  addFile(file: AttachedFile): void {
    const files = this.getFiles();
    files.unshift(file);
    this.saveFiles(files);
  },
  deleteFile(id: string): void {
    const files = this.getFiles();
    const target = files.find((f) => f.id === id);
    if (target && fs.existsSync(target.localPath)) {
      try {
        fs.unlinkSync(target.localPath);
      } catch (err) {
        console.error('Failed to delete physical file:', err);
      }
    }
    this.saveFiles(files.filter((f) => f.id !== id));
  },

  // LOGS
  getLogs(): BroadcastLog[] {
    return readJsonFile<BroadcastLog[]>('logs.json', []);
  },
  saveLogs(logs: BroadcastLog[]): void {
    writeJsonFile('logs.json', logs);
  },
  addLog(log: BroadcastLog): void {
    const logs = this.getLogs();
    logs.unshift(log);
    // Keep last 1000 logs
    if (logs.length > 1000) {
      logs.splice(1000);
    }
    this.saveLogs(logs);
  },
  clearLogs(): void {
    this.saveLogs([]);
  },
};

export { UPLOAD_DIR, DATA_DIR };
