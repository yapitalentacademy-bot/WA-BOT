import { NextResponse } from 'next/server';
import { Storage } from '@/lib/storage';
import { BroadcastSchedule } from '@/types';

export async function GET() {
  const schedules = Storage.getSchedules();
  return NextResponse.json(schedules);
}

export async function POST(req: Request) {
  try {
    const data = await req.json();

    if (!data.title || !data.message) {
      return NextResponse.json({ error: 'Judul dan pesan jadwal wajib diisi' }, { status: 400 });
    }

    const newSchedule: BroadcastSchedule = {
      id: `sch-${Date.now()}`,
      title: data.title,
      message: data.message,
      templateId: data.templateId,
      attachedFile: data.attachedFile || null,
      recipients: data.recipients || { type: 'all' },
      scheduleType: data.scheduleType || 'once',
      scheduledTime: data.scheduledTime || new Date().toISOString(),
      recurringTime: data.recurringTime,
      recurringDay: data.recurringDay,
      status: 'active',
      antiBanDelayMin: Number(data.antiBanDelayMin) || 3,
      antiBanDelayMax: Number(data.antiBanDelayMax) || 7,
      createdAt: new Date().toISOString(),
    };

    Storage.addSchedule(newSchedule);

    return NextResponse.json({ success: true, schedule: newSchedule });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal menyimpan jadwal' },
      { status: 500 }
    );
  }
}
