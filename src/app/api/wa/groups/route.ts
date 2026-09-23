import { NextResponse } from 'next/server';
import { getWhatsAppGroups, getWhatsAppStatus } from '@/lib/whatsapp';

export async function GET() {
  try {
    const waStatus = await getWhatsAppStatus();
    if (waStatus.status !== 'connected') {
      return NextResponse.json({
        groups: [],
        connected: false,
        message: 'WhatsApp belum terhubung. Hubungkan akun terlebih dahulu.',
      });
    }

    const groups = await getWhatsAppGroups();
    return NextResponse.json({ groups, connected: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal memuat grup WhatsApp' },
      { status: 500 }
    );
  }
}
