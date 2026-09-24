import { NextResponse } from 'next/server';
import { sendWhatsAppText, sendWhatsAppFile } from '@/lib/whatsapp';
import { Storage } from '@/lib/storage';

export async function POST(req: Request) {
  try {
    const { phone, message, fileId, accountId } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: 'Nomor telepon penerima wajib diisi' }, { status: 400 });
    }

    if (!message && !fileId) {
      return NextResponse.json({ error: 'Pesan teks atau file lampiran wajib dipilih' }, { status: 400 });
    }

    let attachmentName: string | undefined;
    if (fileId) {
      const files = Storage.getFiles();
      const file = files.find((f) => f.id === fileId);
      if (!file) {
        return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 404 });
      }
      attachmentName = file.originalName;
      await sendWhatsAppFile(phone, file.localPath, file.originalName, file.mimeType, message || '', accountId);
    } else {
      await sendWhatsAppText(phone, message, accountId);
    }

    // Log the test send
    Storage.addLog({
      id: `log-${Date.now()}`,
      scheduleTitle: 'Uji Coba Kirim (Test Send)',
      recipientPhone: phone,
      recipientName: 'Tes Pengiriman',
      messageText: message || '(File Lampiran Saja)',
      hasAttachment: Boolean(fileId),
      attachmentName,
      status: 'success',
      sentAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: 'Pesan tes berhasil dikirim!' });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal mengirim pesan tes' },
      { status: 500 }
    );
  }
}
