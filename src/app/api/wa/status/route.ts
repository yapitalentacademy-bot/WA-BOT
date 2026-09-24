import { NextResponse } from 'next/server';
import { getWhatsAppStatus } from '@/lib/whatsapp';
import { startSchedulerDaemon } from '@/lib/scheduler';

export async function GET(req: Request) {
  try {
    startSchedulerDaemon();
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || undefined;
    const status = await getWhatsAppStatus(accountId);
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal memeriksa status WhatsApp' },
      { status: 500 }
    );
  }
}
