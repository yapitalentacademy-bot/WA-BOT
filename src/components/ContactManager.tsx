'use client';

import React, { useState, useEffect } from 'react';
import { Contact } from '@/types';

interface WaContactItem {
  id: string;
  phone: string;
  name: string;
  source: string;
}

interface WaGroupItem {
  id: string;
  name: string;
  participantsCount: number;
}

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
  const [autoFilledFromWa, setAutoFilledFromWa] = useState(false);

  // WhatsApp Synced Contacts for Auto-fill
  const [waContacts, setWaContacts] = useState<WaContactItem[]>([]);
  const [waContactSearch, setWaContactSearch] = useState('');
  const [loadingWaContacts, setLoadingWaContacts] = useState(false);
  const [showWaDropdown, setShowWaDropdown] = useState(false);

  // WhatsApp Bulk Import from Groups / All
  const [showWaImportModal, setShowWaImportModal] = useState(false);
  const [waGroups, setWaGroups] = useState<WaGroupItem[]>([]);
  const [selectedImportGroupId, setSelectedImportGroupId] = useState('');
  const [customImportTag, setCustomImportTag] = useState('');
  const [importingWa, setImportingWa] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  // Bulk import modal (text/csv)
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

  const fetchWaData = async () => {
    setLoadingWaContacts(true);
    try {
      const [cRes, gRes] = await Promise.all([
        fetch('/api/wa/contacts'),
        fetch('/api/wa/groups'),
      ]);
      const cData = await cRes.json();
      const gData = await gRes.json();

      if (cData?.contacts && Array.isArray(cData.contacts)) {
        setWaContacts(cData.contacts);
      }
      if (gData?.groups && Array.isArray(gData.groups)) {
        setWaGroups(gData.groups);
        if (gData.groups.length > 0 && !selectedImportGroupId) {
          setSelectedImportGroupId(gData.groups[0].id);
          setCustomImportTag(gData.groups[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to load WA contacts or groups:', err);
    } finally {
      setLoadingWaContacts(false);
    }
  };

  useEffect(() => {
    fetchContacts();
    fetchWaData();
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

  // Filtered WA contacts for auto-fill in single contact modal
  const filteredWaSuggestions = waContacts.filter((c) => {
    if (!waContactSearch) return true;
    const q = waContactSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.source.toLowerCase().includes(q);
  }).slice(0, 30); // show top 30 for snappy rendering

  const handleSelectWaContact = (c: WaContactItem) => {
    setName(c.name);
    setPhone(c.phone);
    setGroup(c.source.startsWith('Grup WA: ') ? c.source.replace('Grup WA: ', '') : c.source || 'WhatsApp');
    setAutoFilledFromWa(true);
    setShowWaDropdown(false);
    setWaContactSearch('');
  };

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
      setAutoFilledFromWa(false);
      fetchContacts();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Gagal menambah kontak');
    } finally {
      setSaving(false);
    }
  };

  const handleImportFromWaGroup = async () => {
    if (!selectedImportGroupId) {
      alert('Pilih grup WhatsApp yang ingin diimpor terlebih dahulu');
      return;
    }

    setImportingWa(true);
    setImportProgress('Mengambil daftar peserta dari WhatsApp...');
    try {
      const res = await fetch(`/api/wa/contacts?groupId=${encodeURIComponent(selectedImportGroupId)}`);
      const data = await res.json();
      if (!res.ok || !data.contacts) {
        throw new Error(data.error || 'Gagal mengambil peserta grup');
      }

      const participants = data.contacts as Array<{ phone: string; name: string; groupName: string }>;
      if (participants.length === 0) {
        throw new Error('Tidak ada nomor peserta yang ditemukan dalam grup ini');
      }

      setImportProgress(`Menyimpan ${participants.length} kontak ke buku telepon...`);

      const targetTag = customImportTag.trim() || 'Anggota Grup WA';
      const contactsToSave = participants.map((p) => ({
        phone: p.phone,
        name: p.name,
        group: targetTag,
        notes: `Diimpor otomatis dari grup WA: ${p.groupName}`,
      }));

      const saveRes = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: true, contacts: contactsToSave }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Gagal menyimpan kontak');

      setSuccess(`✅ ${saveData.count || participants.length} kontak anggota grup berhasil diimpor!`);
      setShowWaImportModal(false);
      fetchContacts();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Gagal mengimpor kontak grup');
    } finally {
      setImportingWa(false);
      setImportProgress(null);
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
            Simpan nomor kontak tujuan broadcast, import otomatis dari WA, dan kelompokkan ke dalam grup / tag
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            style={{
              borderColor: 'var(--wa-emerald)',
              color: 'var(--wa-emerald)',
              background: 'rgba(0, 168, 132, 0.12)',
            }}
            onClick={() => {
              fetchWaData();
              setShowWaImportModal(true);
            }}
          >
            ⚡ Impor Otomatis dari WA ({waContacts.length > 0 ? waContacts.length : 'Sinkron'} Kontak)
          </button>
          <button className="btn btn-secondary" onClick={() => setShowBulkModal(true)}>
            📋 Impor CSV/Teks
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setName('');
              setPhone('');
              setGroup('Umum');
              setNotes('');
              setAutoFilledFromWa(false);
              setShowAddModal(true);
            }}
          >
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
            border: '1px solid rgba(34, 197, 94, 0.3)',
            color: '#4ade80',
          }}
        >
          {success}
        </div>
      )}

      {/* FILTER & PENCARIAN */}
      <div
        className="glass-panel"
        style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Cari nama, nomor HP, atau grup kontak..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Filter Grup:</span>
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
          >
            <option value="ALL">Semua Grup ({contacts.length})</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g} ({contacts.filter((c) => c.group === g).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TABEL KONTAK */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nama Lengkap</th>
              <th>Nomor WhatsApp</th>
              <th>Grup / Tag</th>
              <th>Catatan</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                  Memuat data kontak...
                </td>
              </tr>
            ) : filteredContacts.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>
                    Belum Ada Kontak Tersimpan
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
                    Gunakan tombol di atas untuk menambah kontak manual atau impor otomatis dari WhatsApp
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowWaImportModal(true)}
                    >
                      ⚡ Impor dari Grup WA
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowAddModal(true)}
                    >
                      ➕ Tambah Kontak Baru
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredContacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{c.name}</div>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', color: 'var(--wa-emerald)' }}>
                      +{c.phone}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        background: 'rgba(0, 168, 132, 0.12)',
                        color: 'var(--wa-emerald)',
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                    >
                      {c.group || 'Umum'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {c.notes || '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}
                      onClick={() => handleDelete(c.id, c.name)}
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL TAMBAH KONTAK TUNGGAL DENGAN PILIHAN WA OTOMATIS */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3>➕ Tambah Kontak Baru</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>&times;</button>
            </div>

            {/* KOTAK PILIH OTOMATIS DARI WA */}
            <div
              style={{
                background: 'rgba(0, 168, 132, 0.1)',
                border: '1px solid rgba(0, 168, 132, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--wa-emerald)' }}>
                  ⚡ Pilih Otomatis dari Kontak WhatsApp Terhubung
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {waContacts.length} kontak terdeteksi
                </span>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                  placeholder="🔍 Ketik nama atau nomor untuk cari di kontak WA..."
                  value={waContactSearch}
                  onFocus={() => setShowWaDropdown(true)}
                  onChange={(e) => {
                    setWaContactSearch(e.target.value);
                    setShowWaDropdown(true);
                  }}
                />

                {showWaDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: 220,
                      overflowY: 'auto',
                      background: '#111b21',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      zIndex: 50,
                      marginTop: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>Hasil Pencarian Kontak WA ({filteredWaSuggestions.length})</span>
                      <span style={{ cursor: 'pointer', color: '#f87171' }} onClick={() => setShowWaDropdown(false)}>✕ Tutup</span>
                    </div>

                    {filteredWaSuggestions.length === 0 ? (
                      <div style={{ padding: 12, textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Tidak ditemukan kontak WA yang cocok.
                      </div>
                    ) : (
                      filteredWaSuggestions.map((wc, idx) => (
                        <div
                          key={`${wc.phone}-${idx}`}
                          onClick={() => handleSelectWaContact(wc)}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 168, 132, 0.15)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                              {wc.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--wa-emerald)', fontFamily: 'monospace' }}>
                              +{wc.phone}
                            </div>
                          </div>
                          <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 10, color: 'var(--text-dim)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {wc.source}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {autoFilledFromWa && (
                <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#4ade80' }}>
                  ✅ Kolom di bawah berhasil diisi otomatis dari kontak WhatsApp terpilih!
                </div>
              )}
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

      {/* MODAL IMPOR OTOMATIS DARI WHATSAPP (GRUP / BUKU TELEPON) */}
      {showWaImportModal && (
        <div className="modal-overlay" onClick={() => setShowWaImportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div>
                <h3>⚡ Impor Kontak Otomatis dari WhatsApp</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Impor seluruh anggota grup atau kontak terhubung ke buku telepon aplikasi secara instan
                </p>
              </div>
              <button className="close-btn" onClick={() => setShowWaImportModal(false)}>&times;</button>
            </div>

            <div style={{ background: 'var(--bg-input)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 16 }}>
              <label className="form-label" style={{ fontWeight: 600, color: 'var(--wa-emerald)', marginBottom: 6 }}>
                1. Pilih Grup WhatsApp Asal
              </label>
              <select
                className="form-select"
                value={selectedImportGroupId}
                onChange={(e) => {
                  setSelectedImportGroupId(e.target.value);
                  const matched = waGroups.find((g) => g.id === e.target.value);
                  if (matched) setCustomImportTag(matched.name);
                }}
              >
                {waGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.participantsCount} anggota)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                2. Beri Label / Tag untuk Kontak yang Diimpor
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: Peserta Lomba, Siswa Baru, dsb"
                value={customImportTag}
                onChange={(e) => setCustomImportTag(e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Semua anggota grup ini akan otomatis dikelompokkan dalam tag ini.
              </span>
            </div>

            <div
              style={{
                background: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                fontSize: '0.8rem',
                color: '#facc15',
                marginBottom: 20,
              }}
            >
              🛡️ <strong>Anti-Duplikasi:</strong> Sistem akan otomatis melewati nomor yang sudah pernah disimpan di buku telepon, sehingga tidak ada nomor ganda.
            </div>

            {importProgress && (
              <div style={{ textAlign: 'center', marginBottom: 16, color: 'var(--wa-emerald)', fontSize: '0.85rem', fontWeight: 600 }}>
                ⏳ {importProgress}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowWaImportModal(false)}
                disabled={importingWa}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleImportFromWaGroup}
                disabled={importingWa || !selectedImportGroupId}
              >
                {importingWa ? 'Mengimpor...' : '📥 Impor Anggota Grup Ini'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPOR MASSAL MANUAL */}
      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Impor Kontak Massal (Teks / CSV)</h3>
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
