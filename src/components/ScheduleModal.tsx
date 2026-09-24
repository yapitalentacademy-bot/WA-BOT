'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageTemplate, AttachedFile, Contact, ScheduleRepeatType, BroadcastSchedule } from '@/types';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialFile?: AttachedFile | null;
  editingSchedule?: BroadcastSchedule | null;
}

export default function ScheduleModal({ isOpen, onClose, onSuccess, initialFile, editingSchedule }: ScheduleModalProps) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleRepeatType>('once');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [recurringTime, setRecurringTime] = useState('08:00');
  const [recurringDay, setRecurringDay] = useState(1); // Monday

  // Recipients
  const [recipientType, setRecipientType] = useState<'all' | 'group' | 'custom' | 'wa_group' | 'contacts'>('contacts');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [customPhones, setCustomPhones] = useState('');
  const [availableContacts, setAvailableContacts] = useState<{ id: string; name: string; phone: string; source: string }[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<{ name: string; phone: string }[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');

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

  // Multi-Account Sender
  const [senderAccountId, setSenderAccountId] = useState<string>('rotation');
  const [connectedAccounts, setConnectedAccounts] = useState<{ id: string; label: string; phone?: string; status: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchData();

      if (editingSchedule) {
        setTitle(editingSchedule.title);
        setMessage(editingSchedule.message);
        setScheduleType(editingSchedule.scheduleType);
        if (editingSchedule.scheduleType === 'once') {
          const d = new Date(editingSchedule.scheduledTime);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          setScheduledDate(`${yyyy}-${mm}-${dd}`);
          setScheduledTime(`${hh}:${min}`);
        }
        if (editingSchedule.recurringTime) {
          setRecurringTime(editingSchedule.recurringTime);
        }
        if (editingSchedule.recurringDay !== undefined) {
          setRecurringDay(editingSchedule.recurringDay);
        }
        setAttachedFile(editingSchedule.attachedFile || null);
        setAntiBanMin(editingSchedule.antiBanDelayMin || 3);
        setAntiBanMax(editingSchedule.antiBanDelayMax || 7);

        // Recipients
        const rType = editingSchedule.recipients?.type || 'contacts';
        setRecipientType(rType);
        setSenderAccountId(editingSchedule.recipients?.senderAccountId || 'rotation');
        if (rType === 'contacts') {
          setSelectedContacts(editingSchedule.recipients?.selectedContacts || []);
        } else if (rType === 'wa_group') {
          setSelectedWaGroupIds(editingSchedule.recipients.targetWaGroups?.map((g) => g.id) || []);
        } else if (rType === 'group') {
          setSelectedGroup(editingSchedule.recipients.targetGroup || '');
        } else if (rType === 'custom') {
          setCustomPhones((editingSchedule.recipients.customPhones || []).join('\n'));
        }
      } else {
        // Default new schedule
        setTitle('');
        setMessage('');
        setScheduleType('once');
        setSenderAccountId('rotation');
        const d = new Date(Date.now() + 10 * 60 * 1000);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        setScheduledDate(`${yyyy}-${mm}-${dd}`);
        setScheduledTime(`${hh}:${min}`);
        setRecurringTime('08:00');
        setRecurringDay(1);
        setRecipientType('contacts');
        setSelectedContacts([]);
        setSelectedWaGroupIds([]);
        setCustomPhones('');
        setContactSearchQuery('');
        setAttachedFile(initialFile || null);
      }
    }
  }, [isOpen, initialFile, editingSchedule]);

  const fetchData = async () => {
    try {
      const [tplRes, filesRes, contactsRes, waGroupsRes, waContactsRes, waStatusRes] = await Promise.all([
        fetch('/api/templates'),
        fetch('/api/files'),
        fetch('/api/contacts'),
        fetch('/api/wa/groups'),
        fetch('/api/wa/contacts'),
        fetch('/api/wa/status'),
      ]);
      const [tplData, filesData, contactsData, waGroupsData, waContactsData, waStatusData] = await Promise.all([
        tplRes.json(),
        filesRes.json(),
        contactsRes.json(),
        waGroupsRes.json(),
        waContactsRes.json(),
        waStatusRes.json(),
      ]);

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

      // Combine contacts for name picker
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

      let selectedContactsPayload: { name: string; phone: string }[] | undefined = undefined;
      if (recipientType === 'contacts') {
        if (selectedContacts.length === 0) {
          setError('Pilih minimal 1 nama kontak penerima pesan');
          setLoading(false);
          return;
        }
        selectedContactsPayload = selectedContacts;
      }

      const payload = {
        title,
        message,
        attachedFile,
        recipients: {
          type: recipientType,
          senderAccountId,
          targetGroup: recipientType === 'group' ? selectedGroup : undefined,
          customPhones: recipientType === 'custom' ? phonesArray : undefined,
          targetWaGroups: targetWaGroupsPayload,
          selectedContacts: selectedContactsPayload,
        },
        scheduleType,
        scheduledTime: combinedIso,
        recurringTime,
        recurringDay: Number(recurringDay),
        antiBanDelayMin: antiBanMin,
        antiBanDelayMax: antiBanMax,
      };

      const url = editingSchedule ? `/api/schedules/${editingSchedule.id}` : '/api/schedules';
      const method = editingSchedule ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
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
              <span>{editingSchedule ? '✏️' : '📅'}</span>{' '}
              {editingSchedule ? 'Edit Jadwal Pengiriman' : 'Buat Jadwal & Broadcast WhatsApp Otomatis'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {editingSchedule
                ? 'Perbarui waktu pengiriman, lampiran file jadwal, atau target penerima pesan'
                : 'Tautkan file jadwal dan template broadcast untuk dibagikan secara otomatis'}
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
                  Pilih satu nomor akun tertentu atau biarkan <strong>Rotasi Otomatis</strong> agar pesan dikirim bergantian antar nomor aktif (mencegah banned WA).
                </div>
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
                  <option value="contacts">👤 Pilih Nama Kontak ({availableContacts.length} kontak terdeteksi)</option>
                  <option value="wa_group">👥 Grup WhatsApp ({waGroups.length} grup terdeteksi)</option>
                  <option value="all">📱 Semua Kontak Buku Telepon ({contacts.length} orang)</option>
                  <option value="group">🏷️ Berdasarkan Tag / Kategori Kontak</option>
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
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
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
                  <label className="form-label">Pilih Kategori Kontak Buku Telepon</label>
                  {groups.length === 0 ? (
                    <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', fontSize: '0.82rem', color: '#facc15' }}>
                      ⚠️ Belum ada kategori di buku kontak internal.
                      <div style={{ marginTop: 6 }}>
                        Jika ingin menjadwalkan ke <strong>Grup WhatsApp</strong>, pilih opsi <strong>👥 Grup WhatsApp</strong> di dropdown atas.
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
                        <option key={g} value={g}>
                          {g} ({contacts.filter((c) => c.group === g).length} kontak)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {recipientType === 'custom' && (
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      Daftar Nomor WhatsApp (Satu nomor per baris)
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
                    placeholder="081234567890&#10;089876543210"
                    value={customPhones}
                    onChange={(e) => setCustomPhones(e.target.value)}
                    rows={3}
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    💡 Tips: Lebih mudah memilih nama kontak langsung? Klik tombol <strong>👤 Pilih dari Nama Kontak</strong> di atas.
                  </div>
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
              {loading ? 'Menyimpan...' : editingSchedule ? '💾 Simpan Perubahan Jadwal' : '✅ Simpan & Aktifkan Jadwal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
