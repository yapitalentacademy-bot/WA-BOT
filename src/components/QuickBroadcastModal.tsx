'use client';

import React, { useState, useEffect } from 'react';
import { AttachedFile, Contact } from '@/types';

interface QuickBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialFile?: AttachedFile | null;
}

export default function QuickBroadcastModal({
  isOpen,
  onClose,
  onSuccess,
  initialFile,
}: QuickBroadcastModalProps) {
  const [title, setTitle] = useState('Broadcast Langsung');
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState<'all' | 'group' | 'custom' | 'wa_group' | 'contacts'>('contacts');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [customPhones, setCustomPhones] = useState('');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [waGroups, setWaGroups] = useState<{ id: string; name: string; participantsCount: number }[]>([]);
  const [selectedWaGroupIds, setSelectedWaGroupIds] = useState<string[]>([]);
  const [manualWaGroupId, setManualWaGroupId] = useState('');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(initialFile || null);

  const [availableContacts, setAvailableContacts] = useState<{ id: string; name: string; phone: string; source: string }[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<{ name: string; phone: string }[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');

  // Multi-Account Sender
  const [senderAccountId, setSenderAccountId] = useState<string>('rotation');
  const [connectedAccounts, setConnectedAccounts] = useState<{ id: string; label: string; phone?: string; status: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialFile) setAttachedFile(initialFile);
      setSenderAccountId('rotation');
      Promise.all([
        fetch('/api/contacts').then((res) => res.json()),
        fetch('/api/wa/groups').then((res) => res.json()),
        fetch('/api/wa/contacts').then((res) => res.json()),
        fetch('/api/wa/status').then((res) => res.json()),
      ]).then(([contactsData, waGroupsData, waContactsData, waStatusData]) => {
        if (waStatusData?.accounts && Array.isArray(waStatusData.accounts)) {
          setConnectedAccounts(
            waStatusData.accounts
              .filter((a: any) => a.status === 'connected')
              .map((a: any) => ({
                id: a.id,
                label: a.label,
                phone: a.userInfo?.id ? a.userInfo.id.split('@')[0].split(':')[0] : undefined,
                status: a.status,
              }))
          );
        }
        if (Array.isArray(contactsData)) {
          setContacts(contactsData);
          const uGroups = Array.from(new Set(contactsData.map((c: Contact) => c.group).filter(Boolean))) as string[];
          setGroups(uGroups);
          if (uGroups.length > 0) setSelectedGroup(uGroups[0]);
        }
        if (waGroupsData?.groups && Array.isArray(waGroupsData.groups)) {
          setWaGroups(waGroupsData.groups);
        }

        // Combine contacts
        const combined: { id: string; name: string; phone: string; source: string }[] = [];
        const seenPhones = new Set<string>();

        if (Array.isArray(contactsData)) {
          for (const c of contactsData) {
            if (c.phone && !seenPhones.has(c.phone)) {
              seenPhones.add(c.phone);
              combined.push({
                id: c.id,
                name: c.name || 'Kontak',
                phone: c.phone,
                source: c.group ? `Kategori: ${c.group}` : 'Buku Telepon',
              });
            }
          }
        }

        if (waContactsData?.contacts && Array.isArray(waContactsData.contacts)) {
          for (const c of waContactsData.contacts) {
            if (c.phone && !seenPhones.has(c.phone)) {
              seenPhones.add(c.phone);
              combined.push({
                id: c.id || c.phone,
                name: c.name || c.phone,
                phone: c.phone,
                source: c.source || 'WhatsApp',
              });
            }
          }
        }

        setAvailableContacts(combined);
      });
    }
  }, [isOpen, initialFile]);

  const filteredContacts = availableContacts.filter((c) => {
    if (!contactSearchQuery.trim()) return true;
    const q = contactSearchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.source.toLowerCase().includes(q);
  });

  const isContactSelected = (phone: string) => {
    return selectedContacts.some((c) => c.phone === phone);
  };

  const toggleContactSelection = (contact: { name: string; phone: string }) => {
    setSelectedContacts((prev) => {
      const exists = prev.some((c) => c.phone === contact.phone);
      if (exists) {
        return prev.filter((c) => c.phone !== contact.phone);
      } else {
        return [...prev, { name: contact.name, phone: contact.phone }];
      }
    });
  };

  const handleSelectAllFilteredContacts = () => {
    const map = new Map<string, { name: string; phone: string }>();
    selectedContacts.forEach((c) => map.set(c.phone, c));
    filteredContacts.forEach((c) => map.set(c.phone, { name: c.name, phone: c.phone }));
    setSelectedContacts(Array.from(map.values()));
  };

  const handleClearAllContacts = () => {
    setSelectedContacts([]);
  };

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message && !attachedFile) {
      setError('Pesan atau file lampiran wajib ada');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const phones = customPhones.split('\n').map((p) => p.trim()).filter(Boolean);

      let targetWaGroupsPayload: { id: string; name: string }[] | undefined = undefined;
      if (recipientType === 'wa_group') {
        const groupsFromChecklist = selectedWaGroupIds.map((id) => {
          const match = waGroups.find((g) => g.id === id);
          return { id, name: match ? match.name : 'Grup WA' };
        });
        const manualGroups = manualWaGroupId
          .split('\n')
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => ({
            id: id.endsWith('@g.us') ? id : `${id}@g.us`,
            name: 'Grup Manual',
          }));

        targetWaGroupsPayload = [...groupsFromChecklist, ...manualGroups];
        if (targetWaGroupsPayload.length === 0) {
          setError('Pilih minimal 1 grup WhatsApp atau masukkan ID grup');
          setLoading(false);
          return;
        }
      }

      let selectedContactsPayload: { name: string; phone: string }[] | undefined = undefined;
      if (recipientType === 'contacts') {
        if (selectedContacts.length === 0) {
          setError('Pilih minimal 1 nama kontak penerima pesan');
          setLoading(false);
          return;
        }
        selectedContactsPayload = selectedContacts;
      }

      const res = await fetch('/api/broadcast/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          attachedFile,
          recipients: {
            type: recipientType,
            senderAccountId,
            targetGroup: recipientType === 'group' ? selectedGroup : undefined,
            customPhones: recipientType === 'custom' ? phones : undefined,
            targetWaGroups: targetWaGroupsPayload,
            selectedContacts: selectedContactsPayload,
          },
          antiBanDelayMin: 3,
          antiBanDelayMax: 6,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim broadcast');

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Gagal memulai broadcast');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>🚀 Kirim Broadcast WhatsApp Sekarang</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Kirim teks dan file lampiran ke kontak saat ini juga dengan proteksi jeda anti-ban
            </p>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {error && (
          <div style={{ color: '#f87171', marginBottom: 12, fontSize: '0.85rem' }}>{error}</div>
        )}

        <form onSubmit={handleSend}>
          <div className="form-group">
            <label className="form-label">Judul Pesan</label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Pilihan Akun WhatsApp Pengirim */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Akun WhatsApp Pengirim</span>
              {connectedAccounts.length > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--wa-emerald)', fontWeight: 600 }}>
                  ✨ {connectedAccounts.length} Akun Terhubung
                </span>
              )}
            </label>
            <select
              className="form-select"
              value={senderAccountId}
              onChange={(e) => setSenderAccountId(e.target.value)}
            >
              <option value="rotation">
                🔄 Rotasi Otomatis ({connectedAccounts.length > 0 ? `Bagi Beban ke ${connectedAccounts.length} Akun Aktif` : 'Semua Akun Aktif'}) - Paling Aman
              </option>
              {connectedAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  📱 {acc.label} {acc.phone ? `(+${acc.phone})` : ''}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', marginTop: 4 }}>
              Pilih satu nomor akun tertentu atau biarkan <strong>Rotasi Otomatis</strong> untuk membagi pengiriman pesan ke nomor-nomor yang aktif secara bergantian.
            </div>
          </div>

          {attachedFile && (
            <div
              style={{
                background: 'rgba(0, 168, 132, 0.12)',
                border: '1px solid rgba(0, 168, 132, 0.35)',
                borderRadius: 'var(--radius-md)',
                padding: 10,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📎</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{attachedFile.originalName}</span>
              </div>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                ✕ Hapus
              </button>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Target Penerima</label>
            <select
              className="form-select"
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value as any)}
            >
              <option value="contacts">👤 Pilih Nama Kontak ({availableContacts.length} kontak terdeteksi)</option>
              <option value="wa_group">👥 Grup WhatsApp ({waGroups.length} grup terdeteksi)</option>
              <option value="all">📱 Semua Kontak Buku Telepon ({contacts.length} kontak)</option>
              <option value="group">🏷️ Kategori Kontak Buku Telepon</option>
              <option value="custom">✍️ Input Nomor Manual</option>
            </select>
          </div>

          {recipientType === 'contacts' && (
            <div className="form-group" style={{ background: 'var(--bg-input)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--wa-emerald)' }}>
                    Pilih Nama Kontak
                  </span>
                  <span style={{ fontSize: '0.75rem', background: selectedContacts.length > 0 ? 'var(--wa-teal)' : 'rgba(255,255,255,0.08)', color: '#fff', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                    {selectedContacts.length} dipilih
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                    onClick={handleSelectAllFilteredContacts}
                  >
                    ✓ Pilih Semua ({filteredContacts.length})
                  </button>
                  {selectedContacts.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '3px 8px', fontSize: '0.74rem', color: 'var(--error)' }}
                      onClick={handleClearAllContacts}
                    >
                      ✕ Batal Semua
                    </button>
                  )}
                </div>
              </div>

              {/* Search bar */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontSize: '0.82rem', padding: '7px 28px 7px 10px' }}
                  placeholder="🔍 Cari nama kontak, nomor telepon, atau kategori..."
                  value={contactSearchQuery}
                  onChange={(e) => setContactSearchQuery(e.target.value)}
                />
                {contactSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setContactSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Contact List */}
              {availableContacts.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Memuat daftar kontak... Pastikan WhatsApp sudah terhubung di dashboard.
                </div>
              ) : filteredContacts.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Tidak ada kontak yang cocok dengan &quot;{contactSearchQuery}&quot;
                </div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
                  {filteredContacts.map((c) => {
                    const selected = isContactSelected(c.phone);
                    const initial = (c.name || 'K').trim().charAt(0).toUpperCase();
                    return (
                      <div
                        key={c.id || c.phone}
                        onClick={() => toggleContactSelection({ name: c.name, phone: c.phone })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '7px 10px',
                          borderRadius: 'var(--radius-sm)',
                          background: selected ? 'rgba(0, 168, 132, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                          cursor: 'pointer',
                          border: selected ? '1px solid var(--wa-emerald)' : '1px solid transparent',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {}} // Handled by row onClick
                          style={{ cursor: 'pointer' }}
                        />
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: selected ? 'var(--wa-teal)' : 'rgba(255,255,255,0.1)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {initial}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)' }}>
                            {c.phone}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                        >
                          {c.source}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {recipientType === 'wa_group' && (
            <div className="form-group" style={{ background: 'var(--bg-input)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="form-label" style={{ marginBottom: 0, fontWeight: 600, color: 'var(--wa-emerald)' }}>
                  Pilih Grup WhatsApp Tujuan ({selectedWaGroupIds.length} dipilih)
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/wa/groups');
                      const data = await res.json();
                      if (data.groups) setWaGroups(data.groups);
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                >
                  🔄 Segarkan Grup
                </button>
              </div>

              {waGroups.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '6px 0' }}>
                  Belum ada grup terdeteksi. Pastikan WhatsApp sudah terhubung di dashboard, lalu klik <strong>Segarkan Grup</strong> di atas.
                </div>
              ) : (
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {waGroups.map((g) => {
                    const isChecked = selectedWaGroupIds.includes(g.id);
                    return (
                      <label
                        key={g.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          background: isChecked ? 'rgba(0, 168, 132, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          border: isChecked ? '1px solid var(--wa-emerald)' : '1px solid transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedWaGroupIds((prev) => [...prev, g.id]);
                            } else {
                              setSelectedWaGroupIds((prev) => prev.filter((id) => id !== g.id));
                            }
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {g.name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                            {g.participantsCount} anggota
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>
                  Atau Masukkan Group ID Manual (contoh: 120363025283921829@g.us):
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                  placeholder="120363025283921829@g.us"
                  value={manualWaGroupId}
                  onChange={(e) => setManualWaGroupId(e.target.value)}
                />
              </div>
            </div>
          )}

          {recipientType === 'group' && (
            <div className="form-group">
              <label className="form-label">Pilih Kategori Kontak Buku Telepon</label>
              {groups.length === 0 ? (
                <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', fontSize: '0.82rem', color: '#facc15' }}>
                  ⚠️ Belum ada kategori di buku kontak internal.
                  <div style={{ marginTop: 6 }}>
                    Jika ingin mengirim ke <strong>Grup WhatsApp</strong>, pilih opsi <strong>👥 Grup WhatsApp</strong> di dropdown atas.
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => setRecipientType('wa_group')}
                  >
                    Beralih ke 👥 Grup WhatsApp
                  </button>
                </div>
              ) : (
                <select
                  className="form-select"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                >
                  {groups.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {recipientType === 'custom' && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Nomor WhatsApp (Satu per baris)
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '2px 8px', fontSize: '0.72rem', color: 'var(--wa-emerald)' }}
                  onClick={() => setRecipientType('contacts')}
                >
                  👤 Pilih dari Nama Kontak
                </button>
              </div>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="081234567890&#10;089876543210"
                value={customPhones}
                onChange={(e) => setCustomPhones(e.target.value)}
              />
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                💡 Tips: Lebih mudah memilih nama kontak langsung? Klik tombol <strong>👤 Pilih dari Nama Kontak</strong> di atas.
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Isi Pesan Broadcast</label>
            <textarea
              className="form-textarea"
              rows={4}
              placeholder="Halo {nama}, berikut informasi untuk Anda..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Mengirim...' : '🚀 Mulai Kirim Broadcast'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
