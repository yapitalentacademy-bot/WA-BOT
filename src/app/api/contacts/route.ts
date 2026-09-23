import { NextResponse } from 'next/server';
import { Storage } from '@/lib/storage';
import { Contact } from '@/types';
import { cleanPhoneNumber } from '@/lib/whatsapp';

export async function GET() {
  const contacts = Storage.getContacts();
  return NextResponse.json(contacts);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Support single contact or bulk array
    if (body.bulk && Array.isArray(body.contacts)) {
      const existing = Storage.getContacts();
      const newContacts: Contact[] = [];

      for (const item of body.contacts) {
        if (!item.phone) continue;
        const phone = cleanPhoneNumber(item.phone);
        // Avoid duplicate phone
        if (!existing.some((c) => c.phone === phone)) {
          newContacts.push({
            id: `c-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: item.name || 'Kontak',
            phone,
            group: item.group || 'Umum',
            notes: item.notes || '',
            createdAt: new Date().toISOString(),
          });
        }
      }

      Storage.saveContacts([...newContacts, ...existing]);
      return NextResponse.json({
        success: true,
        message: `${newContacts.length} kontak berhasil diimpor!`,
        count: newContacts.length,
      });
    }

    // Single contact
    if (!body.phone) {
      return NextResponse.json({ error: 'Nomor telepon wajib diisi' }, { status: 400 });
    }

    const phone = cleanPhoneNumber(body.phone);
    const existing = Storage.getContacts();
    if (existing.some((c) => c.phone === phone)) {
      return NextResponse.json({ error: 'Nomor telepon sudah terdaftar di kontak' }, { status: 400 });
    }

    const newContact: Contact = {
      id: `c-${Date.now()}`,
      name: body.name || 'Kontak',
      phone,
      group: body.group || 'Umum',
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
    };

    Storage.addContact(newContact);
    return NextResponse.json({ success: true, contact: newContact });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Gagal menyimpan kontak' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID kontak wajib disertakan' }, { status: 400 });
    }
    Storage.deleteContact(id);
    return NextResponse.json({ success: true, message: 'Kontak berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Gagal menghapus kontak' }, { status: 500 });
  }
}
