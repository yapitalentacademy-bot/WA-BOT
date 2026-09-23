import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { UPLOAD_DIR } from '@/lib/storage';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safeName);

    if (!fs.existsSync(filePath)) {
      return new NextResponse('File tidak ditemukan', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(safeName).toLowerCase();

    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (ext === '.csv') contentType = 'text/csv';
    else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${safeName}"`,
      },
    });
  } catch (error) {
    return new NextResponse('Error reading file', { status: 500 });
  }
}
