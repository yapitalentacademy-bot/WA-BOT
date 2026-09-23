import { NextResponse } from 'next/server';
import { Storage } from '@/lib/storage';

export async function GET() {
  const logs = Storage.getLogs();
  return NextResponse.json(logs);
}

export async function DELETE() {
  Storage.clearLogs();
  return NextResponse.json({ success: true, message: 'Riwayat pengiriman berhasil dibersihkan' });
}
