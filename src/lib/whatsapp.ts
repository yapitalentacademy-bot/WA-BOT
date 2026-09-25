import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';
import { WhatsAppStatus, WhatsAppUserInfo, WhatsAppAccountInfo } from '@/types';

export const MAX_WA_ACCOUNTS = 5;

export interface WhatsAppAccountState {
  id: string; // 'acc_1', 'acc_2', 'acc_3', 'acc_4', 'acc_5'
  label: string;
  socket: any | null;
  status: WhatsAppStatus;
  qrCodeDataUrl: string | null;
  userInfo: WhatsAppUserInfo | null;
  authDir: string;
  isInitializing: boolean;
  contactsMap: Map<string, { id: string; name: string; phone: string; lid?: string; nameSource?: string }>;
}

interface MultiAccountWhatsAppState {
  accounts: Map<string, WhatsAppAccountState>;
  roundRobinIndex: number;
}

const globalForWA = globalThis as unknown as {
  multiWaState?: MultiAccountWhatsAppState;
};

const BASE_AUTH_DIR = path.join(process.cwd(), '.baileys_auth');
const LABELS_FILE = path.join(process.cwd(), 'data', 'wa_accounts.json');

// Default initial labels
const DEFAULT_ACCOUNT_LABELS: Record<string, string> = {
  acc_1: 'Akun 1 (Utama)',
  acc_2: 'Akun 2',
  acc_3: 'Akun 3',
  acc_4: 'Akun 4',
  acc_5: 'Akun 5',
};

function loadAccountLabels(): Record<string, string> {
  try {
    if (fs.existsSync(LABELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(LABELS_FILE, 'utf-8'));
      return { ...DEFAULT_ACCOUNT_LABELS, ...data };
    }
  } catch (e) {
    console.error('Error loading account labels:', e);
  }
  return { ...DEFAULT_ACCOUNT_LABELS };
}

function saveAccountLabels(labels: Record<string, string>): void {
  try {
    const dir = path.dirname(LABELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LABELS_FILE, JSON.stringify(labels, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving account labels:', e);
  }
}

function getContactsFilePath(accId: string): string {
  const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH)
    : path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, `wa_contacts_${accId}.json`);
}

function loadAccountContacts(accId: string): Map<string, { id: string; name: string; phone: string; lid?: string; nameSource?: string }> {
  const map = new Map<string, { id: string; name: string; phone: string; lid?: string; nameSource?: string }>();
  try {
    const filePath = getContactsFilePath(accId);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item.id) map.set(item.id, item);
          if (item.phone) {
            map.set(item.phone, item);
            map.set(`${item.phone}@s.whatsapp.net`, item);
          }
          if (item.lid) map.set(item.lid, item);
        }
      }
    }
  } catch (e) {
    console.error(`Gagal memuat kontak dari disk untuk ${accId}:`, e);
  }
  return map;
}

const saveTimers: Record<string, NodeJS.Timeout> = {};
function saveAccountContacts(accId: string, contactsMap: Map<string, any>) {
  if (saveTimers[accId]) clearTimeout(saveTimers[accId]);
  saveTimers[accId] = setTimeout(() => {
    try {
      const filePath = getContactsFilePath(accId);
      const unique = new Map<string, any>();
      for (const [_, item] of contactsMap.entries()) {
        const key = item.phone || item.id;
        if (key) {
          const existing = unique.get(key);
          if (!existing || (item.name && item.name !== item.phone)) {
            unique.set(key, item);
          }
        }
      }
      fs.writeFileSync(filePath, JSON.stringify(Array.from(unique.values()), null, 2), 'utf-8');
    } catch (e) {
      console.error(`Gagal menyimpan kontak ke disk untuk ${accId}:`, e);
    }
  }, 1000);
}

