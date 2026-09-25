import { SchedulesService, TemplatesService, ContactsService, FilesService, LogsService } from './services';
import { BotWizard } from './botWizard';
import { getWhatsAppStatus } from './whatsapp';
import { getWibDate, formatIndonesianDate } from './scheduler';
import { AttachedFile } from '@/types';

export const BotCommandHandler = {
  async handleCommand(
    accountId: string,
    userJid: string,
    text: string,
    attachedFileFromMsg?: AttachedFile
  ): Promise<string> {
    const rawText = text.trim();
    const cleanText = rawText.toLowerCase();

    // 1. CEK WIZARD SESI AKTIF
    const activeSession = BotWizard.getSession(accountId);
    if (activeSession) {
      if (cleanText === '/batal' || cleanText === '#batal' || cleanText === 'batal') {
        BotWizard.clearSession(accountId);
        return '⚡ *Share Otomatis*\n❌ Sesi wizard berhasil dibatalkan.';
      }
      const wizardResult = await BotWizard.handleInput(accountId, userJid, rawText, attachedFileFromMsg);
      return wizardResult.replyText;
    }

    // 2. FILE DENGAN ATOM CAPTION (/jadwal) ATAU TANPA CAPTION
    if (attachedFileFromMsg) {
      if (cleanText === '/jadwal' || cleanText === '#jadwal' || cleanText.includes('jadwal')) {
        const session = BotWizard.startSession(accountId, userJid, 'jadwal_baru');
        const wizardResult = await BotWizard.handleInput(accountId, userJid, rawText, attachedFileFromMsg);
        return wizardResult.replyText;
      } else {
        // Tanya pilihan aksi file
        return `⚡ *Share Otomatis*\n📄 *File Terdeteksi*: ${attachedFileFromMsg.originalName}\n\nPilih aksi untuk file ini:\n1️⃣ Buat Jadwal Baru dengan file ini (Ketik: */jadwal baru*)\n2️⃣ Abaikan`;
      }
    }

    // 3. PARSE COMMANDS DENGAN PREFIX "/" ATAU "#"
    if (!rawText.startsWith('/') && !rawText.startsWith('#')) {
      // Jika bukan command dan tidak dalam wizard, tampilkan petunjuk singkat
      return '⚡ *Share Otomatis*\nKetik */menu* untuk menampilkan daftar perintah bot.';
    }

    const commandStr = rawText.substring(1).trim(); // Hapus / atau #
    const commandLower = commandStr.toLowerCase();

    // MENU
    if (commandLower === 'menu') {
      return this.renderMenu();
    }

    // BANTUAN
    if (commandLower === 'bantuan' || commandLower === 'help') {
      return this.renderHelp();
    }

    // STATUS
    if (commandLower === 'status') {
      return await this.renderStatus(accountId);
    }

    // JADWAL BARU
    if (commandLower === 'jadwal baru' || commandLower === 'jadwal_baru') {
      BotWizard.startSession(accountId, userJid, 'jadwal_baru');
      const wizardResult = await BotWizard.handleInput(accountId, userJid, '');
      return wizardResult.replyText;
    }

    // KIRIM (BROADCAST CEPAT)
    if (commandLower === 'kirim' || commandLower === 'broadcast') {
      BotWizard.startSession(accountId, userJid, 'kirim_cepat');
      const wizardResult = await BotWizard.handleInput(accountId, userJid, '');
      return wizardResult.replyText;
    }

    // JADWAL LIHAT / JEDA / LANJUT / HAPUS / LIST
    if (commandLower.startsWith('jadwal')) {
      return this.handleJadwalCommand(commandLower, commandStr);
    }

    // GRUP CARI / GRUP SINKRON
    if (commandLower.startsWith('grup')) {
      return await this.handleGrupCommand(accountId, commandLower, commandStr);
    }

    // KONTAK CARI
    if (commandLower.startsWith('kontak')) {
      return await this.handleKontakCommand(accountId, commandLower, commandStr);
    }

    // TEMPLATE
    if (commandLower.startsWith('template')) {
      return this.handleTemplateCommand(commandLower, commandStr);
    }

    // FILE
    if (commandLower === 'file' || commandLower === 'files') {
      return this.renderFileList();
    }

    // HARI INI / BESOK
    if (commandLower === 'hari ini' || commandLower === 'hari_ini' || commandLower === 'today') {
      return this.renderDayPreview(0);
    }
    if (commandLower === 'besok' || commandLower === 'tomorrow') {
      return this.renderDayPreview(1);
    }

    // RIWAYAT
    if (commandLower === 'riwayat' || commandLower === 'logs') {
      return this.renderRiwayat();
    }

    return '⚡ *Share Otomatis*\n⚠️ Perintah tidak dikenali. Ketik */menu* untuk melihat daftar perintah yang tersedia.';
  },

  renderMenu(): string {
    return `⚡ *Share Otomatis — Menu Utama*

PILIH PERINTAH DENGAN KETIK:
1️⃣ */status* — Cek status koneksi & jadwal
2️⃣ */jadwal* — Kelola daftar jadwal aktif
3️⃣ */jadwal baru* — Buat jadwal broadcast baru
4️⃣ */kirim* — Broadcast pesan cepat
5️⃣ */hari ini* — Pratinjau jadwal hari ini
6️⃣ */besok* — Pratinjau jadwal besok
7️⃣ */grup cari <kata>* — Cari grup WA
8️⃣ */kontak cari <kata>* — Cari kontak WA
9️⃣ */grup sinkron* — Sinkronkan grup WA
🔟 */template* — Kelola template pesan
1️⃣1️⃣ */file* — Daftar file jadwal
1️⃣2️⃣ */riwayat* — 10 pengiriman terakhir
1️⃣3️⃣ */bantuan* — Petunjuk lengkap perintah

_Tips: Semua perintah bisa diketik langsung di chat ini!_`;
  },

  renderHelp(): string {
    return `⚡ *Share Otomatis — Petunjuk Bantuan*

*PERINTAH JADWAL:*
• */jadwal* : Tampilkan semua jadwal aktif
• */jadwal baru* : Panduan wizard buat jadwal
• */jadwal lihat N* : Detail jadwal ke-N
• */jadwal jeda N* : Hentikan sementara jadwal N
• */jadwal lanjut N* : Aktifkan kembali jadwal N
• */jadwal hapus N* : Hapus permanen jadwal N

*PERINTAH BROADCAST & GRUP:*
• */kirim* : Broadcast instan tanpa jadwal
• */grup cari <kata>* : Cari grup WhatsApp
• */kontak cari <kata>* : Cari kontak tersimpan
• */grup sinkron* : Sinkronkan ulang grup dari HP

*PERINTAH UTILITAS:*
• */hari ini* & */besok* : Lihat pesan jadwal hari ini/besok
• */file* : Daftar file jadwal yang diunggah
• */template* : Daftar template pesan
• */riwayat* : Log 10 pesan broadcast terakhir
• */batal* : Batalkan wizard yang sedang berjalan`;
  },

  async renderStatus(accountId: string): Promise<string> {
    const waStatus = await getWhatsAppStatus();
    const currentAcc = waStatus.accounts?.find((a: any) => a.id === accountId) || waStatus.accounts?.[0];
    const activeSchedules = SchedulesService.getAll().filter((s) => s.status === 'active');
    const upcoming = SchedulesService.getUpcoming(1);

    const isConn = currentAcc?.status === 'connected';
    const connStr = isConn ? '🟢 Terhubung' : '🔴 Terputus';

    let nextRunText = 'Tidak ada pengiriman berikutnya';
    if (upcoming.length > 0) {
      nextRunText = `*${upcoming[0].schedule.title}* (${upcoming[0].nextRunStr})`;
    }

    return `⚡ *Share Otomatis — Status Sistem*

📱 *Akun*: ${currentAcc?.label || accountId} (+${currentAcc?.userInfo?.phone || 'Unknown'})
🔌 *Status WA*: ${connStr}
📅 *Jadwal Aktif*: ${activeSchedules.length} jadwal
⏰ *Pengiriman Berikutnya*:
└ ${nextRunText}

_Dashboard Web: https://wa-bot-production-9193.up.railway.app_`;
  },

  handleJadwalCommand(commandLower: string, rawStr: string): string {
    const schedules = SchedulesService.getAll();

    if (commandLower === 'jadwal' || commandLower === 'jadwal list') {
      if (schedules.length === 0) {
        return '⚡ *Share Otomatis*\nBelum ada jadwal tersimpan. Ketik */jadwal baru* untuk membuat jadwal pertama Anda!';
      }
      let text = `⚡ *Share Otomatis — Daftar Jadwal (${schedules.length})*\n\n`;
      schedules.forEach((s, i) => {
        const statusIcon = s.status === 'active' ? '🟢' : s.status === 'paused' ? '🟡' : '🔴';
        const timeStr = s.recurringTime || s.scheduledTime || '-';
        text += `${i + 1}️⃣ ${statusIcon} *${s.title}*\n   ├ Jam: ${timeStr} WIB (${s.scheduleType})\n   └ Status: ${s.status}\n`;
      });
      text += '\n_Ketik */jadwal lihat N* untuk detail, atau */jadwal jeda N* / */jadwal hapus N*_';
      return text;
    }

    const matchLihat = commandLower.match(/^jadwal\s+lihat\s+(\d+)$/);
    if (matchLihat) {
      const idx = parseInt(matchLihat[1], 10) - 1;
      if (idx < 0 || idx >= schedules.length) return '⚠️ Nomor jadwal tidak ditemukan.';
      const s = schedules[idx];
      return `⚡ *Share Otomatis — Detail Jadwal #${idx + 1}*

📌 *Judul*: ${s.title}
📊 *Status*: ${s.status}
🔁 *Frekuensi*: ${s.scheduleType}
⏰ *Jam Kirim*: ${s.recurringTime || s.scheduledTime} WIB
📁 *Mode File*: ${s.sendMode === 'schedule_text' ? 'Teks Otomatis (Ikuti Tanggal)' : 'File Lampiran'}
👥 *Penerima*: ${s.recipients.sendToAllWaGroups ? 'Seluruh Grup WA (227+)' : `${s.recipients.targetWaGroups?.length || 0} Grup`}

📝 *Pratinjau Pesan*:
\`\`\`
${s.message}
\`\`\``;
    }

    const matchJeda = commandLower.match(/^jadwal\s+jeda\s+(\d+)$/);
    if (matchJeda) {
      const idx = parseInt(matchJeda[1], 10) - 1;
      if (idx < 0 || idx >= schedules.length) return '⚠️ Nomor jadwal tidak ditemukan.';
      const s = schedules[idx];
      SchedulesService.setStatus(s.id, 'paused');
      return `⚡ *Share Otomatis*\n🟡 Jadwal *${s.title}* berhasil di-JEDA.`;
    }

    const matchLanjut = commandLower.match(/^jadwal\s+lanjut\s+(\d+)$/);
    if (matchLanjut) {
      const idx = parseInt(matchLanjut[1], 10) - 1;
      if (idx < 0 || idx >= schedules.length) return '⚠️ Nomor jadwal tidak ditemukan.';
      const s = schedules[idx];
      SchedulesService.setStatus(s.id, 'active');
      return `⚡ *Share Otomatis*\n🟢 Jadwal *${s.title}* kini AKTIF kembali.`;
    }

    const matchHapus = commandLower.match(/^jadwal\s+hapus\s+(\d+)$/);
    if (matchHapus) {
      const idx = parseInt(matchHapus[1], 10) - 1;
      if (idx < 0 || idx >= schedules.length) return '⚠️ Nomor jadwal tidak ditemukan.';
      const s = schedules[idx];
      SchedulesService.delete(s.id);
      return `⚡ *Share Otomatis*\n🗑️ Jadwal *${s.title}* berhasil dihapus permanen.`;
    }

    return '⚡ *Share Otomatis*\nPerintah jadwal tidak valid. Gunakan: */jadwal*, */jadwal baru*, */jadwal lihat N*, */jadwal jeda N*, atau */jadwal hapus N*.';
  },

  async handleGrupCommand(accountId: string, commandLower: string, rawStr: string): Promise<string> {
    if (commandLower === 'grup sinkron' || commandLower === 'grup_sinkron') {
      const res = await ContactsService.resync(accountId);
      return `⚡ *Share Otomatis*\n🔄 ${res.message}`;
    }

    if (commandLower.startsWith('grup cari') || commandLower.startsWith('grup_cari')) {
      const keyword = rawStr.replace(/^(grup\s+cari|grup_cari)\s*/i, '').trim();
      const results = await ContactsService.searchGroups(keyword, accountId);
      if (results.length === 0) {
        return `⚡ *Share Otomatis*\nTidak ada grup WhatsApp yang cocok dengan "${keyword}".`;
      }
      let text = `⚡ *Share Otomatis — Hasil Cari Grup (${results.length})*\n\n`;
      results.slice(0, 15).forEach((g, i) => {
        text += `${i + 1}️⃣ *${g.name}*\n   └ ${g.participantsCount} Anggota • ID: \`${g.id.split('@')[0]}\`\n`;
      });
      return text;
    }

    return '⚡ *Share Otomatis*\nGunakan perintah: */grup cari <kata>* atau */grup sinkron*.';
  },

  async handleKontakCommand(accountId: string, commandLower: string, rawStr: string): Promise<string> {
    if (commandLower.startsWith('kontak cari') || commandLower.startsWith('kontak_cari')) {
      const keyword = rawStr.replace(/^(kontak\s+cari|kontak_cari)\s*/i, '').trim();
      const results = await ContactsService.searchContacts(keyword, accountId);
      if (results.length === 0) {
        return `⚡ *Share Otomatis*\nTidak ada kontak WhatsApp yang cocok dengan "${keyword}".`;
      }
      let text = `⚡ *Share Otomatis — Hasil Cari Kontak (${results.length})*\n\n`;
      results.slice(0, 15).forEach((c, i) => {
        text += `${i + 1}️⃣ *${c.name}*\n   └ +${c.phone} (${c.source})\n`;
      });
      return text;
    }

    return '⚡ *Share Otomatis*\nGunakan perintah: */kontak cari <kata>*.';
  },

  handleTemplateCommand(commandLower: string, rawStr: string): string {
    const templates = TemplatesService.getAll();
    if (commandLower === 'template' || commandLower === 'templates') {
      if (templates.length === 0) {
        return '⚡ *Share Otomatis*\nBelum ada template tersimpan.';
      }
      let text = `⚡ *Share Otomatis — Daftar Template (${templates.length})*\n\n`;
      templates.forEach((t, i) => {
        text += `${i + 1}️⃣ *${t.title}* (${t.category})\n`;
      });
      text += '\n_Gunakan template saat membuat jadwal dengan /jadwal baru._';
      return text;
    }

    const matchHapus = commandLower.match(/^template\s+hapus\s+(\d+)$/);
    if (matchHapus) {
      const idx = parseInt(matchHapus[1], 10) - 1;
      if (idx < 0 || idx >= templates.length) return '⚠️ Nomor template tidak ditemukan.';
      const t = templates[idx];
      TemplatesService.delete(t.id);
      return `⚡ *Share Otomatis*\n🗑️ Template *${t.title}* berhasil dihapus.`;
    }

    return '⚡ *Share Otomatis*\nGunakan: */template* atau */template hapus N*.';
  },

  renderFileList(): string {
    const files = FilesService.getAll();
    if (files.length === 0) {
      return '⚡ *Share Otomatis*\nBelum ada file jadwal tersimpan di server.';
    }
    let text = `⚡ *Share Otomatis — Daftar File Jadwal (${files.length})*\n\n`;
    files.forEach((f, i) => {
      text += `${i + 1}️⃣ 📄 *${f.originalName}* (${(f.size / 1024).toFixed(1)} KB)\n`;
    });
    return text;
  },

  renderDayPreview(offsetDays: 0 | 1): string {
    const dayLabel = offsetDays === 0 ? 'Hari Ini' : 'Besok';
    const previews = SchedulesService.getTodayAndTomorrowPreview(offsetDays);
    const dateWib = getWibDate(offsetDays);

    if (previews.length === 0) {
      return `⚡ *Share Otomatis*\n📅 Tidak ada jadwal broadcast yang akan terkirim untuk *${dayLabel}* (${formatIndonesianDate(dateWib)}).`;
    }

    let text = `⚡ *Share Otomatis — Pratinjau Jadwal ${dayLabel}*\n🗓️ ${formatIndonesianDate(dateWib)}\n\n`;
    previews.forEach((p, i) => {
      text += `📌 *${i + 1}. ${p.scheduleTitle}*\n`;
      p.messages.forEach((msg) => {
        text += `\`\`\`\n${msg.slice(0, 200)}...\n\`\`\`\n`;
      });
    });

    return text;
  },

  renderRiwayat(): string {
    const logs = LogsService.getLatest(10);
    if (logs.length === 0) {
      return '⚡ *Share Otomatis*\nBelum ada riwayat pengiriman broadcast.';
    }

    let text = `⚡ *Share Otomatis — 10 Pengiriman Terakhir*\n\n`;
    logs.forEach((l, i) => {
      const icon = l.status === 'success' ? '✅' : '❌';
      const timeStr = new Date(l.sentAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      text += `${i + 1}️⃣ ${icon} *${l.recipientName}* (${timeStr})\n   └ Status: ${l.status === 'success' ? 'Terkirim' : l.errorDetails || 'Gagal'}\n`;
    });

    return text;
  },
};
