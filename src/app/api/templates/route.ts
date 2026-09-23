import { NextResponse } from 'next/server';
import { Storage } from '@/lib/storage';
import { MessageTemplate } from '@/types';

export async function GET() {
  const templates = Storage.getTemplates();
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.title || !body.content) {
      return NextResponse.json({ error: 'Judul dan isi template wajib diisi' }, { status: 400 });
    }

    const newTemplate: MessageTemplate = {
      id: `tpl-${Date.now()}`,
      title: body.title,
      content: body.content,
      category: body.category || 'Umum',
      attachedFileId: body.attachedFileId,
      attachedFileName: body.attachedFileName,
      createdAt: new Date().toISOString(),
    };

    Storage.addTemplate(newTemplate);
    return NextResponse.json({ success: true, template: newTemplate });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal menyimpan template' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID template wajib disertakan' }, { status: 400 });
    }
    Storage.deleteTemplate(id);
    return NextResponse.json({ success: true, message: 'Template berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Gagal menghapus template' }, { status: 500 });
  }
}