// Initialize Global State
if (!globalForWA.multiWaState) {
  const labels = loadAccountLabels();
  const accountsMap = new Map<string, WhatsAppAccountState>();

  for (let i = 1; i <= MAX_WA_ACCOUNTS; i++) {
    const accId = `acc_${i}`;
    const authDir = path.join(BASE_AUTH_DIR, accId);
    accountsMap.set(accId, {
      id: accId,
      label: labels[accId] || `Akun ${i}`,
      socket: null,
      status: 'disconnected',
      qrCodeDataUrl: null,
      userInfo: null,
      authDir,
      isInitializing: false,
      contactsMap: loadAccountContacts(accId),
    });
  }

  globalForWA.multiWaState = {
    accounts: accountsMap,
    roundRobinIndex: 0,
  };
}

const state = globalForWA.multiWaState;

// Format phone number or Group ID to WhatsApp JID format
export function formatToWhatsAppJid(target: string): string {
  const trimmed = target.trim();
  if (trimmed.endsWith('@g.us') || trimmed.endsWith('@s.whatsapp.net')) {
    return trimmed;
  }
  if (trimmed.includes('-') || (trimmed.length >= 16 && !trimmed.startsWith('0') && !trimmed.startsWith('62') && !trimmed.startsWith('+'))) {
    return `${trimmed}@g.us`;
  }

  let clean = trimmed.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return `${clean}@s.whatsapp.net`;
}

