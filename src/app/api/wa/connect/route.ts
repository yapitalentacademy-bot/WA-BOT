import { NextResponse } from 'next/server';
import { initWhatsApp, disconnectWhatsApp, getWhatsAppStatus, renameWhatsAppAccount } from '@/lib/whatsapp';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'connect'; // 'connect' | 'disconnect' | 'reconnect' | 'rename'
    const accountId = body.accountId || 'acc_1';

    if (action === 'rename') {
      const newLabel = body.newLabel || '';
      await renameWhatsAppAccount(accountId, newLabel);
      const status = await getWhatsAppStatus(accountId);
      return NextResponse.json({ message: 'Label akun berhasil diperbarui', ...status });
    }

    if (action === 'disconnect') {
      await disconnectWhatsApp(accountId);
      const status = await getWhatsAppStatus(accountId);
      return NextResponse.json({ message: `Akun ${accountId} diputus`, ...status });
    } else if (action === 'reconnect') {
      await disconnectWhatsApp(accountId);
      await initWhatsApp(accountId, true);
      const status = await getWhatsAppStatus(accountId);
      return NextResponse.json({ message: `Memulai ulang koneksi untuk ${accountId}`, ...status });
    } else {
      // Connect
      await initWhatsApp(accountId);
      const status = await getWhatsAppStatus(accountId);
      return NextResponse.json({ message: `Menginisialisasi koneksi untuk ${accountId}`, ...status });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal mengubah status koneksi WhatsApp' },
      { status: 500 }
    );
  }
}
