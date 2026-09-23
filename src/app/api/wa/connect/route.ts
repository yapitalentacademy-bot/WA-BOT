import { NextResponse } from 'next/server';
import { initWhatsApp, disconnectWhatsApp, getWhatsAppStatus } from '@/lib/whatsapp';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'connect'; // 'connect' | 'disconnect' | 'reconnect'

    if (action === 'disconnect') {
      await disconnectWhatsApp();
      return NextResponse.json({ message: 'WhatsApp diputus', status: 'disconnected' });
    } else if (action === 'reconnect') {
      await disconnectWhatsApp();
      await initWhatsApp(true);
      const status = await getWhatsAppStatus();
      return NextResponse.json({ message: 'Memulai ulang koneksi WhatsApp', ...status });
    } else {
      // Connect
      await initWhatsApp();
      const status = await getWhatsAppStatus();
      return NextResponse.json({ message: 'Menginisialisasi koneksi WhatsApp', ...status });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal mengubah status koneksi WhatsApp' },
      { status: 500 }
    );
  }
}
