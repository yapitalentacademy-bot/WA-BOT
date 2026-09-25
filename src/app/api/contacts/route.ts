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
      const existingMap = new Map<string, Contact>();
      const currentList = Storage.getContacts();

      for (const c of currentList) {
        if (c.phone) existingMap.set(c.phone, c);
      }

      let addedCount = 0;
      let updatedCount = 0;

      for (const item of body.contacts) {
        if (!item.phone) continue;
        const phone = cleanPhoneNumber(item.phone);
        if (!phone) continue;

        const existingContact = existingMap.get(phone);
        const isPlaceholderName = (n?: string) => !n || n.startsWith('Anggota (') || n.startsWith('Peserta ');

        if (existingContact) {
          // Update existing contact if new name is better or group is set
          let updated = false;
          if (item.name && item.name !== existingContact.name && (isPlaceholderName(existingContact.name) || !isPlaceholderName(item.name))) {
            existingContact.name = item.name;
            updated = true;
          }
          if (item.group && item.group !== 'Umum') {
            existingContact.group = item.group;
            updated = true;
          }
          if (item.notes) {
            existingContact.notes = item.notes;
            updated = true;
          }
          if (updated) updatedCount++;
        } else {
          const newC: Contact = {
            id: `c-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: item.name || 'Kontak',
            phone,
            group: item.group || 'Umum',
            notes: item.notes || '',
            createdAt: new Date().toISOString(),
          };
          existingMap.set(phone, newC);
          addedCount++;
        }
      }

      const finalList = Array.from(existingMap.values());
      Storage.saveContacts(finalList);
      return NextResponse.json({
        success: true,
        message: `${addedCount} kontak baru ditambahkan, ${updatedCount} kontak diperbarui!`,
        count: addedCount + updatedCount,
      });
    }

    // Single contact
    if (!body.phone) {
      return NextResponse.json({ error: 'Nomor telepon wajib diisi' }, { status: 400 });
    }

    const phone = cleanPhoneNumber(body.phone);
    const existing = Storage.getContacts();
    const existingIndex = existing.findIndex((c) => c.phone === phone);

    if (existingIndex !== -1) {
      existing[existingIndex] = {
        ...existing[existingIndex],
        name: body.name || existing[existingIndex].name,
        group: body.group || existing[existingIndex].group,
        notes: body.notes || existing[existingIndex].notes,
      };
      Storage.saveContacts(existing);
      return NextResponse.json({ success: true, contact: existing[existingIndex], message: 'Kontak berhasil diperbarui' });
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
    const clearAll = searchParams.get('clearAll');

    if (clearAll === 'true') {
      Storage.saveContacts([]);
      return NextResponse.json({ success: true, message: 'Semua kontak berhasil dibersihkan' });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID kontak wajib disertakan' }, { status: 400 });
    }
    Storage.deleteContact(id);
    return NextResponse.json({ success: true, message: 'Kontak berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Gagal menghapus kontak' }, { status: 500 });
  }
}
