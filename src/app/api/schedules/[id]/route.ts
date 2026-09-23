import { NextResponse } from 'next/server';
import { Storage } from '@/lib/storage';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    Storage.deleteSchedule(id);
    return NextResponse.json({ success: true, message: 'Jadwal berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Gagal menghapus jadwal' }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    Storage.updateSchedule(id, body);
    return NextResponse.json({ success: true, message: 'Jadwal berhasil diperbarui' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Gagal memperbarui jadwal' }, { status: 500 });
  }
}
