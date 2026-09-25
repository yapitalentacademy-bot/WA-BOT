import { NextResponse } from 'next/server';
import {
  getWhatsAppContacts,
  getWhatsAppGroupParticipants,
  getWhatsAppStatus,
  resyncWhatsAppContacts,
} from '@/lib/whatsapp';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get('groupId');
    const accountId = searchParams.get('accountId') || undefined;
    const action = searchParams.get('action');

    if (action === 'resync' || action === 'sync') {
      const resyncResult = await resyncWhatsAppContacts(accountId);
      const contacts = await getWhatsAppContacts(accountId);
      return NextResponse.json({
        success: true,
        connected: true,
        message: resyncResult.message,
        contacts,
        count: contacts.length,
      });
    }

    if (groupId) {
      const participants = await getWhatsAppGroupParticipants(groupId, accountId);
      return NextResponse.json({
        connected: true,
        groupId,
        contacts: participants,
        count: participants.length,
      });
    }

    const contacts = await getWhatsAppContacts(accountId);
    const status = await getWhatsAppStatus(accountId);

    return NextResponse.json({
      connected: status.connectedCount > 0,
      contacts,
      count: contacts.length,
    });
  } catch (error: any) {
    console.error('Error fetching WhatsApp contacts:', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal mengambil kontak WhatsApp', contacts: [], connected: false },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, accountId } = body || {};

    if (action === 'resync' || action === 'sync') {
      const resyncResult = await resyncWhatsAppContacts(accountId);
      const contacts = await getWhatsAppContacts(accountId);
      return NextResponse.json({
        success: true,
        message: resyncResult.message,
        contacts,
        count: contacts.length,
      });
    }

    return NextResponse.json({ error: 'Aksi tidak valid' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in POST /api/wa/contacts:', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal memproses permintaan kontak' },
      { status: 500 }
    );
  }
}
