import { NextResponse } from 'next/server';
import { getWhatsAppStatus } from '@/lib/whatsapp';
import { startSchedulerDaemon } from '@/lib/scheduler';

export async function GET() {
  try {
    // Ensure scheduler daemon is active
    startSchedulerDaemon();
    const status = await getWhatsAppStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal memeriksa status WhatsApp' },
      { status: 500 }
    );
  }
}
