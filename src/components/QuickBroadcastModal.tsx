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
  const [recipientType, setRecipientType] = useState<'all' | 'group' | 'custom'>('all');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [customPhones, setCustomPhones] = useState('');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(initialFile || null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialFile) setAttachedFile(initialFile);
      fetch('/api/contacts')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setContacts(data);
            const uGroups = Array.from(new Set(data.map((c: Contact) => c.group).filter(Boolean))) as string[];
            setGroups(uGroups);
            if (uGroups.length > 0) setSelectedGroup(uGroups[0]);
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
              <option value="all">Semua Kontak ({contacts.length})</option>
              <option value="group">Grup Kontak Tertentu</option>
              <option value="custom">Input Nomor Manual</option>
            </select>
          </div>

          {recipientType === 'group' && (
            <div className="form-group">
              <label className="form-label">Pilih Grup</label>
              <select
                className="form-select"
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
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
