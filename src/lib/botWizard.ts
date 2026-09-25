import { BroadcastSchedule, AttachedFile } from '@/types';
import { Storage } from './storage';
import { SchedulesService, TemplatesService, ContactsService } from './services';
import { getWibDate, formatIndonesianDate } from './scheduler';

export interface WizardState {
  accountId: string;
  userJid: string;
  type: 'jadwal_baru' | 'kirim_cepat' | 'jadwal_ubah';
  step: number; // 1 s.d. 9
  scheduleIdToEdit?: string;
  data: {
    title?: string;
    contentSource?: 'manual' | 'template' | 'file';
    message?: string;
    attachedFile?: AttachedFile | null;
    sendMode?: 'schedule_text' | 'attachment';
    extractedSchedule?: any;
    scheduleScope?: 'today' | 'tomorrow' | 'week';
    noRowAction?: 'skip' | 'fallback_text';
    fallbackText?: string;
    scheduleType?: 'once' | 'daily' | 'weekly';
    scheduledDate?: string;
    scheduledTime?: string;
    recurringTime?: string;
    recurringDay?: number;
    recipientType?: 'wa_group' | 'contacts' | 'all';
    sendToAllWaGroups?: boolean;
    sendToAllContacts?: boolean;
    selectedGroups?: { id: string; name: string }[];
    selectedContacts?: { name: string; phone: string }[];
    searchKeyword?: string;
    searchResults?: any[];
    senderAccountId?: string;
    pendingConfirmation?: boolean;
  };
  lastActiveAt: number;
}

// Memory store wizard sessions per account
const activeWizards = new Map<string, WizardState>();
const WIZARD_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit

