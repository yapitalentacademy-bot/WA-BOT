'use client';

import React, { useState, useEffect } from 'react';
import { Contact } from '@/types';

export default function ContactManager() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');

  // Single contact modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [group, setGroup] = useState('Umum');
  const [notes, setNotes] = useState('');

  // Bulk import modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState(
    '081234567890, Budi Santoso, Siswa\n089876543210, Siti Rahma, Guru\n085712345678, Ahmad Fauzi, Karyawan'
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const groups = Array.from(new Set(contacts.map((c) => c.group || 'Umum'))).filter(Boolean);

  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.group && c.group.toLowerCase().includes(search.toLowerCase()));

    const matchesGroup = selectedGroup === 'ALL' || c.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, group, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan kontak');

      setSuccess('Kontak berhasil ditambahkan!');
      setShowAddModal(false);
      setName('');
      setPhone('');
      setNotes('');
      fetchContacts();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Gagal menambah kontak');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkImport = async () => {
    setSaving(true);
    setError(null);

    try {
      const lines = bulkText.split('\n').filter((l) => l.trim().length > 0);
      const parsed = lines.map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          phone: parts[0] || '',
          name: parts[1] || 'Kontak',
          group: parts[2] || 'Umum',
        };
      });

      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: true, contacts: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengimpor kontak');

      setSuccess(data.message || 'Kontak berhasil diimpor!');
      setShowBulkModal(false);
      fetchContacts();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Gagal mengimpor kontak');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus kontak "${name}"?`)) return;

    try {
      const res = await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchContacts();
    } catch (err: any) {
      alert(err?.message || 'Gagal menghapus kontak');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>👥 Pengelola Kontak & Grup WhatsApp</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Simpan nomor kontak tujuan broadcast, kelompokkan ke dalam grup / tag
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowBulkModal(true)}>
            📥 Impor Massal (CSV/Teks)
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            ➕ Tambah Kontak
          </button>
        </div>
      </div>

      {success && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
            fontSize: '0.88rem',
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#4ade80',
            border: '1px solid rgba(34, 197, 94, 0.3)',
          }}
        >
          {success}
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Cari nama, nomor WA, atau grup..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ minWidth: 180 }}>
            <select
              className="form-select"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="ALL">Semua Grup ({contacts.length})</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  Grup: {g} ({contacts.filter((c) => c.group === g).length})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Memuat kontak...
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Tidak ada kontak yang cocok dengan pencarian.
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Nama Kontak</th>
                <th>Nomor WhatsApp</th>
                <th>Grup</th>
                <th>Catatan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>
                    <span style={{ color: 'var(--wa-emerald)', fontFamily: 'monospace' }}>
                      +{c.phone}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        background: 'rgba(0, 168, 132, 0.15)',
                        color: 'var(--wa-emerald)',
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      {c.group || 'Umum'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {c.notes || '-'}
                  </td>
                  <td>
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#f87171',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                      }}
                    >
                      🗑️ Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL TAMBAH KONTAK TUNGGAL */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>➕ Tambah Kontak Baru</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>&times;</button>
            </div>

            {error && (
              <div style={{ color: '#f87171', marginBottom: 12, fontSize: '0.85rem' }}>{error}</div>
            )}

            <form onSubmit={handleAddSingle}>
              <div className="form-group">
                <label className="form-label">Nama Kontak</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Budi Santoso"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nomor WhatsApp</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: 081234567890 atau 6281234567890"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Grup / Tag</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Siswa, Karyawan, Peserta Webinar"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Keterangan singkat..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan Kontak'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPOR MASSAL */}
      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📥 Impor Kontak Massal</h3>
              <button className="close-btn" onClick={() => setShowBulkModal(false)}>&times;</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
              Salin dan tempel daftar nomor kontak Anda di bawah ini. Satu baris per kontak:
              <br />
              Format: <code>Nomor_WA, Nama_Lengkap, Grup</code>
            </p>

            <div className="form-group">
              <textarea
                className="form-textarea"
                rows={8}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>
                Batal
              </button>
              <button className="btn btn-primary" onClick={handleBulkImport} disabled={saving}>
                {saving ? 'Mengimpor...' : '🚀 Mulai Impor Kontak'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
