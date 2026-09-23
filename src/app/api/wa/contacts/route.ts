import { NextResponse } from 'next/server';
import { getWhatsAppContacts, getWhatsAppGroupParticipants, getWhatsAppStatus } from '@/lib/whatsapp';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get('groupId');

    const status = await getWhatsAppStatus();
    if (status.status !== 'connected') {
      return NextResponse.json({
        connected: false,
        contacts: [],
        message: 'WhatsApp belum terhubung. Hubungkan WA di dashboard terlebih dahulu.',
      });
    }

    if (groupId) {
      const participants = await getWhatsAppGroupParticipants(groupId);
      return NextResponse.json({
        connected: true,
        groupId,
        contacts: participants,
        count: participants.length,
      });
    }

    const contacts = await getWhatsAppContacts();
    return NextResponse.json({
      connected: true,
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
