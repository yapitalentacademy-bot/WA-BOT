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

export interface BroadcastSchedule {
  id: string;
  title: string;
  message: string;
  templateId?: string;
  attachedFile?: AttachedFile | null;
  recipients: {
    type: 'all' | 'group' | 'custom' | 'wa_group' | 'contacts';
    targetGroup?: string;
    customPhones?: string[]; // array of phone numbers
    targetWaGroups?: { id: string; name: string }[]; // array of WhatsApp Groups
    selectedContacts?: { name: string; phone: string }[]; // array of selected contacts
    senderAccountId?: string; // 'rotation' | 'acc_1' | 'acc_2' | etc.
  };
  scheduleType: ScheduleRepeatType;
  scheduledTime: string; // ISO string e.g. 2026-09-24T08:00
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
