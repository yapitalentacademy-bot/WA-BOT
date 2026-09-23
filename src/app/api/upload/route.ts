import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { Storage, UPLOAD_DIR } from '@/lib/storage';
import { AttachedFile } from '@/types';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Tidak ada file yang diunggah' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate safe unique filename
    const ext = path.extname(file.name);
    const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueName = `${Date.now()}_${baseName}${ext}`;
    const localPath = path.join(UPLOAD_DIR, uniqueName);

    fs.writeFileSync(localPath, buffer);

    const attachedFile: AttachedFile = {
      id: `file-${Date.now()}`,
      name: uniqueName,
      originalName: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      url: `/api/files/${encodeURIComponent(uniqueName)}`,
      localPath,
      uploadedAt: new Date().toISOString(),
    };

    Storage.addFile(attachedFile);

    return NextResponse.json({ success: true, file: attachedFile });
  } catch (error: any) {
    console.error('File upload error:', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal mengunggah file' },
      { status: 500 }
    );
  }
}
