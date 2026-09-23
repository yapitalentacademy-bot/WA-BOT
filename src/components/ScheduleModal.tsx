'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageTemplate, AttachedFile, Contact, ScheduleRepeatType } from '@/types';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialFile?: AttachedFile | null;
}

export default function ScheduleModal({ isOpen, onClose, onSuccess, initialFile }: ScheduleModalProps) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleRepeatType>('once');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [recurringTime, setRecurringTime] = useState('08:00');
  const [recurringDay, setRecurringDay] = useState(1); // Monday

  // Recipients
  const [recipientType, setRecipientType] = useState<'all' | 'group' | 'custom'>('all');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [customPhones, setCustomPhones] = useState('');

  // Templates & Files
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [availableFiles, setAvailableFiles] = useState<AttachedFile[]>([]);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(initialFile || null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [antiBanMin, setAntiBanMin] = useState(3);
  const [antiBanMax, setAntiBanMax] = useState(7);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<string[]>([]);

  // WhatsApp Groups
  const [waGroups, setWaGroups] = useState<{ id: string; name: string; participantsCount: number }[]>([]);
  const [selectedWaGroupIds, setSelectedWaGroupIds] = useState<string[]>([]);
  const [manualWaGroupId, setManualWaGroupId] = useState('');
  const [loadingWaGroups, setLoadingWaGroups] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Set default scheduled time to 10 minutes in the future
      const d = new Date(Date.now() + 10 * 60 * 1000);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      setScheduledDate(`${yyyy}-${mm}-${dd}`);
      setScheduledTime(`${hh}:${min}`);

      // Load templates, files, contacts, and WA groups
      fetchData();
      if (initialFile) {
        setAttachedFile(initialFile);
      }
    }
  }, [isOpen, initialFile]);

  const fetchData = async () => {
    try {
      const [tplRes, filesRes, contactsRes, waGroupsRes] = await Promise.all([
        fetch('/api/templates'),
        fetch('/api/files'),
        fetch('/api/contacts'),
        fetch('/api/wa/groups'),
      ]);
      const [tplData, filesData, contactsData, waGroupsData] = await Promise.all([
        tplRes.json(),
        filesRes.json(),
        contactsRes.json(),
        waGroupsRes.json(),
      ]);

      setTemplates(Array.isArray(tplData) ? tplData : []);
      setAvailableFiles(Array.isArray(filesData) ? filesData : []);
      if (Array.isArray(contactsData)) {
        setContacts(contactsData);
        const uniqueGroups = Array.from(new Set(contactsData.map((c: Contact) => c.group).filter(Boolean))) as string[];
        setGroups(uniqueGroups);
        if (uniqueGroups.length > 0 && !selectedGroup) {
          setSelectedGroup(uniqueGroups[0]);
        }
      }
      if (waGroupsData?.groups && Array.isArray(waGroupsData.groups)) {
        setWaGroups(waGroupsData.groups);
      }
    } catch (err) {
      console.error('Failed to load modal data:', err);
    }
  };

  const handleRefreshWaGroups = async () => {
    setLoadingWaGroups(true);
    try {
      const res = await fetch('/api/wa/groups');
      const data = await res.json();
      if (data?.groups) {
        setWaGroups(data.groups);
      }
    } catch (err) {
      console.error('Failed to refresh groups:', err);
    } finally {
      setLoadingWaGroups(false);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setMessage(tpl.content);
    if (!title) setTitle(tpl.title);
    if (tpl.attachedFileId) {
      const found = availableFiles.find((f) => f.id === tpl.attachedFileId);
      if (found) setAttachedFile(found);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengunggah file');

      setAttachedFile(data.file);
      setAvailableFiles((prev) => [data.file, ...prev]);
    } catch (err: any) {
      setError(err?.message || 'Gagal mengunggah file jadwal');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const insertVariable = (variableName: string) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = message;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newText = `${before}{${variableName}}${after}`;
    setMessage(newText);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + variableName.length + 2, start + variableName.length + 2);
      }
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) {
      setError('Judul jadwal dan isi pesan broadcast wajib diisi');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let combinedIso = new Date().toISOString();
      if (scheduleType === 'once') {
        combinedIso = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      const phonesArray = customPhones
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);

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

      const payload = {
        title,
        message,
        attachedFile,
        recipients: {
          type: recipientType,
          targetGroup: recipientType === 'group' ? selectedGroup : undefined,
          customPhones: recipientType === 'custom' ? phonesArray : undefined,
          targetWaGroups: targetWaGroupsPayload,
        },
        scheduleType,
        scheduledTime: combinedIso,
        recurringTime,
        recurringDay: Number(recurringDay),
        antiBanDelayMin: antiBanMin,
        antiBanDelayMax: antiBanMax,
      };

      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan jadwal');

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan saat menyimpan jadwal');
    } finally {
      setLoading(false);
    }
  };

  // Simulated preview text
  const previewText = (message || 'Pratinjau pesan Anda akan muncul di sini...')
    .replace(/\{nama\}/gi, 'Budi Santoso')
    .replace(/\{jadwal\}/gi, title || 'Jadwal Acara')
    .replace(/\{kegiatan\}/gi, title || 'Kegiatan')
    .replace(/\{waktu\}/gi, recurringTime || scheduledTime || '08:00')
    .replace(/\{tanggal\}/gi, scheduledDate || 'Besok');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 840 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📅</span> Buat Jadwal & Broadcast WhatsApp Otomatis
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Tautkan file jadwal dan template broadcast untuk dibagikan secara otomatis
            </p>
          </div>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              marginBottom: 16,
              fontSize: '0.88rem',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
            {/* LEFT COLUMN: FORM INPUTS */}
            <div>
              {/* 1. Judul Jadwal */}
              <div className="form-group">
                <label className="form-label">Judul Jadwal / Kegiatan *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Misal: Jadwal Kajian Harian, Jadwal Rapat Tim, Flyer Acara"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* 2. Pilih Template Broadcast */}
              <div className="form-group">
                <label className="form-label">
                  Tautkan Template Broadcast (Opsional)
                </label>
                <select
                  className="form-select"
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  defaultValue=""
                >
                  <option value="">-- Pilih Template Tersimpan --</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.title} ({tpl.category || 'Umum'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Tautkan File Jadwal (PDF / Flyer / Dokumen) */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>📎 Tautkan File Jadwal (PDF, Gambar, Excel, Doc)</span>
                  {attachedFile && (
                    <span
                      style={{ color: '#f87171', cursor: 'pointer', fontSize: '0.78rem' }}
                      onClick={() => setAttachedFile(null)}
                    >
                      ✕ Lepas File
                    </span>
                  )}
                </label>

                {attachedFile ? (
                  <div
                    style={{
                      background: 'rgba(0, 168, 132, 0.12)',
                      border: '1px solid rgba(0, 168, 132, 0.35)',
                      borderRadius: 'var(--radius-md)',
                      padding: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div style={{ fontSize: 24 }}>
                      {attachedFile.mimeType.includes('pdf') ? '📄' : attachedFile.mimeType.includes('image') ? '🖼️' : '📁'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {attachedFile.originalName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {(attachedFile.size / 1024).toFixed(1)} KB &bull; Siap dikirimkan bersama caption
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', background: 'var(--wa-emerald)', color: '#0b141a', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                      Terpilih
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                      style={{
                        border: '2px dashed var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: 16,
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'var(--bg-input)',
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <span style={{ fontSize: 24 }}>📤</span>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--wa-emerald)', marginTop: 4 }}>
                        {uploadingFile ? 'Mengunggah file...' : 'Klik untuk Unggah File Jadwal Baru'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
                        Mendukung PDF, flyer gambar JPG/PNG, Excel, atau Dokumen Word
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                      accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx"
                    />

                    {availableFiles.length > 0 && (
                      <select
                        className="form-select"
                        style={{ fontSize: '0.82rem' }}
                        onChange={(e) => {
                          const f = availableFiles.find((file) => file.id === e.target.value);
                          if (f) setAttachedFile(f);
                        }}
                        defaultValue=""
                      >
                        <option value="">Atau pilih dari file yang sudah pernah diunggah ({availableFiles.length} file)...</option>
                        {availableFiles.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.originalName} ({(f.size / 1024).toFixed(1)} KB)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Tipe Pengiriman Jadwal */}
              <div className="form-group">
                <label className="form-label">Frekuensi / Tipe Jadwal</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${scheduleType === 'once' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setScheduleType('once')}
                    style={{ flex: 1 }}
                  >
                    Sekali Kirim
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${scheduleType === 'daily' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setScheduleType('daily')}
                    style={{ flex: 1 }}
                  >
                    Harian (Rutin)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${scheduleType === 'weekly' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setScheduleType('weekly')}
                    style={{ flex: 1 }}
                  >
                    Mingguan
                  </button>
                </div>
              </div>

              {/* Setting Waktu sesuai Tipe */}
              {scheduleType === 'once' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="form-group">
                  <div>
                    <label className="form-label">Tanggal Kirim</label>
                    <input
                      type="date"
                      className="form-input"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Jam Kirim</label>
                    <input
                      type="time"
                      className="form-input"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {scheduleType === 'daily' && (
                <div className="form-group">
                  <label className="form-label">Waktu Pengiriman Harian (Jam : Menit)</label>
                  <input
                    type="time"
                    className="form-input"
                    value={recurringTime}
                    onChange={(e) => setRecurringTime(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Pesan akan otomatis dibagikan setiap hari pada jam ini.
                  </span>
                </div>
              )}

              {scheduleType === 'weekly' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="form-group">
                  <div>
                    <label className="form-label">Hari Pengiriman</label>
                    <select
                      className="form-select"
                      value={recurringDay}
                      onChange={(e) => setRecurringDay(Number(e.target.value))}
                    >
                      <option value={1}>Senin</option>
                      <option value={2}>Selasa</option>
                      <option value={3}>Rabu</option>
                      <option value={4}>Kamis</option>
                      <option value={5}>Jumat</option>
                      <option value={6}>Sabtu</option>
                      <option value={0}>Minggu</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Jam Kirim</label>
                    <input
                      type="time"
                      className="form-input"
                      value={recurringTime}
                      onChange={(e) => setRecurringTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* 5. Penerima Pesan */}
              <div className="form-group">
                <label className="form-label">Penerima Pesan</label>
                <select
                  className="form-select"
                  value={recipientType}
                  onChange={(e) => setRecipientType(e.target.value as any)}
                >
                  <option value="all">Semua Kontak ({contacts.length} orang)</option>
                  <option value="group">Berdasarkan Tag / Kategori Kontak</option>
                  <option value="wa_group">👥 Grup WhatsApp ({waGroups.length} grup terdeteksi)</option>
                  <option value="custom">Input Nomor Manual</option>
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
                      onClick={handleRefreshWaGroups}
                      disabled={loadingWaGroups}
                    >
                      {loadingWaGroups ? 'Memuat...' : '🔄 Sinkronkan Grup'}
                    </button>
                  </div>

                  {waGroups.length === 0 ? (
                    <div style={{ padding: '10px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Belum ada grup terdeteksi. Pastikan akun WhatsApp Anda sudah terhubung di dashboard, lalu klik <strong>Sinkronkan Grup</strong> di atas.
                    </div>
                  ) : (
                    <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                                {g.participantsCount} anggota &bull; ID: {g.id.split('@')[0]}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>
                      Atau Masukkan Group ID Manual (Opsional, contoh: 120363025283921829@g.us):
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                      placeholder="Contoh: 120363025283921829@g.us"
                      value={manualWaGroupId}
                      onChange={(e) => setManualWaGroupId(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {recipientType === 'group' && (
                <div className="form-group">
                  <label className="form-label">Pilih Grup Kontak</label>
                  <select
                    className="form-select"
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                  >
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g} ({contacts.filter((c) => c.group === g).length} kontak)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {recipientType === 'custom' && (
                <div className="form-group">
                  <label className="form-label">Daftar Nomor WhatsApp (Satu nomor per baris)</label>
                  <textarea
                    className="form-textarea"
                    placeholder="081234567890&#10;089876543210"
                    value={customPhones}
                    onChange={(e) => setCustomPhones(e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              {/* Anti-Ban Delay Config */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="form-group">
                <div>
                  <label className="form-label">Jeda Minimum (detik)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    className="form-input"
                    value={antiBanMin}
                    onChange={(e) => setAntiBanMin(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="form-label">Jeda Maksimum (detik)</label>
                  <input
                    type="number"
                    min={2}
                    max={120}
                    className="form-input"
                    value={antiBanMax}
                    onChange={(e) => setAntiBanMax(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: MESSAGE EDITOR & LIVE PREVIEW */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Message Editor */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Isi Pesan Broadcast / Caption File *
                  </label>
                </div>

                {/* Variable helper chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', alignSelf: 'center' }}>
                    Variabel:
                  </span>
                  {['nama', 'jadwal', 'waktu', 'tanggal', 'kegiatan'].map((varName) => (
                    <button
                      key={varName}
                      type="button"
                      className="chip"
                      onClick={() => insertVariable(varName)}
                    >
                      +{`{${varName}}`}
                    </button>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  className="form-textarea"
                  style={{ minHeight: 140 }}
                  placeholder="Ketik pesan broadcast Anda di sini..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                />
              </div>

              {/* WhatsApp Live Simulator Preview */}
              <div>
                <label className="form-label">Simulasi Tampilan di WhatsApp Penerima:</label>
                <div className="wa-chat-preview">
                  <div className="chat-bubble">
                    {/* Simulated Attached File */}
                    {attachedFile && (
                      <div className="chat-bubble-attachment">
                        <div className="attachment-icon">
                          {attachedFile.mimeType.includes('pdf') ? '📕' : attachedFile.mimeType.includes('image') ? '🖼️' : '📄'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {attachedFile.originalName}
                          </div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                            {(attachedFile.size / 1024).toFixed(1)} KB &bull; {attachedFile.mimeType.split('/')[1]?.toUpperCase()}
                          </div>
                        </div>
                        <span style={{ fontSize: '0.9rem' }}>⬇️</span>
                      </div>
                    )}

                    {/* Text content */}
                    <div>{previewText}</div>

                    {/* Metadata */}
                    <div className="chat-bubble-meta">
                      <span>{recurringTime || scheduledTime || '10:30'}</span>
                      <span style={{ color: '#53bdeb' }}>✓✓</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ACTIONS */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Menyimpan...' : '✅ Simpan & Aktifkan Jadwal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