export const BotWizard = {
  getSession(accountId: string): WizardState | undefined {
    const session = activeWizards.get(accountId);
    if (!session) return undefined;

    // Cek timeout 10 menit
    if (Date.now() - session.lastActiveAt > WIZARD_TIMEOUT_MS) {
      activeWizards.delete(accountId);
      return undefined;
    }
    return session;
  },

  startSession(
    accountId: string,
    userJid: string,
    type: 'jadwal_baru' | 'kirim_cepat' | 'jadwal_ubah',
    scheduleIdToEdit?: string
  ): WizardState {
    const session: WizardState = {
      accountId,
      userJid,
      type,
      step: 1,
      scheduleIdToEdit,
      data: {
        sendMode: 'schedule_text',
        scheduleScope: 'today',
        noRowAction: 'skip',
        scheduleType: 'daily',
        recurringTime: '08:00',
        recipientType: 'wa_group',
        sendToAllWaGroups: true,
        sendToAllContacts: true,
        senderAccountId: 'rotation',
      },
      lastActiveAt: Date.now(),
    };
    activeWizards.set(accountId, session);
    return session;
  },

  clearSession(accountId: string): void {
    activeWizards.delete(accountId);
  },

  updateSession(accountId: string, updates: Partial<WizardState>): WizardState | undefined {
    const session = this.getSession(accountId);
    if (!session) return undefined;

    const updated = {
      ...session,
      ...updates,
      data: { ...session.data, ...updates.data },
      lastActiveAt: Date.now(),
    };
    activeWizards.set(accountId, updated);
    return updated;
  },

  // Process incoming text in wizard
  async handleInput(
    accountId: string,
    userJid: string,
    text: string,
    attachedFileFromMsg?: AttachedFile
  ): Promise<{ replyText: string; isFinished?: boolean }> {
    const session = this.getSession(accountId);
    if (!session) {
      return { replyText: '⚠️ Tidak ada sesi wizard aktif. Ketik */jadwal baru* untuk membuat jadwal.' };
    }

    const trimmed = text.trim();
    if (trimmed.toLowerCase() === '/batal' || trimmed.toLowerCase() === 'batal') {
      this.clearSession(accountId);
      return { replyText: '⚡ *Share Otomatis*\n❌ Sesi wizard berhasil dibatalkan.' };
    }

    session.lastActiveAt = Date.now();

    // WIZARD CREATION FLOW (/jadwal baru)
    if (session.type === 'jadwal_baru' || session.type === 'kirim_cepat') {
      return await this.processNewScheduleStep(session, trimmed, attachedFileFromMsg);
    }

    return { replyText: '⚠️ Tipe wizard tidak dikenal.' };
  },

  async processNewScheduleStep(
    session: WizardState,
    input: string,
    attachedFileFromMsg?: AttachedFile
  ): Promise<{ replyText: string; isFinished?: boolean }> {
    const d = session.data;

    // STEP 1: Judul Jadwal
    if (session.step === 1) {
      if (!input) {
        return { replyText: '⚡ *Share Otomatis — Buat Jadwal Baru*\n\nSilakan ketik *Judul Jadwal* Anda:\n_(Contoh: Jadwal Kajian Harian, Flyer Event Mingguan)_' };
      }
      d.title = input;
      session.step = 2;
      return {
        replyText: `⚡ *Share Otomatis — Buat Jadwal Baru*\nJudul: *${d.title}*\n\nPilih *Sumber Isi Pesan*:\n1️⃣ Ketik Pesan Manual\n2️⃣ Gunakan Template Tersimpan\n3️⃣ Ekstrak File Jadwal (Excel / CSV / PDF / Doc)\n\n_Balas dengan angka 1, 2, atau 3_`,
      };
    }

    // STEP 2: Sumber Isi
    if (session.step === 2) {
      if (input === '1') {
        d.contentSource = 'manual';
        session.step = 3;
        return { replyText: '⚡ *Share Otomatis*\nSilakan ketik *Isi Pesan Broadcast* yang ingin dikirim:\n\n_Tips: Gunakan variabel {nama}, {jadwal}, {waktu}, {tanggal}, {kegiatan}_' };
      } else if (input === '2') {
        d.contentSource = 'template';
        const templates = TemplatesService.getAll();
        if (templates.length === 0) {
          return { replyText: '⚠️ Belum ada template tersimpan. Silakan ketik isi pesan manual di bawah ini:' };
        }
        let listText = '⚡ *Share Otomatis — Pilih Template*\n';
        templates.forEach((t, i) => {
          listText += `${i + 1}️⃣ *${t.title}* (${t.category})\n`;
        });
        listText += '\n_Balas dengan nomor template yang dipilih:_';
        session.step = 2.5; // Sub-step template selection
        return { replyText: listText };
      } else if (input === '3' || attachedFileFromMsg) {
        d.contentSource = 'file';
        if (attachedFileFromMsg) {
          d.attachedFile = attachedFileFromMsg;
          session.step = 4; // Lanjut ke mode pengiriman
          return {
            replyText: `⚡ *Share Otomatis*\n📄 File diterima: *${attachedFileFromMsg.originalName}*\n\nPilih *Mode Pengiriman File*:\n1️⃣ *Pesan Teks Otomatis* (Mengikuti tanggal dari isi file)\n2️⃣ *Kirim File Lampiran* (Kirim file sebagai PDF/Gambar)\n\n_Balas dengan 1 atau 2_`,
          };
        }
        session.step = 2.8; // Menunggu user kirim file
        return { replyText: '⚡ *Share Otomatis*\nSilakan *kirim file jadwal* (Excel, CSV, PDF, Doc, Gambar) ke chat ini sekarang 📎' };
      }
      return { replyText: '⚠️ Pilihan tidak valid. Balas dengan angka *1* (Manual), *2* (Template), atau *3* (File Jadwal).' };
    }

    // STEP 2.5: Pilih Template
    if (session.step === 2.5) {
      const idx = parseInt(input, 10) - 1;
      const templates = TemplatesService.getAll();
      if (isNaN(idx) || idx < 0 || idx >= templates.length) {
        return { replyText: `⚠️ Nomor tidak valid. Pilih angka 1 s.d. ${templates.length}:` };
      }
      d.message = templates[idx].content;
      session.step = 5; // Langsung ke Frekuensi
      return {
        replyText: `⚡ *Share Otomatis*\nTemplate terpilih: *${templates[idx].title}*\n\nPilih *Frekuensi Pengiriman*:\n1️⃣ Sekali Kirim\n2️⃣ Harian (Rutin Setiap Hari)\n3️⃣ Mingguan (Rutin Setiap Pekan)\n\n_Balas dengan 1, 2, atau 3_`,
      };
    }

    // STEP 2.8: Menunggu Upload File
    if (session.step === 2.8) {
      if (attachedFileFromMsg) {
        d.attachedFile = attachedFileFromMsg;
        session.step = 4;
        return {
          replyText: `⚡ *Share Otomatis*\n📄 File diterima: *${attachedFileFromMsg.originalName}*\n\nPilih *Mode Pengiriman File*:\n1️⃣ *Pesan Teks Otomatis* (Mengikuti tanggal dari isi file)\n2️⃣ *Kirim File Lampiran* (Kirim file sebagai PDF/Gambar)\n\n_Balas dengan 1 atau 2_`,
        };
      }
      return { replyText: '📌 Mohon kirimkan file jadwal (Excel / CSV / PDF / Doc / Gambar) ke chat ini.' };
    }

    // STEP 3: Input Pesan Manual
    if (session.step === 3) {
      if (!input) return { replyText: 'Mohon ketik isi pesan:' };
      d.message = input;
      session.step = 5;
      return {
        replyText: '⚡ *Share Otomatis*\nPesan tersimpan!\n\nPilih *Frekuensi Pengiriman*:\n1️⃣ Sekali Kirim\n2️⃣ Harian (Rutin Setiap Hari)\n3️⃣ Mingguan (Rutin Setiap Pekan)\n\n_Balas dengan 1, 2, atau 3_',
      };
    }

    // STEP 4: Mode Pengiriman File (schedule_text vs attachment)
    if (session.step === 4) {
      if (input === '1') {
        d.sendMode = 'schedule_text';
        d.message = d.message || `Halo {nama},\n\nBerikut jadwal kegiatan Anda:\n📅 *Jadwal*: {jadwal}\n⏰ *Waktu*: {waktu}\n📍 *Kegiatan*: {kegiatan}\n\nTerima kasih! 🙏`;
      } else if (input === '2') {
        d.sendMode = 'attachment';
        d.message = d.message || `Halo {nama}, berikut terlampir file dokumen jadwal kegiatan Anda. Silakan dicek dan disimpan. Terima kasih!`;
      } else {
        return { replyText: '⚠️ Balas dengan *1* (Teks Otomatis) atau *2* (File Lampiran).' };
      }
      session.step = 5;
      return {
        replyText: '⚡ *Share Otomatis*\nMode pengiriman diset.\n\nPilih *Frekuensi Pengiriman*:\n1️⃣ Sekali Kirim\n2️⃣ Harian (Rutin Setiap Hari)\n3️⃣ Mingguan (Rutin Setiap Pekan)\n\n_Balas dengan 1, 2, atau 3_',
      };
    }

    // STEP 5: Frekuensi Pengiriman
    if (session.step === 5) {
      if (input === '1') {
        d.scheduleType = 'once';
        session.step = 6;
        return { replyText: '⚡ *Share Otomatis*\nKetik *Tanggal & Jam Kirim*:\n_(Contoh format: 2026-09-27 08:00, atau "besok jam 8 pagi")_' };
      } else if (input === '2') {
        d.scheduleType = 'daily';
        session.step = 6.5;
        return { replyText: '⚡ *Share Otomatis*\nKetik *Jam Kirim Harian*:\n_(Contoh: 05:00, 5 pagi, 17:30, jam 7 malam)_' };
      } else if (input === '3') {
        d.scheduleType = 'weekly';
        session.step = 5.5;
        return { replyText: '⚡ *Share Otomatis*\nPilih *Hari Pengiriman Mingguan*:\n1️⃣ Senin\n2️⃣ Selasa\n3️⃣ Rabu\n4️⃣ Kamis\n5️⃣ Jumat\n6️⃣ Sabtu\n7️⃣ Minggu\n\n_Balas dengan nomor hari 1-7_' };
      }
      return { replyText: '⚠️ Balas dengan *1* (Sekali), *2* (Harian), atau *3* (Mingguan).' };
    }

    // STEP 5.5: Hari Mingguan
    if (session.step === 5.5) {
      const dayNum = parseInt(input, 10);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 7) {
        return { replyText: '⚠️ Pilih nomor hari 1 (Senin) s.d. 7 (Minggu).' };
      }
      d.recurringDay = dayNum === 7 ? 0 : dayNum; // 0 = Minggu
      session.step = 6.5;
      return { replyText: '⚡ *Share Otomatis*\nKetik *Jam Kirim Mingguan*:\n_(Contoh: 08:00, 8 pagi, 19:30)_' };
    }

    // STEP 6 / 6.5: Jam Kirim
    if (session.step === 6 || session.step === 6.5) {
      const parsedTime = parseFlexibleTime(input);
      if (!parsedTime) {
        return { replyText: '⚠️ Jam tidak terdeteksi. Gunakan format seperti "05:00", "5 pagi", "17.30", atau "jam 7 malam".' };
      }

      if (session.step === 6) {
        const todayWib = getWibDate();
        d.scheduledDate = input.includes('-') ? input.split(' ')[0] : formatIndonesianDate(todayWib);
        d.scheduledTime = parsedTime;
      } else {
        d.recurringTime = parsedTime;
      }

      session.step = 7;
      return {
        replyText: `⚡ *Share Otomatis*\nJam Pengiriman: *${parsedTime} WIB*\n\nPilih *Penerima Broadcast*:\n1️⃣ *SEMUA Grup WhatsApp* (227+ Grup)\n2️⃣ *SEMUA Kontak WhatsApp*\n3️⃣ Cari & Pilih Grup / Kontak Tertentu\n\n_Balas dengan 1, 2, atau 3_`,
      };
    }

    // STEP 7: Penerima
    if (session.step === 7) {
      if (input === '1') {
        d.recipientType = 'wa_group';
        d.sendToAllWaGroups = true;
      } else if (input === '2') {
        d.recipientType = 'contacts';
        d.sendToAllContacts = true;
      } else if (input === '3') {
        session.step = 7.5;
        return { replyText: '⚡ *Share Otomatis*\nKetik *kata kunci nama grup/kontak* yang ingin dicari:\n_(Contoh: Kajian, Rapat, LGV, Ustadz)_' };
      } else {
        return { replyText: '⚠️ Balas dengan *1* (Semua Grup), *2* (Semua Kontak), atau *3* (Pilih Tertentu).' };
      }

      session.step = 8;
      return {
        replyText: `⚡ *Share Otomatis*\nPilih *Akun WhatsApp Pengirim*:\n1️⃣ *Rotasi Otomatis* (Bagi beban ke semua akun aktif — Paling Aman)\n2️⃣ Akun Ini (${session.accountId})\n\n_Balas dengan 1 atau 2_`,
      };
    }

    // STEP 7.5: Hasil Pencarian & Pemilihan
    if (session.step === 7.5) {
      const groups = await ContactsService.searchGroups(input, session.accountId);
      if (groups.length === 0) {
        return { replyText: `⚡ *Share Otomatis*\nTidak ditemukan grup yang cocok dengan "${input}". Silakan ketik kata kunci lain:` };
      }
      d.searchResults = groups.slice(0, 15);
      let listStr = `⚡ *Share Otomatis — Hasil Pencarian (${groups.length} grup)*:\n`;
      d.searchResults.forEach((g, i) => {
        listStr += `${i + 1}️⃣ *${g.name}*\n`;
      });
      listStr += `\nBalas dengan nomor grup (contoh: *1,3,5* atau *1-4* atau *semua*):`;
      session.step = 7.8;
      return { replyText: listStr };
    }

    // STEP 7.8: Pilihan Angka
    if (session.step === 7.8) {
      const results = d.searchResults || [];
      if (input.toLowerCase() === 'semua') {
        d.selectedGroups = results.map((g) => ({ id: g.id, name: g.name }));
      } else {
        const indices = parseIndexSelection(input, results.length);
        d.selectedGroups = indices.map((idx) => ({ id: results[idx].id, name: results[idx].name }));
      }
      d.recipientType = 'wa_group';
      d.sendToAllWaGroups = false;

      session.step = 8;
      return {
        replyText: `⚡ *Share Otomatis*\nTerpilih: *${d.selectedGroups.length} grup*\n\nPilih *Akun WhatsApp Pengirim*:\n1️⃣ *Rotasi Otomatis* (Bagi beban ke semua akun aktif)\n2️⃣ Akun Ini (${session.accountId})\n\n_Balas dengan 1 atau 2_`,
      };
    }

    // STEP 8: Akun Pengirim & Ringkasan Akhir
    if (session.step === 8) {
      if (input === '1') d.senderAccountId = 'rotation';
      else d.senderAccountId = session.accountId;

      session.step = 9;
      d.pendingConfirmation = true;

      const summaryText = buildScheduleSummary(d);
      return {
        replyText: `⚡ *Share Otomatis — Konfirmasi Akhir*\n\n${summaryText}\n\nKetik *YA* untuk menyimpan & mengaktifkan jadwal ini. Ketik *BATAL* untuk membatalkan.`,
      };
    }

    // STEP 9: Konfirmasi "YA"
    if (session.step === 9 && d.pendingConfirmation) {
      if (input.toUpperCase() === 'YA' || input.toUpperCase() === 'Y') {
        const newSchedule: BroadcastSchedule = {
          id: `sch-${Date.now()}`,
          title: d.title || 'Jadwal Tanpa Judul',
          message: d.message || '',
          scheduleType: d.scheduleType || 'daily',
          scheduledDate: d.scheduledDate,
          scheduledTime: d.scheduledTime || d.recurringTime || '08:00',
          recurringTime: d.recurringTime,
          recurringDay: d.recurringDay,
          sendMode: d.sendMode || 'schedule_text',
          attachedFile: d.attachedFile,
          extractedSchedule: d.extractedSchedule,
          scheduleScope: d.scheduleScope || 'today',
          noRowAction: d.noRowAction || 'skip',
          fallbackText: d.fallbackText,
          recipients: {
            type: d.recipientType || 'wa_group',
            sendToAllWaGroups: d.sendToAllWaGroups,
            sendToAllContacts: d.sendToAllContacts,
            targetWaGroups: d.selectedGroups,
            selectedContacts: d.selectedContacts,
            senderAccountId: d.senderAccountId || 'rotation',
          },
          status: 'active',
          antiBanDelayMin: 5,
          antiBanDelayMax: 15,
          createdAt: new Date().toISOString(),
        };

        SchedulesService.create(newSchedule);
        BotWizard.clearSession(session.accountId);

        return {
          replyText: `⚡ *Share Otomatis*\n✅ *Jadwal Berhasil Dibuat & Diaktifkan!*\n\nJudul: *${newSchedule.title}*\nWaktu Kirim: *${newSchedule.recurringTime || newSchedule.scheduledTime} WIB*\nPenerima: *${d.sendToAllWaGroups ? 'Seluruh Grup WA (227+)' : `${d.selectedGroups?.length || 0} Grup`}*\n\nJadwal kini aktif dan akan berjalan sesuai waktu yang ditentukan.`,
          isFinished: true,
        };
      } else {
        BotWizard.clearSession(session.accountId);
        return { replyText: '⚡ *Share Otomatis*\n❌ Pembuatan jadwal dibatalkan.' };
      }
    }

    return { replyText: '⚠️ Masukan tidak dikenali. Ketik */batal* untuk keluar.' };
  },
};

