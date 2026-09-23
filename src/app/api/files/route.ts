import { NextResponse } from 'next/server';
import { Storage } from '@/lib/storage';

export async function GET() {
  const files = Storage.getFiles();
  return NextResponse.json(files);
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID file wajib disertakan' }, { status: 400 });
    }
    Storage.deleteFile(id);
    return NextResponse.json({ success: true, message: 'File berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Gagal menghapus file' }, { status: 500 });
  }
}