export function cleanPhoneNumber(phone: string): string {
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

// Get status of all accounts (or specific account)
export async function getWhatsAppStatus(accountId?: string): Promise<{
  accounts: WhatsAppAccountInfo[];
  connectedCount: number;
  maxAccounts: number;
  status: WhatsAppStatus;
  qrCodeDataUrl: string | null;
  userInfo: WhatsAppUserInfo | null;
  activeAccount: WhatsAppAccountInfo | null;
}> {
  const accountList: WhatsAppAccountInfo[] = [];
  let connectedCount = 0;

  for (let i = 1; i <= MAX_WA_ACCOUNTS; i++) {
    const acc = state.accounts.get(`acc_${i}`);
    if (acc) {
      if (acc.status === 'connected') connectedCount++;
      accountList.push({
        id: acc.id,
        label: acc.label,
        status: acc.status,
        qrCodeDataUrl: acc.qrCodeDataUrl,
        userInfo: acc.userInfo,
      });
    }
  }

  // Primary or target account for backward compatibility
  const targetAcc = accountId ? state.accounts.get(accountId) : (state.accounts.get('acc_1') || accountList[0]);
  const activeConnected = Array.from(state.accounts.values()).find((a) => a.status === 'connected');
  const displayAcc = targetAcc || activeConnected || accountList[0];

  return {
    accounts: accountList,
    connectedCount,
    maxAccounts: MAX_WA_ACCOUNTS,
    status: displayAcc?.status || 'disconnected',
    qrCodeDataUrl: displayAcc?.qrCodeDataUrl || null,
    userInfo: displayAcc?.userInfo || null,
    activeAccount: displayAcc ? {
      id: displayAcc.id,
      label: displayAcc.label,
      status: displayAcc.status,
      qrCodeDataUrl: displayAcc.qrCodeDataUrl,
      userInfo: displayAcc.userInfo,
    } : null,
  };
}

// Rename an account label
export async function renameWhatsAppAccount(accountId: string, newLabel: string): Promise<void> {
  const acc = state.accounts.get(accountId);
  if (!acc) throw new Error(`Akun ${accountId} tidak ditemukan`);
  acc.label = newLabel.trim() || acc.label;

  const labels = loadAccountLabels();
  labels[accountId] = acc.label;
  saveAccountLabels(labels);
}

// Disconnect a specific WhatsApp account
export async function disconnectWhatsApp(accountId = 'acc_1'): Promise<void> {
  const acc = state.accounts.get(accountId);
  if (!acc) return;

  if (acc.socket) {
    try {
      await acc.socket.logout();
    } catch {
      try {
        acc.socket.end(new Error('Manual disconnect'));
      } catch {}
    }
  }

  acc.socket = null;
  acc.status = 'disconnected';
  acc.qrCodeDataUrl = null;
  acc.userInfo = null;
  acc.isInitializing = false;

  // Clean auth folder so next login shows fresh QR code
  if (fs.existsSync(acc.authDir)) {
    try {
      fs.rmSync(acc.authDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Error clearing auth directory for ${accountId}:`, err);
    }
  }
}

// Connect a specific WhatsApp account
export async function initWhatsApp(accountId = 'acc_1', force = false): Promise<void> {
  const acc = state.accounts.get(accountId);
  if (!acc) {
    throw new Error(`Akun ${accountId} tidak valid. Maksimal ${MAX_WA_ACCOUNTS} akun.`);
  }

  if (acc.status === 'connected' && !force && acc.socket) {
    return;
  }

  if (acc.isInitializing && !force) {
    return;
  }

  acc.isInitializing = true;
  acc.status = 'connecting';
  acc.qrCodeDataUrl = null;

  try {
    if (!fs.existsSync(acc.authDir)) {
      fs.mkdirSync(acc.authDir, { recursive: true });
    }

    const baileys = await import('@whiskeysockets/baileys');
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = baileys;

    const { state: authState, saveCreds } = await useMultiFileAuthState(acc.authDir);
    let version: [number, number, number] = [2, 3000, 1015901307];
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest && latest.version) {
        version = latest.version;
      }
      console.log(`[MULTI-WA] [${acc.label}] Baileys v${version.join('.')}, isLatest: ${latest?.isLatest}`);
    } catch (e) {
      console.warn(`[MULTI-WA] [${acc.label}] Gagal mengambil versi Baileys terbaru, menggunakan fallback version:`, e);
    }

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      logger,
      auth: authState,
      printQRInTerminal: false,
      browser: [`Share Otomatis (${acc.label})`, 'Chrome', '1.0.0'],
      syncFullHistory: false,
    });

    acc.socket = sock;

    sock.ev.on('creds.update', saveCreds);

    const storeContact = (c: any, source?: 'hp' | 'notify' | 'push') => {
      if (!c || (!c.id && !c.phone && !c.phoneNumber)) return;
      if (c.id && (c.id.endsWith('@g.us') || c.id.endsWith('@broadcast'))) return;

      const rawId = c.id || '';
      const lid = c.lid || (rawId.endsWith('@lid') ? rawId : undefined);
      const pn = c.phoneNumber || c.pn;

      let phoneRaw = '';
      if (pn) {
        phoneRaw = pn.split('@')[0].split(':')[0];
      } else if (rawId && !rawId.endsWith('@lid')) {
        phoneRaw = rawId.split('@')[0].split(':')[0];
      }

      const cleanPhone = phoneRaw ? cleanPhoneNumber(phoneRaw) : '';
      const jid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : rawId;
      if (!jid && !cleanPhone && !lid) return;

      // Cari data kontak yang sudah tersimpan sebelumnya (by jid, phone, atau lid)
      const existing =
        acc.contactsMap.get(jid) ||
        (cleanPhone ? acc.contactsMap.get(cleanPhone) : null) ||
        (lid ? acc.contactsMap.get(lid) : null);

      const newHpName = (c.name && c.name !== cleanPhone && c.name !== jid && !c.name.startsWith('+')) ? c.name : undefined;
      const newNotifyName = (c.notify || c.verifiedName) && (c.notify || c.verifiedName) !== cleanPhone ? (c.notify || c.verifiedName) : undefined;
      const newPushName = (source === 'push' && c.pushName && c.pushName !== cleanPhone) ? c.pushName : undefined;

      let finalName = existing?.name;
      let nameSource = existing?.nameSource;

      // Hierarki prioritas: name (buku kontak HP) > notify / verifiedName > pushName (pesan masuk) > nomor
      if (newHpName) {
        finalName = newHpName;
        nameSource = 'hp';
      } else if (newNotifyName && (nameSource !== 'hp' || !finalName || finalName === cleanPhone)) {
        finalName = newNotifyName;
        nameSource = 'notify';
      } else if (newPushName && (!finalName || finalName === cleanPhone || finalName.startsWith('Peserta ') || finalName.startsWith('Anggota '))) {
        finalName = newPushName;
        nameSource = 'push';
      } else if (!finalName) {
        finalName = cleanPhone ? `+${cleanPhone}` : rawId || 'Kontak';
        nameSource = 'phone';
      }

      const finalLid = lid || existing?.lid;
      const item = {
        id: jid || `${cleanPhone}@s.whatsapp.net`,
        phone: cleanPhone,
        name: finalName || cleanPhone || 'Kontak',
        lid: finalLid,
        nameSource,
      };

      // Simpan ke kontak map akun ini
      if (jid) acc.contactsMap.set(jid, item);
      if (cleanPhone) {
        acc.contactsMap.set(cleanPhone, item);
        acc.contactsMap.set(`${cleanPhone}@s.whatsapp.net`, item);
      }
      if (finalLid) {
        acc.contactsMap.set(finalLid, item);
      }

      saveAccountContacts(acc.id, acc.contactsMap);
    };

    (sock.ev as any).on('contacts.set', ({ contacts }: any) => {
      if (Array.isArray(contacts)) contacts.forEach((c) => storeContact(c, 'hp'));
    });

    sock.ev.on('messaging-history.set', ({ contacts }: any) => {
      if (Array.isArray(contacts)) contacts.forEach((c) => storeContact(c, 'hp'));
    });

    sock.ev.on('contacts.upsert', (contacts: any[]) => {
      if (Array.isArray(contacts)) contacts.forEach((c) => storeContact(c, 'hp'));
    });

    sock.ev.on('contacts.update', (updates: any[]) => {
      if (Array.isArray(updates)) {
        for (const u of updates) {
          if (u.id) {
            const existing = acc.contactsMap.get(u.id) || acc.contactsMap.get(u.id.split('@')[0]);
            storeContact({ ...existing, ...u }, 'hp');
          }
        }
      }
    });

    sock.ev.on('messages.upsert', ({ messages }: any) => {
      if (!Array.isArray(messages)) return;
      for (const m of messages) {
        // PENTING: Abaikan pesan keluar (key.fromMe === true) agar pushName sendiri tidak menimpa nama penerima!
        if (m.key?.fromMe) continue;
        const jid = m.key?.participant || m.key?.remoteJid;
        if (jid && m.pushName) {
          storeContact({ id: jid, pushName: m.pushName }, 'push');
        }
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        acc.status = 'waiting_qr';
        try {
          acc.qrCodeDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            scale: 7,
            color: {
              dark: '#0B141A',
              light: '#FFFFFF',
            },
          });
        } catch (err) {
          console.error(`[MULTI-WA] [${acc.label}] Error generating QR:`, err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[MULTI-WA] [${acc.label}] WA connection closed. Code:`, statusCode, 'Reconnect:', shouldReconnect);

        acc.socket = null;
        acc.status = 'disconnected';
        acc.qrCodeDataUrl = null;
        acc.userInfo = null;
        acc.isInitializing = false;

        if (shouldReconnect) {
          setTimeout(() => {
            initWhatsApp(accountId);
          }, 3000);
        }
      } else if (connection === 'open') {
        acc.status = 'connected';
        acc.qrCodeDataUrl = null;
        acc.isInitializing = false;

        const userJid = sock.user?.id || '';
        const cleanUserPhone = userJid.split(':')[0] || userJid.split('@')[0];

        acc.userInfo = {
          id: userJid,
          name: sock.user?.name || acc.label,
          phone: cleanUserPhone,
        };

        console.log(`[MULTI-WA] [${acc.label}] WhatsApp Connected as:`, cleanUserPhone);
      }
    });
  } catch (error) {
    console.error(`[MULTI-WA] [${acc.label}] Failed to initialize socket:`, error);
    acc.status = 'disconnected';
    acc.isInitializing = false;
  }
}

