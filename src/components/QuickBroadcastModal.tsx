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
  const [recipientType, setRecipientType] = useState<'all' | 'group' | 'custom' | 'wa_group'>('wa_group');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [customPhones, setCustomPhones] = useState('');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [waGroups, setWaGroups] = useState<{ id: string; name: string; participantsCount: number }[]>([]);
  const [selectedWaGroupIds, setSelectedWaGroupIds] = useState<string[]>([]);
  const [manualWaGroupId, setManualWaGroupId] = useState('');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(initialFile || null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialFile) setAttachedFile(initialFile);
      Promise.all([
        fetch('/api/contacts').then((res) => res.json()),
        fetch('/api/wa/groups').then((res) => res.json()),
      ]).then(([contactsData, waGroupsData]) => {
        if (Array.isArray(contactsData)) {
          setContacts(contactsData);
          const uGroups = Array.from(new Set(contactsData.map((c: Contact) => c.group).filter(Boolean))) as string[];
          setGroups(uGroups);
          if (uGroups.length > 0) setSelectedGroup(uGroups[0]);
        }
        if (waGroupsData?.groups && Array.isArray(waGroupsData.groups)) {
          setWaGroups(waGroupsData.groups);
        }
      });
    }
  }, [isOpen, initialFile]);

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

      const res = await fetch('/api/broadcast/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          attachedFile,
          recipients: {
            type: recipientType,
            targetGroup: recipientType === 'group' ? selectedGroup : undefined,
            customPhones: recipientType === 'custom' ? phones : undefined,
            targetWaGroups: targetWaGroupsPayload,
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
              <option value="wa_group">👥 Grup WhatsApp ({waGroups.length} grup terdeteksi)</option>
              <option value="all">📱 Semua Kontak Buku Telepon ({contacts.length} kontak)</option>
              <option value="group">🏷️ Kategori Kontak Buku Telepon</option>
              <option value="custom">✍️ Input Nomor Manual</option>
            </select>
          </div>

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
              <label className="form-label">Nomor WhatsApp (Satu per baris)</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="081234567890&#10;089876543210"
                value={customPhones}
                onChange={(e) => setCustomPhones(e.target.value)}
              />
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
