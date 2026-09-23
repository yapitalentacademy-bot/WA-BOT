import { NextResponse } from 'next/server';
import { executeSchedule } from '@/lib/scheduler';
import { BroadcastSchedule } from '@/types';

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (!data.message) {
      return NextResponse.json({ error: 'Pesan wajib diisi' }, { status: 400 });
    }

    const instantSchedule: BroadcastSchedule = {
      id: `instant-${Date.now()}`,
      title: data.title || 'Broadcast Instan',
      message: data.message,
      attachedFile: data.attachedFile || null,
      recipients: data.recipients || { type: 'all' },
      scheduleType: 'once',
      scheduledTime: new Date().toISOString(),
      status: 'active',
      antiBanDelayMin: Number(data.antiBanDelayMin) || 3,
      antiBanDelayMax: Number(data.antiBanDelayMax) || 7,
      createdAt: new Date().toISOString(),
    };

    // Trigger in background or execute asynchronously
    executeSchedule(instantSchedule).catch((err) => {
      console.error('Error executing instant broadcast:', err);
    });

    return NextResponse.json({
      success: true,
      message: 'Proses pengiriman broadcast instan telah dimulai!',
      scheduleId: instantSchedule.id,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal memulai broadcast' },
      { status: 500 }
    );
  }
}