// Select the best socket for sending: preferred or round-robin rotation among connected accounts
export function getActiveSocket(preferredAccountId?: string): { socket: any; account: WhatsAppAccountState } {
  const connectedAccounts = Array.from(state.accounts.values()).filter(
    (a) => a.status === 'connected' && a.socket
  );

  if (connectedAccounts.length === 0) {
    throw new Error('Tidak ada akun WhatsApp yang terhubung. Silakan hubungkan minimal 1 akun di dashboard.');
  }

  if (preferredAccountId && preferredAccountId !== 'rotation') {
    const found = connectedAccounts.find((a) => a.id === preferredAccountId);
    if (found) return { socket: found.socket, account: found };
  }

  // Round-robin selection
  const idx = state.roundRobinIndex % connectedAccounts.length;
  state.roundRobinIndex = (state.roundRobinIndex + 1) % connectedAccounts.length;
  const chosen = connectedAccounts[idx];
  return { socket: chosen.socket, account: chosen };
}

// Resolve destination JID
export async function resolveWhatsAppJid(target: string, sock?: any): Promise<string> {
  const formatted = formatToWhatsAppJid(target);
  if (formatted.endsWith('@g.us')) {
    return formatted;
  }

  if (sock) {
    try {
      const clean = formatted.replace('@s.whatsapp.net', '');
      const results = await sock.onWhatsApp(clean);
      const check = results?.[0];
      if (check && check.exists && check.jid) {
        return check.jid;
      }
    } catch (e) {
      // ignore
    }
  }
  return formatted;
}