// Helper: parse flexible time string like "05.00", "5 pagi", "17:30", "jam 7 malam"
function parseFlexibleTime(input: string): string | null {
  const clean = input.trim().toLowerCase();
  const match = clean.match(/(\d{1,2})[:\.]?(\d{2})?/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  let min = match[2] ? parseInt(match[2], 10) : 0;

  if (clean.includes('malam') || clean.includes('sore') || clean.includes('pm')) {
    if (hour < 12) hour += 12;
  } else if (clean.includes('pagi') || clean.includes('subuh') || clean.includes('am')) {
    if (hour === 12) hour = 0;
  }

  const hStr = hour.toString().padStart(2, '0');
  const mStr = min.toString().padStart(2, '0');
  return `${hStr}:${mStr}`;
}

// Helper: parse index range like "1,3,5" or "1-4"
function parseIndexSelection(input: string, maxLen: number): number[] {
  const set = new Set<number>();
  const parts = input.split(/[,;\s]+/);
  for (const p of parts) {
    if (p.includes('-')) {
      const [start, end] = p.split('-').map((n) => parseInt(n, 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
          if (i >= 1 && i <= maxLen) set.add(i - 1);
        }
      }
    } else {
      const val = parseInt(p, 10);
      if (!isNaN(val) && val >= 1 && val <= maxLen) {
        set.add(val - 1);
      }
    }
  }
  return Array.from(set);
}

function buildScheduleSummary(d: any): string {
  const typeStr = d.scheduleType === 'once' ? 'Sekali Kirim' : d.scheduleType === 'daily' ? 'Harian (Rutin)' : 'Mingguan';
  const timeStr = d.recurringTime || d.scheduledTime || '-';
  const recStr = d.sendToAllWaGroups ? 'SELURUH Grup WA (227+)' : d.sendToAllContacts ? 'SELURUH Kontak WA' : `${d.selectedGroups?.length || 0} Grup Terpilih`;

  return `📌 *JUDUL*: ${d.title}\n🔁 *TIPE*: ${typeStr}\n⏰ *WAKTU*: ${timeStr} WIB\n👥 *PENERIMA*: ${recStr}\n📱 *PENGIRIM*: ${d.senderAccountId === 'rotation' ? 'Rotasi Otomatis' : d.senderAccountId}\n📝 *PESAN*:\n_${(d.message || '').slice(0, 150)}..._`;
}
