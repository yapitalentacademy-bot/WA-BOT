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
  contactsMap: Map<string, { id: string; name: string; phone: string }>;
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
      contactsMap: new Map(),
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

    const storeContact = (c: any) => {
      if (!c || !c.id) return;
      if (c.id.endsWith('@g.us') || c.id.endsWith('@broadcast')) return;
      const phone = c.id.split('@')[0].split(':')[0];
      const name = c.name || c.notify || c.verifiedName || phone;
      const item = { id: c.id, phone, name };
      if (c.name || c.notify || c.verifiedName) {
        acc.contactsMap.set(c.id, item);
        acc.contactsMap.set(phone, item);
        acc.contactsMap.set(`${phone}@s.whatsapp.net`, item);
        if (c.lid) acc.contactsMap.set(c.lid, item);
      } else if (!acc.contactsMap.has(c.id)) {
        acc.contactsMap.set(c.id, item);
        acc.contactsMap.set(phone, item);
      }
    };

    (sock.ev as any).on('contacts.set', ({ contacts }: any) => {
      if (Array.isArray(contacts)) contacts.forEach(storeContact);
    });

    sock.ev.on('messaging-history.set', ({ contacts }: any) => {
      if (Array.isArray(contacts)) contacts.forEach(storeContact);
    });

    sock.ev.on('contacts.upsert', (contacts: any[]) => {
      if (Array.isArray(contacts)) contacts.forEach(storeContact);
    });

    sock.ev.on('contacts.update', (updates: any[]) => {
      if (Array.isArray(updates)) {
        for (const u of updates) {
          if (u.id) {
            const existing = acc.contactsMap.get(u.id) || acc.contactsMap.get(u.id.split('@')[0]);
            const newName = u.name || u.notify || u.verifiedName || existing?.name;
            storeContact({ ...existing, ...u, name: newName });
          }
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
  const connectedAccounts = Array.from(state.accounts.values()).filter(
    (a) => a.status === 'connected' && a.socket
  );

  if (connectedAccounts.length === 0) return [];

  const targets = preferredAccountId
    ? connectedAccounts.filter((a) => a.id === preferredAccountId)
    : connectedAccounts;

  const results: Array<{ id: string; phone: string; name: string; source: string }> = [];
  const seenPhones = new Set<string>();

  for (const acc of targets) {
    // Tracked contacts
    for (const [_, c] of acc.contactsMap.entries()) {
      if (c.phone && !seenPhones.has(c.phone)) {
        seenPhones.add(c.phone);
        const displayName = c.name && c.name !== c.phone ? c.name : `+${c.phone}`;
        results.push({
          id: c.id,
          phone: c.phone,
          name: displayName,
          source: `${acc.label} (Kontak WA)`,
        });
      }
    }

    // Group participants
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

  return results;
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