// Send Text Message
export async function sendWhatsAppText(
  toPhone: string,
  text: string,
  preferredAccountId?: string
): Promise<any> {
  const { socket, account } = getActiveSocket(preferredAccountId);
  const jid = await resolveWhatsAppJid(toPhone, socket);
  console.log(`[WA SEND] [${account.label} - +${account.userInfo?.phone || ''}] Mengirim teks ke ${jid}`);
  const result = await socket.sendMessage(jid, { text });
  console.log(`[WA SEND] Pesan berhasil dikirim. Key ID: ${result?.key?.id}`);
  return result;
}

// Send File / Media / Document
export async function sendWhatsAppFile(
  toPhone: string,
  filePath: string,
  fileName: string,
  mimeType: string,
  caption?: string,
  preferredAccountId?: string
): Promise<any> {
  const { socket, account } = getActiveSocket(preferredAccountId);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File tidak ditemukan di server: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const jid = await resolveWhatsAppJid(toPhone, socket);
  console.log(`[WA SEND] [${account.label} - +${account.userInfo?.phone || ''}] Mengirim file "${fileName}" ke ${jid}`);

  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/');

  let result;
  if (isImage) {
    result = await socket.sendMessage(jid, {
      image: fileBuffer,
      caption: caption || undefined,
      fileName,
    });
  } else if (isVideo) {
    result = await socket.sendMessage(jid, {
      video: fileBuffer,
      caption: caption || undefined,
      fileName,
    });
  } else if (isAudio) {
    result = await socket.sendMessage(jid, {
      audio: fileBuffer,
      mimetype: mimeType,
      fileName,
    });
  } else {
    result = await socket.sendMessage(jid, {
      document: fileBuffer,
      mimetype: mimeType,
      fileName,
      caption: caption || undefined,
    });
  }

  console.log(`[WA SEND] File berhasil dikirim. Key ID: ${result?.key?.id}`);
  return result;
}

