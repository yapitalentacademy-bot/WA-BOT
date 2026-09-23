import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';
import { WhatsAppStatus, WhatsAppUserInfo } from '@/types';

// Global singleton pattern to prevent multiple socket connections during Next.js hot-reloads
interface GlobalWhatsAppState {
  socket: any | null;
  status: WhatsAppStatus;
  qrCodeDataUrl: string | null;
  userInfo: WhatsAppUserInfo | null;
  authDir: string;
  isInitializing: boolean;
}

const globalForWA = globalThis as unknown as {
  waState?: GlobalWhatsAppState;
};

const AUTH_DIR = path.join(process.cwd(), '.baileys_auth');

if (!globalForWA.waState) {
  globalForWA.waState = {
    socket: null,
    status: 'disconnected',
    qrCodeDataUrl: null,
    userInfo: null,
    authDir: AUTH_DIR,
    isInitializing: false,
  };
}

const state = globalForWA.waState;

// Format phone number to WhatsApp JID format
export function formatToWhatsAppJid(phone: string): string {
  // Strip any non-digit characters (+, -, spaces)
  let clean = phone.replace(/\D/g, '');
  
  // Convert 08xx to 628xx
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  
  if (!clean.endsWith('@s.whatsapp.net') && !clean.endsWith('@g.us')) {
    clean = `${clean}@s.whatsapp.net`;
  }
  
  return clean;
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

export async function getWhatsAppStatus(): Promise<{
  status: WhatsAppStatus;
  qrCodeDataUrl: string | null;
  userInfo: WhatsAppUserInfo | null;
}> {
  return {
    status: state.status,
    qrCodeDataUrl: state.qrCodeDataUrl,
    userInfo: state.userInfo,
  };
}

export async function disconnectWhatsApp(): Promise<void> {
  if (state.socket) {
    try {
      await state.socket.logout();
    } catch {
      try {
        state.socket.end(new Error('Manual disconnect'));
      } catch {}
    }
  }

  state.socket = null;
  state.status = 'disconnected';
  state.qrCodeDataUrl = null;
  state.userInfo = null;
  state.isInitializing = false;

  // Clean auth folder so next login shows a fresh QR code
  if (fs.existsSync(AUTH_DIR)) {
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    } catch (err) {
      console.error('Error clearing auth directory:', err);
    }
  }
}

export async function initWhatsApp(force = false): Promise<void> {
  if (state.status === 'connected' && !force && state.socket) {
    return;
  }

  if (state.isInitializing && !force) {
    return;
  }

  state.isInitializing = true;
  state.status = 'connecting';
  state.qrCodeDataUrl = null;

  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    // Dynamic import to prevent client-side or build-time issues
    const baileys = await import('@whiskeysockets/baileys');
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = baileys;

    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
      version,
      logger,
      auth: authState,
      printQRInTerminal: false,
      browser: ['Share Otomatis', 'Chrome', '1.0.0'],
      syncFullHistory: false,
    });

    state.socket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.status = 'waiting_qr';
        try {
          state.qrCodeDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            scale: 7,
            color: {
              dark: '#0B141A',
              light: '#FFFFFF',
            },
          });
        } catch (err) {
          console.error('Error generating QR data URL:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log('WA connection closed. Reason:', statusCode, 'Reconnect:', shouldReconnect);

        state.socket = null;
        state.status = 'disconnected';
        state.qrCodeDataUrl = null;
        state.userInfo = null;
        state.isInitializing = false;

        if (shouldReconnect) {
          setTimeout(() => {
            initWhatsApp();
          }, 3000);
        }
      } else if (connection === 'open') {
        state.status = 'connected';
        state.qrCodeDataUrl = null;
        state.isInitializing = false;

        const userJid = sock.user?.id || '';
        const cleanUserPhone = userJid.split(':')[0] || userJid.split('@')[0];

        state.userInfo = {
          id: userJid,
          name: sock.user?.name || 'WhatsApp User',
          phone: cleanUserPhone,
        };

        console.log('WhatsApp Connected successfully as:', cleanUserPhone);
      }
    });
  } catch (error) {
    console.error('Failed to initialize WhatsApp socket:', error);
    state.status = 'disconnected';
    state.isInitializing = false;
  }
}

// Send Text Message
export async function sendWhatsAppText(toPhone: string, text: string): Promise<any> {
  if (!state.socket || state.status !== 'connected') {
    throw new Error('WhatsApp belum terhubung. Silakan hubungkan terlebih dahulu di dashboard.');
  }

  const jid = formatToWhatsAppJid(toPhone);
  return await state.socket.sendMessage(jid, { text });
}

// Send File / Media / Document with optional caption
export async function sendWhatsAppFile(
  toPhone: string,
  filePath: string,
  fileName: string,
  mimeType: string,
  caption?: string
): Promise<any> {
  if (!state.socket || state.status !== 'connected') {
    throw new Error('WhatsApp belum terhubung. Silakan hubungkan terlebih dahulu di dashboard.');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File tidak ditemukan di server: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const jid = formatToWhatsAppJid(toPhone);

  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/');

  if (isImage) {
    return await state.socket.sendMessage(jid, {
      image: fileBuffer,
      caption: caption || undefined,
      fileName,
    });
  } else if (isVideo) {
    return await state.socket.sendMessage(jid, {
      video: fileBuffer,
      caption: caption || undefined,
      fileName,
    });
  } else if (isAudio) {
    return await state.socket.sendMessage(jid, {
      audio: fileBuffer,
      mimetype: mimeType,
      fileName,
    });
  } else {
    // PDF, DOCX, XLSX, etc. sent as document
    return await state.socket.sendMessage(jid, {
      document: fileBuffer,
      mimetype: mimeType,
      fileName: fileName,
      caption: caption || undefined,
    });
  }
}
