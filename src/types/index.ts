export type WhatsAppStatus = 'disconnected' | 'connecting' | 'waiting_qr' | 'connected';

export interface WhatsAppUserInfo {
  id?: string;
  name?: string;
  phone?: string;
}

export interface WhatsAppAccountInfo {
  id: string; // 'acc_1', 'acc_2', 'acc_3', 'acc_4', 'acc_5'
  label: string; // 'Akun 1 (Utama)', 'Akun 2', etc.
  status: WhatsAppStatus;
  qrCodeDataUrl: string | null;
  userInfo: WhatsAppUserInfo | null;
}

export interface AttachedFile {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  url: string; // e.g. /uploads/filename.pdf
  localPath: string; // server local path
  uploadedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string; // format E.164: 628xxx
  group?: string; // e.g. "Siswa", "Peserta Webinar", "Tim"
  notes?: string;
  createdAt: string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  content: string; // e.g. "Halo {nama}, jadwal {kegiatan} Anda adalah {jadwal}..."
  attachedFileId?: string;
  attachedFileName?: string;
  category?: string;
  createdAt: string;
}

export interface WhatsAppGroupItem {
  id: string;
  name: string;
  participantsCount: number;
}

export type ScheduleRepeatType = 'once' | 'daily' | 'weekly';
export type ScheduleSendMode = 'attachment' | 'schedule_text';
export type ScheduleScope = 'today' | 'tomorrow' | 'week';
export type NoRowAction = 'skip' | 'fallback_text';

export interface ScheduleRow {
  id: string;
  tanggal?: string; // e.g. "2026-09-26" or "26/09/2026" or "26 September 2026"
  hari?: string; // e.g. "Sabtu" or "Saturday"
  waktu?: string; // e.g. "08:00" or "08:00 - 10:00"
  kegiatan?: string; // e.g. "Rapat Pleno"
  petugas?: string; // e.g. "Ustadz Ahmad"
  lokasi?: string; // e.g. "Aula Utama"
  keterangan?: string; // e.g. "Membawa laptop"
  rawData?: Record<string, string>;
}

export interface ColumnMapping {
  tanggalKey?: string;
  waktuKey?: string;
  kegiatanKey?: string;
  petugasKey?: string;
  lokasiKey?: string;
  keteranganKey?: string;
}

export interface ExtractedScheduleData {
  rows: ScheduleRow[];
  columns: string[];
  columnMapping: ColumnMapping;
  detectedDateRange?: string; // e.g. "1 Sep 2026 - 30 Sep 2026"
}

export interface BroadcastSchedule {
  id: string;
  title: string;
  message: string;
  templateId?: string;
  attachedFile?: AttachedFile | null;
  sendMode?: ScheduleSendMode; // 'attachment' (legacy) or 'schedule_text' (new)
  extractedSchedule?: ExtractedScheduleData | null;
  scheduleScope?: ScheduleScope; // 'today' | 'tomorrow' | 'week'
  noRowAction?: NoRowAction; // 'skip' | 'fallback_text'
  fallbackText?: string;
  isExpired?: boolean; // Set to true if all dates in file have passed
  recipients: {
    type: 'all' | 'group' | 'custom' | 'wa_group' | 'contacts';
    sendToAllWaGroups?: boolean;
    sendToAllContacts?: boolean;
    targetGroup?: string;
    customPhones?: string[]; // array of phone numbers
    targetWaGroups?: { id: string; name: string }[]; // array of WhatsApp Groups
    selectedContacts?: { name: string; phone: string }[]; // array of selected contacts
    senderAccountId?: string; // 'rotation' | 'acc_1' | 'acc_2' | etc.
  };
  scheduleType: ScheduleRepeatType;
  scheduledDate?: string; // e.g. "2026-09-26"
  scheduledTime: string; // e.g. "08:00" or ISO string
  recurringTime?: string; // e.g. "08:00" for daily/weekly
  recurringDay?: number; // 0-6 for weekly (0 = Sunday, 1 = Monday, etc.)
  status: 'active' | 'completed' | 'paused';
  antiBanDelayMin: number; // in seconds (e.g. 3)
  antiBanDelayMax: number; // in seconds (e.g. 7)
  lastRun?: string;
  createdAt: string;
}

export interface BroadcastLog {
  id: string;
  scheduleId?: string;
  scheduleTitle?: string;
  recipientPhone: string;
  recipientName?: string;
  messageText: string;
  hasAttachment: boolean;
  attachmentName?: string;
  status: 'success' | 'failed' | 'queued';
  errorDetails?: string;
  sentAt: string;
}