// Fetch WhatsApp Groups (across connected accounts or specific account)
export async function getWhatsAppGroups(preferredAccountId?: string): Promise<{ id: string; name: string; participantsCount: number }[]> {
  const connectedAccounts = Array.from(state.accounts.values()).filter(
    (a) => a.status === 'connected' && a.socket
  );

  if (connectedAccounts.length === 0) return [];

  const targets = preferredAccountId
    ? connectedAccounts.filter((a) => a.id === preferredAccountId)
    : connectedAccounts;

  const groupsMap = new Map<string, { id: string; name: string; participantsCount: number }>();

  for (const acc of targets) {
    try {
      const accGroups = await acc.socket.groupFetchAllParticipating();
      for (const g of Object.values(accGroups) as any[]) {
        if (!groupsMap.has(g.id)) {
          groupsMap.set(g.id, {
            id: g.id,
            name: g.subject || 'Grup WhatsApp',
            participantsCount: Array.isArray(g.participants) ? g.participants.length : 0,
          });
        }
      }
    } catch (e) {
      console.warn(`[MULTI-WA] Failed to fetch groups for ${acc.label}:`, e);
    }
  }

  return Array.from(groupsMap.values());
}

// Helper to resolve participant details (Phone, LID, and Saved Name)
function resolveParticipantInfo(acc: WhatsAppAccountState, p: any, groupName: string) {
  const rawId = p.id || '';
  const pnJid = p.pn || p.phoneNumber || (rawId.endsWith('@s.whatsapp.net') ? rawId : '');
  const lidJid = p.lid || (rawId.endsWith('@lid') ? rawId : '');

  let phone = '';
  if (pnJid) {
    phone = pnJid.split('@')[0].split(':')[0];
  } else if (rawId && !rawId.endsWith('@lid')) {
    phone = rawId.split('@')[0].split(':')[0];
  }

  const isLid = !phone || phone.length >= 14 || rawId.endsWith('@lid');
  const targetPhone = phone || rawId.split('@')[0].split(':')[0];

  // Look up in contactsMap
  const known =
    (rawId ? acc.contactsMap.get(rawId) : null) ||
    (lidJid ? acc.contactsMap.get(lidJid) : null) ||
    (targetPhone ? acc.contactsMap.get(targetPhone) : null) ||
    (targetPhone ? acc.contactsMap.get(`${targetPhone}@s.whatsapp.net`) : null);

  let name = '';
  if (known?.name && known.name !== targetPhone && known.name !== rawId) {
    name = known.name;
  } else if (p.name || p.notify || p.verifiedName) {
    name = p.name || p.notify || p.verifiedName;
  }

  const destinationId = rawId || (phone ? `${phone}@s.whatsapp.net` : '');
  const displayPhone = targetPhone;
  const finalName = name || (isLid ? `Peserta ${groupName} (ID: ${displayPhone.slice(-4)})` : `Peserta ${groupName} (+${displayPhone})`);

  return {
    id: destinationId,
    phone: displayPhone,
    name: finalName,
    isLid,
  };
}

// Fetch WhatsApp Contacts (across connected accounts or specific account)
export async function getWhatsAppContacts(preferredAccountId?: string): Promise<Array<{ id: string; phone: string; name: string; source: string }>> {
  const allAccounts = Array.from(state.accounts.values());
  const targets = preferredAccountId
    ? allAccounts.filter((a) => a.id === preferredAccountId)
    : allAccounts;

  const results: Array<{ id: string; phone: string; name: string; source: string }> = [];
  const seenPhones = new Set<string>();

  for (const acc of targets) {
    // 1. Kontak dari cache memori/disk akun ini
    for (const [_, c] of acc.contactsMap.entries()) {
      if (c.phone && !seenPhones.has(c.phone)) {
        seenPhones.add(c.phone);
        const displayName = c.name && c.name !== c.phone ? c.name : `+${c.phone}`;
        results.push({
          id: c.id || `${c.phone}@s.whatsapp.net`,
          phone: c.phone,
          name: displayName,
          source: `${acc.label} (Kontak WA)`,
        });
      }
    }

    // 2. Partisipan dari grup WA jika akun sedang terhubung
    if (acc.status === 'connected' && acc.socket) {
      try {
        const groups = await acc.socket.groupFetchAllParticipating();
        for (const g of Object.values(groups) as any[]) {
          const groupName = g.subject || 'Grup WA';
          if (Array.isArray(g.participants)) {
            for (const p of g.participants) {
              const info = resolveParticipantInfo(acc, p, groupName);
              if (info.phone && !seenPhones.has(info.phone)) {
                seenPhones.add(info.phone);
                results.push({
                  id: info.id,
                  phone: info.phone,
                  name: info.name,
                  source: groupName,
                });
              }
            }
          }
        }
      } catch (err) {
        // ignore
      }
    }
  }

  return results;
}

// Re-sync contacts for an account
export async function resyncWhatsAppContacts(accountId?: string): Promise<{ success: boolean; count: number; message: string }> {
  const targetAccId = accountId || 'acc_1';
  const acc = state.accounts.get(targetAccId);
  if (!acc) {
    throw new Error(`Akun ${targetAccId} tidak ditemukan.`);
  }

  if (acc.status !== 'connected' || !acc.socket) {
    const count = new Set(Array.from(acc.contactsMap.values()).map((c) => c.phone || c.id)).size;
    return {
      success: true,
      count,
      message: `Akun ${acc.label} belum terhubung ke WhatsApp. Menampilkan ${count} kontak dari memori disk.`,
    };
  }

  try {
    const groups = await acc.socket.groupFetchAllParticipating();
    let updatedCount = 0;
    for (const g of Object.values(groups) as any[]) {
      const groupName = g.subject || 'Grup WA';
      if (Array.isArray(g.participants)) {
        for (const p of g.participants) {
          const info = resolveParticipantInfo(acc, p, groupName);
          if (info.phone) {
            const jid = `${info.phone}@s.whatsapp.net`;
            const existing = acc.contactsMap.get(jid) || acc.contactsMap.get(info.phone);
            const nama = info.name && !info.name.startsWith('Peserta ') && !info.name.startsWith('Anggota ') ? info.name : existing?.name || `+${info.phone}`;
            const item = { id: jid, phone: info.phone, name: nama, lid: p.lid || existing?.lid };
            acc.contactsMap.set(jid, item);
            acc.contactsMap.set(info.phone, item);
            if (p.lid) acc.contactsMap.set(p.lid, item);
            updatedCount++;
          }
        }
      }
    }
    saveAccountContacts(acc.id, acc.contactsMap);
    const totalCount = new Set(Array.from(acc.contactsMap.values()).map((c) => c.phone || c.id)).size;
    return {
      success: true,
      count: totalCount,
      message: `Sinkronisasi kontak berhasil untuk ${acc.label}! ${totalCount} kontak tersimpan.`,
    };
  } catch (err: any) {
    const totalCount = new Set(Array.from(acc.contactsMap.values()).map((c) => c.phone || c.id)).size;
    return {
      success: true,
      count: totalCount,
      message: `Kontak dari disk disinkronkan untuk ${acc.label}. Total: ${totalCount} kontak.`,
    };
  }
}

// Fetch Group Participants
export async function getWhatsAppGroupParticipants(
  groupId: string,
  preferredAccountId?: string
): Promise<Array<{ id: string; phone: string; name: string; groupName: string }>> {
  const connectedAccounts = Array.from(state.accounts.values()).filter(
    (a) => a.status === 'connected' && a.socket
  );

  if (connectedAccounts.length === 0) return [];

  for (const acc of connectedAccounts) {
    try {
      const groupMeta = await acc.socket.groupMetadata(groupId);
      const groupName = groupMeta.subject || 'Grup WA';
      const participants: Array<{ id: string; phone: string; name: string; groupName: string }> = [];

      if (Array.isArray(groupMeta.participants)) {
        for (const p of groupMeta.participants) {
          const info = resolveParticipantInfo(acc, p, groupName);
          if (info.phone) {
            participants.push({
              id: info.id,
              phone: info.phone,
              name: info.name,
              groupName,
            });
          }
        }
      }
      return participants;
    } catch (err) {
      // Try next account
    }
  }

  return [];
}
