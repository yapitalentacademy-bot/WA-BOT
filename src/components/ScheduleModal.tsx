'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageTemplate,
  AttachedFile,
  Contact,
  ScheduleRepeatType,
  BroadcastSchedule,
  ScheduleSendMode,
  ScheduleScope,
  NoRowAction,
  ScheduleRow,
  ColumnMapping,
  ExtractedScheduleData,
} from '@/types';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialFile?: AttachedFile | null;
  editingSchedule?: BroadcastSchedule | null;
}

export default function ScheduleModal({
  isOpen,
  onClose,
  onSuccess,
  initialFile,
  editingSchedule,
}: ScheduleModalProps) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleRepeatType>('once');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [recurringTime, setRecurringTime] = useState('08:00');
  const [recurringDay, setRecurringDay] = useState(1); // Monday

  // Mode pengiriman baru vs lama
  const [sendMode, setSendMode] = useState<ScheduleSendMode>('attachment');
  const [extractedSchedule, setExtractedSchedule] = useState<ExtractedScheduleData | null>(null);
  const [scheduleScope, setScheduleScope] = useState<ScheduleScope>('today');
  const [noRowAction, setNoRowAction] = useState<NoRowAction>('skip');
  const [fallbackText, setFallbackText] = useState('');
  const [parsingSchedule, setParsingSchedule] = useState(false);
  const [showTableEditor, setShowTableEditor] = useState(false);

  // Simulation preview date (defaults to today YYYY-MM-DD in WIB)
  const todayWibStr = useMemo(() => {
    const d = new Date();
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const wib = new Date(utc + 7 * 3600000);
    return wib.toISOString().split('T')[0];
  }, []);
  const [previewDate, setPreviewDate] = useState(todayWibStr);

  // Recipients
  const [recipientType, setRecipientType] = useState<'all' | 'group' | 'custom' | 'wa_group' | 'contacts'>('wa_group');
  const [sendToAllWaGroups, setSendToAllWaGroups] = useState<boolean>(true);
  const [sendToAllContacts, setSendToAllContacts] = useState<boolean>(true);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [customPhones, setCustomPhones] = useState('');
  const [availableContacts, setAvailableContacts] = useState<{ id: string; name: string; phone: string; source: string }[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<{ name: string; phone: string }[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');

  // WhatsApp Groups & Search (FITUR 2)
  const [waGroups, setWaGroups] = useState<{ id: string; name: string; participantsCount: number }[]>([]);
  const [selectedWaGroupIds, setSelectedWaGroupIds] = useState<string[]>([]);
  const [manualWaGroupId, setManualWaGroupId] = useState('');
  const [loadingWaGroups, setLoadingWaGroups] = useState(false);
  const [waGroupSearchQuery, setWaGroupSearchQuery] = useState('');
  const [debouncedWaGroupSearch, setDebouncedWaGroupSearch] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

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

  // Multi-Account Sender
  const [senderAccountId, setSenderAccountId] = useState<string>('rotation');
  const [connectedAccounts, setConnectedAccounts] = useState<{ id: string; label: string; phone?: string; status: string }[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce search query (200ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedWaGroupSearch(waGroupSearchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [waGroupSearchQuery]);

  useEffect(() => {
    if (isOpen) {
      fetchData();

      if (editingSchedule) {
        setTitle(editingSchedule.title);
        setMessage(editingSchedule.message);
        setScheduleType(editingSchedule.scheduleType);
        setSendMode(editingSchedule.sendMode || 'attachment');
        setExtractedSchedule(editingSchedule.extractedSchedule || null);
        setScheduleScope(editingSchedule.scheduleScope || 'today');
        setNoRowAction(editingSchedule.noRowAction || 'skip');
        setFallbackText(editingSchedule.fallbackText || '');

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
        setSendMode('attachment');
        setExtractedSchedule(null);
        setScheduleScope('today');
        setNoRowAction('skip');
        setFallbackText('');
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
        setRecipientType('wa_group');
        setSendToAllWaGroups(true);
        setSendToAllContacts(true);
        setSelectedContacts([]);
        setSelectedWaGroupIds([]);
        setCustomPhones('');
        setContactSearchQuery('');
        setWaGroupSearchQuery('');
        setShowSelectedOnly(false);
        setAttachedFile(initialFile || null);

        if (initialFile) {
          handleParseScheduleFile(initialFile);
        }
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
    } catch (err) {
      console.error('Failed to load modal data:', err);
    }
  };

  const handleRefreshWaGroups = async () => {
    setLoadingWaGroups(true);
    try {
      const res = await fetch(`/api/wa/groups?accountId=${senderAccountId !== 'rotation' ? senderAccountId : ''}`);
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

  // Extract schedule table from file
  const handleParseScheduleFile = async (fileObj: AttachedFile) => {
    setParsingSchedule(true);
    try {
      const res = await fetch('/api/parse-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localPath: fileObj.localPath }),
      });
      const data = await res.json();
      if (data.success && data.rows && data.rows.length > 0) {
        setExtractedSchedule({
          rows: data.rows,
          columns: data.columns,
          columnMapping: data.columnMapping,
          detectedDateRange: data.detectedDateRange,
        });
        setSendMode('schedule_text');
        if (!message || message.trim() === '') {
          setMessage(
            'Halo {nama},\n\nBerikut kami sampaikan jadwal kegiatan Anda:\n{jadwal}\n\nMohon hadir tepat waktu. Terima kasih! 🙏'
          );
        }
      }
    } catch (err) {
      console.error('Failed to parse schedule file:', err);
    } finally {
      setParsingSchedule(false);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setMessage(tpl.content);
    if (!title) setTitle(tpl.title);
    if (tpl.attachedFileId) {
      const found = availableFiles.find((f) => f.id === tpl.attachedFileId);
      if (found) {
        setAttachedFile(found);
        handleParseScheduleFile(found);
      }
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
      handleParseScheduleFile(data.file);
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

  // FITUR 2: Filter Real-Time WhatsApp Groups (Debounce, Fuzzy, Highlight, Order)
  const filteredWaGroups = useMemo(() => {
    let result = waGroups;

    // Filter "Tampilkan yang dipilih saja"
    if (showSelectedOnly) {
      result = result.filter((g) => selectedWaGroupIds.includes(g.id));
    }

    // Filter pencarian
    const q = debouncedWaGroupSearch.toLowerCase().trim();
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      result = result.filter((g) => {
        const targetStr = `${g.name} ${g.id}`.toLowerCase();
        return terms.every((term) => targetStr.includes(term));
      });
    }

    // Urutan: cocok di awal nama dulu, lalu alfabetis
    return [...result].sort((a, b) => {
      if (q) {
        const aStarts = a.name.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [waGroups, debouncedWaGroupSearch, showSelectedOnly, selectedWaGroupIds]);

  const handleSelectAllFilteredWaGroups = () => {
    const idsToAdd = filteredWaGroups.map((g) => g.id);
    setSelectedWaGroupIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const handleClearAllWaGroups = () => {
    setSelectedWaGroupIds([]);
  };

  const handleRemoveWaGroupChip = (groupId: string) => {
    setSelectedWaGroupIds((prev) => prev.filter((id) => id !== groupId));
  };

  // Highlight Matching Text
  const renderHighlightedText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const terms = query.trim().split(/\s+/).filter(Boolean);
    const regex = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) =>
          terms.some((t) => part.toLowerCase() === t.toLowerCase()) ? (
            <mark key={i} style={{ background: 'rgba(234, 179, 8, 0.4)', color: '#ffffff', borderRadius: 2, padding: '0 2px' }}>
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Filter Contacts
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

  // Table Row Edit Helpers (Fitur 1)
  const handleAddTableRow = () => {
    if (!extractedSchedule) return;
    const newRow: ScheduleRow = {
      id: `row-new-${Date.now()}`,
      tanggal: previewDate || todayWibStr,
      waktu: '08:00',
      kegiatan: 'Kegiatan Baru',
      petugas: '-',
      lokasi: '-',
      keterangan: '-',
      rawData: {},
    };
    setExtractedSchedule({
      ...extractedSchedule,
      rows: [...extractedSchedule.rows, newRow],
    });
  };

  const handleDeleteTableRow = (rowId: string) => {
    if (!extractedSchedule) return;
    setExtractedSchedule({
      ...extractedSchedule,
      rows: extractedSchedule.rows.filter((r) => r.id !== rowId),
    });
  };

  const handleUpdateTableRow = (rowId: string, field: keyof ScheduleRow, value: string) => {
    if (!extractedSchedule) return;
    setExtractedSchedule({
      ...extractedSchedule,
      rows: extractedSchedule.rows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)),
    });
  };

  // Submit Handler
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
        if (sendToAllWaGroups) {
          targetWaGroupsPayload = waGroups.map((g) => ({ id: g.id, name: g.name }));
        } else {
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
        }

        if (targetWaGroupsPayload.length === 0) {
          setError('Pilih minimal 1 grup WhatsApp atau aktifkan opsi Kirim ke Semua Grup');
          setLoading(false);
          return;
        }
      }

      let selectedContactsPayload: { name: string; phone: string }[] | undefined = undefined;
      if (recipientType === 'contacts') {
        if (sendToAllContacts || selectedContacts.length === 0) {
          selectedContactsPayload = availableContacts.map((c) => ({ name: c.name, phone: c.phone }));
        } else {
          selectedContactsPayload = selectedContacts;
        }
      }

      const payload = {
        title,
        message,
        attachedFile,
        sendMode,
        extractedSchedule,
        scheduleScope,
        noRowAction,
        fallbackText,
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

  // Simulated preview text with live date context
  const simulatedJadwalFormatted = useMemo(() => {
    if (sendMode === 'schedule_text' && extractedSchedule?.rows) {
      const rows = extractedSchedule.rows;
      const matched = rows.filter((r) => {
        const dStr = r.tanggal || r.hari || '';
        return dStr.includes(previewDate) || dStr.includes('Sabtu') || dStr.includes('26');
      });
      if (matched.length > 0) {
        return matched
          .map(
            (r) =>
              `▸ ${r.waktu ? r.waktu + '  ' : ''}${r.kegiatan || 'Kegiatan'}${
                r.petugas ? ' — ' + r.petugas : ''
              }${r.lokasi ? ' (' + r.lokasi + ')' : ''}`
          )
          .join('\n');
      }
      return '▸ 08.00  Sholat Berjamaah & Kajian Pagi\n▸ 13.00  Rapat Pengurus\n▸ 19.30  Tahsin Al-Qur\'an';
    }
    return title || 'Jadwal Acara / Kegiatan';
  }, [sendMode, extractedSchedule, previewDate, title]);

  const previewText = (message || 'Pratinjau pesan Anda akan muncul di sini...')
    .replace(/\{nama\}/gi, 'Budi Santoso')
    .replace(/\{jadwal\}/gi, simulatedJadwalFormatted)
    .replace(/\{kegiatan\}/gi, title || 'Kegiatan')
    .replace(/\{waktu\}/gi, recurringTime || scheduledTime || '08:00')
    .replace(/\{tanggal\}/gi, previewDate)
    .replace(/\{petugas\}/gi, 'Ustadz Ahmad')
    .replace(/\{lokasi\}/gi, 'Aula Utama')
    .replace(/\{keterangan\}/gi, 'Membawa perlengkapan');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{editingSchedule ? '✏️' : '📅'}</span>{' '}
              {editingSchedule ? 'Edit Jadwal Pengiriman' : 'Buat Jadwal & Broadcast WhatsApp Otomatis'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {editingSchedule
                ? 'Perbarui waktu pengiriman, file jadwal, atau target penerima pesan'
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
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
                <label className="form-label">Tautkan Template Broadcast (Opsional)</label>
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

              {/* 3. Tautkan File Jadwal & Ekstraksi */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>📎 Tautkan File Jadwal (Excel, PDF, Word, Gambar)</span>
                  {attachedFile && (
                    <span
                      style={{ color: '#f87171', cursor: 'pointer', fontSize: '0.78rem' }}
                      onClick={() => {
                        setAttachedFile(null);
                        setExtractedSchedule(null);
                        setSendMode('attachment');
                      }}
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
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 24 }}>
                        {attachedFile.mimeType.includes('pdf') ? '📄' : attachedFile.mimeType.includes('image') ? '🖼️' : '📁'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {attachedFile.originalName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {(attachedFile.size / 1024).toFixed(1)} KB &bull; {parsingSchedule ? 'Mengestraksi isi tabel...' : extractedSchedule ? `${extractedSchedule.rows.length} baris terdeteksi` : 'File Siap'}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', background: 'var(--wa-emerald)', color: '#0b141a', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                        {extractedSchedule ? 'Terekstraksi' : 'Terpilih'}
                      </span>
                    </div>

                    {/* MODE PENGIRIMAN (FITUR 1) */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, marginTop: 4 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff', marginBottom: 6 }}>
                        Mode Pengiriman File Jadwal:
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className={`btn btn-sm ${sendMode === 'schedule_text' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ fontSize: '0.74rem', flex: 1 }}
                          onClick={() => setSendMode('schedule_text')}
                        >
                          📝 Kirim Isi Teks (Ikuti Tanggal)
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${sendMode === 'attachment' ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ fontSize: '0.74rem', flex: 1 }}
                          onClick={() => setSendMode('attachment')}
                        >
                          📎 Kirim File Sebagai Lampiran
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                      style={{
                        border: '2px dashed var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: 14,
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'var(--bg-input)',
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <span style={{ fontSize: 22 }}>📤</span>
                      <div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--wa-emerald)', marginTop: 2 }}>
                        {uploadingFile ? 'Mengunggah file...' : 'Unggah File Jadwal (Excel / CSV / Doc / PDF)'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
                        Sistem otomatis mengekstraksi isi tabel jadwal untuk broadcast teks otomatis per hari!
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                      accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx"
                    />
                  </div>
                )}
              </div>

              {/* FITUR 1: PANEL PENGATURAN EKSTRAKSI TANGGAL & FABRICATED TEXT */}
              {sendMode === 'schedule_text' && extractedSchedule && (
                <div style={{ background: 'rgba(0,0,0,0.25)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--wa-emerald)' }}>
                      ⚙️ Pengaturan Ekstraksi Jadwal Teks
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      onClick={() => setShowTableEditor(!showTableEditor)}
                    >
                      {showTableEditor ? 'Tutup Editor Tabel' : `✏️ Edit Tabel (${extractedSchedule.rows.length} Baris)`}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.78rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.74rem' }}>Cakupan Tanggal Kirim</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                        value={scheduleScope}
                        onChange={(e) => setScheduleScope(e.target.value as any)}
                      >
                        <option value="today">📅 Hari Ini (Sesuai Tanggal WIB)</option>
                        <option value="tomorrow">🌙 Besok (Pengingat Malam Sebelumnya)</option>
                        <option value="week">🗓️ Sepekan Ke Depan (Rekap Mingguan)</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.74rem' }}>Jika Hari Ini Kosong</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                        value={noRowAction}
                        onChange={(e) => setNoRowAction(e.target.value as any)}
                      >
                        <option value="skip">⏭️ Lewati (Tidak Kirim Pesan)</option>
                        <option value="fallback_text">💬 Kirim Pesan Cadangan</option>
                      </select>
                    </div>
                  </div>

                  {noRowAction === 'fallback_text' && (
                    <div style={{ marginTop: 8 }}>
                      <label className="form-label" style={{ fontSize: '0.74rem' }}>Isi Pesan Cadangan:</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                        placeholder="Contoh: Hari ini tidak ada kegiatan terjadwal. Selamat beristirahat!"
                        value={fallbackText}
                        onChange={(e) => setFallbackText(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Table Row Editor Modal/Drawer inline */}
                  {showTableEditor && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Tabel Ekstraksi File:</span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                          onClick={handleAddTableRow}
                        >
                          ➕ Tambah Baris
                        </button>
                      </div>

                      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                              <th style={{ padding: 4 }}>Tanggal/Hari</th>
                              <th style={{ padding: 4 }}>Waktu</th>
                              <th style={{ padding: 4 }}>Kegiatan</th>
                              <th style={{ padding: 4 }}>Petugas</th>
                              <th style={{ padding: 4 }}>Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {extractedSchedule.rows.map((row) => (
                              <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: 2 }}>
                                  <input
                                    className="form-input"
                                    style={{ fontSize: '0.7rem', padding: '2px 4px' }}
                                    value={row.tanggal || row.hari || ''}
                                    onChange={(e) => handleUpdateTableRow(row.id, 'tanggal', e.target.value)}
                                  />
                                </td>
                                <td style={{ padding: 2 }}>
                                  <input
                                    className="form-input"
                                    style={{ fontSize: '0.7rem', padding: '2px 4px' }}
                                    value={row.waktu || ''}
                                    onChange={(e) => handleUpdateTableRow(row.id, 'waktu', e.target.value)}
                                  />
                                </td>
                                <td style={{ padding: 2 }}>
                                  <input
                                    className="form-input"
                                    style={{ fontSize: '0.7rem', padding: '2px 4px' }}
                                    value={row.kegiatan || ''}
                                    onChange={(e) => handleUpdateTableRow(row.id, 'kegiatan', e.target.value)}
                                  />
                                </td>
                                <td style={{ padding: 2 }}>
                                  <input
                                    className="form-input"
                                    style={{ fontSize: '0.7rem', padding: '2px 4px' }}
                                    value={row.petugas || ''}
                                    onChange={(e) => handleUpdateTableRow(row.id, 'petugas', e.target.value)}
                                  />
                                </td>
                                <td style={{ padding: 2 }}>
                                  <button
                                    type="button"
                                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                                    onClick={() => handleDeleteTableRow(row.id)}
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Akun Pengirim */}
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
              </div>

              {/* Frekuensi Jadwal */}
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

              {/* Setting Waktu */}
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
                  <option value="contacts">👤 Pilih Nama Kontak ({availableContacts.length} kontak)</option>
                  <option value="wa_group">👥 Grup WhatsApp ({waGroups.length} grup)</option>
                  <option value="all">📱 Semua Kontak Buku Telepon ({contacts.length} orang)</option>
                  <option value="group">🏷️ Berdasarkan Tag / Kategori Kontak</option>
                  <option value="custom">✍️ Input Nomor Manual</option>
                </select>
              </div>

              {/* FITUR 2: GRUP WHATSAPP SELECTION WITH ADVANCED SEARCH */}
              {recipientType === 'wa_group' && (
                <div className="form-group" style={{ background: 'var(--bg-input)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  {/* OPSI TERPISAH: KIRIM KE SEMUA GRUP OTOMATIS */}
                  <div style={{
                    background: sendToAllWaGroups ? 'rgba(0, 168, 132, 0.2)' : 'rgba(255,255,255,0.04)',
                    border: sendToAllWaGroups ? '1.5px solid var(--wa-emerald)' : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    marginBottom: 10,
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={sendToAllWaGroups}
                        onChange={(e) => setSendToAllWaGroups(e.target.checked)}
                        style={{ width: 18, height: 18, accentColor: 'var(--wa-emerald)' }}
                      />
                      <div>
                        <div>🚀 Kirim Otomatis ke SELURUH Grup WhatsApp ({waGroups.length > 0 ? `${waGroups.length} Grup` : '227+ Grup'})</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', fontWeight: 400 }}>
                          {sendToAllWaGroups ? '✅ Otomatis aktif: Pesan langsung terkirim ke semua grup tanpa perlu menautkan/memilih satu per satu' : '⚠️ Non-aktif: Pilih grup tertentu secara manual di bawah'}
                        </div>
                      </div>
                    </label>
                  </div>

                  {!sendToAllWaGroups && (
                    <>
                      {/* Header Counter & Refresh */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--wa-emerald)' }}>
                          Pilih Grup WhatsApp Tujuan ({selectedWaGroupIds.length} dipilih)
                        </div>
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

                      {/* Selected Chips Bar */}
                      {selectedWaGroupIds.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, maxHeight: 65, overflowY: 'auto', padding: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
                          {selectedWaGroupIds.map((gid) => {
                            const match = waGroups.find((g) => g.id === gid);
                            return (
                              <span
                                key={gid}
                                style={{
                                  background: 'rgba(0, 168, 132, 0.25)',
                                  border: '1px solid var(--wa-emerald)',
                                  color: '#fff',
                                  fontSize: '0.72rem',
                                  padding: '2px 8px',
                                  borderRadius: 12,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <span>{match ? match.name : gid.split('@')[0]}</span>
                                <span
                                  style={{ cursor: 'pointer', fontWeight: 'bold', color: '#f87171' }}
                                  onClick={() => handleRemoveWaGroupChip(gid)}
                                >
                                  &times;
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Search Bar & Action Buttons (FITUR 2) */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ fontSize: '0.8rem', padding: '6px 26px 6px 10px' }}
                            placeholder="🔍 Cari nama grup atau ID..."
                            value={waGroupSearchQuery}
                            onChange={(e) => setWaGroupSearchQuery(e.target.value)}
                          />
                          {waGroupSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setWaGroupSearchQuery('')}
                              style={{
                                position: 'absolute',
                                right: 8,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                          onClick={handleSelectAllFilteredWaGroups}
                        >
                          ✓ Pilih Semua Hasil ({filteredWaGroups.length})
                        </button>

                        {selectedWaGroupIds.length > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.72rem', padding: '4px 8px', color: 'var(--error)' }}
                            onClick={handleClearAllWaGroups}
                          >
                            ✕ Hapus Pilihan
                          </button>
                        )}
                      </div>

                      {/* Quick Filter Toggle & Counter */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={showSelectedOnly}
                            onChange={(e) => setShowSelectedOnly(e.target.checked)}
                          />
                          <span>Tampilkan yang dipilih saja</span>
                        </label>
                        <span>Menampilkan {filteredWaGroups.length} dari {waGroups.length} grup</span>
                      </div>

                      {/* Group List */}
                      {waGroups.length === 0 ? (
                        <div style={{ padding: '10px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          Belum ada grup terdeteksi. Pastikan akun WhatsApp Anda sudah terhubung di dashboard, lalu klik <strong>Sinkronkan Grup</strong> di atas.
                        </div>
                      ) : filteredWaGroups.length === 0 ? (
                        <div style={{ padding: '12px 0', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          Tidak ada grup yang cocok dengan &quot;{debouncedWaGroupSearch}&quot;
                        </div>
                      ) : (
                        <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {filteredWaGroups.map((g) => {
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
                                    {renderHighlightedText(g.name, debouncedWaGroupSearch)}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                                    {g.participantsCount} anggota &bull; ID: {renderHighlightedText(g.id.split('@')[0], debouncedWaGroupSearch)}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>
                          Atau Masukkan Group ID Manual:
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
                    </>
                  )}
                </div>
              )}

              {recipientType === 'contacts' && (
                <div className="form-group" style={{ background: 'var(--bg-input)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  {/* OPSI TERPISAH: KIRIM KE SEMUA KONTAK OTOMATIS */}
                  <div style={{
                    background: sendToAllContacts ? 'rgba(0, 168, 132, 0.2)' : 'rgba(255,255,255,0.04)',
                    border: sendToAllContacts ? '1.5px solid var(--wa-emerald)' : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    marginBottom: 10,
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={sendToAllContacts}
                        onChange={(e) => setSendToAllContacts(e.target.checked)}
                        style={{ width: 18, height: 18, accentColor: 'var(--wa-emerald)' }}
                      />
                      <div>
                        <div>🚀 Kirim Otomatis ke SELURUH Kontak WhatsApp ({availableContacts.length} Kontak)</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', fontWeight: 400 }}>
                          {sendToAllContacts ? '✅ Otomatis aktif: Pesan langsung terkirim ke seluruh kontak tanpa perlu menautkan/memilih satu per satu' : '⚠️ Non-aktif: Pilih kontak tertentu secara manual di bawah'}
                        </div>
                      </div>
                    </label>
                  </div>

                  {!sendToAllContacts && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--wa-emerald)' }}>
                          Pilih Nama Kontak ({selectedContacts.length} dipilih)
                        </span>
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

                      <div style={{ position: 'relative', marginBottom: 10 }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ fontSize: '0.82rem', padding: '7px 28px 7px 10px' }}
                          placeholder="🔍 Cari nama kontak, nomor telepon, atau kategori..."
                          value={contactSearchQuery}
                          onChange={(e) => setContactSearchQuery(e.target.value)}
                        />
                      </div>

                      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {filteredContacts.map((c) => {
                          const selected = isContactSelected(c.phone);
                          return (
                            <div
                              key={c.id || c.phone}
                              onClick={() => toggleContactSelection({ name: c.name, phone: c.phone })}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '6px 10px',
                                borderRadius: 'var(--radius-sm)',
                                background: selected ? 'rgba(0, 168, 132, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                                cursor: 'pointer',
                                border: selected ? '1px solid var(--wa-emerald)' : '1px solid transparent',
                              }}
                            >
                              <input type="checkbox" checked={selected} readOnly />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.name}</div>
                                <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)' }}>{c.phone}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Anti-Ban Config */}
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

            {/* RIGHT COLUMN: MESSAGE EDITOR & LIVE SIMULATOR PREVIEW */}
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
                  {['nama', 'jadwal', 'waktu', 'tanggal', 'kegiatan', 'petugas', 'lokasi', 'keterangan'].map(
                    (varName) => (
                      <button
                        key={varName}
                        type="button"
                        className="chip"
                        onClick={() => insertVariable(varName)}
                      >
                        +{`{${varName}}`}
                      </button>
                    )
                  )}
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

              {/* FITUR 1: WHATSAPP LIVE SIMULATOR PREVIEW WITH DATE PICKER */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Simulasi Tampilan di WhatsApp Penerima:
                  </label>

                  {sendMode === 'schedule_text' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tanggal Pratinjau:</span>
                      <input
                        type="date"
                        className="form-input"
                        style={{ fontSize: '0.72rem', padding: '2px 6px', width: 125 }}
                        value={previewDate}
                        onChange={(e) => setPreviewDate(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="wa-chat-preview">
                  <div className="chat-bubble">
                    {/* Simulated Attached File (Only shown in attachment mode) */}
                    {sendMode === 'attachment' && attachedFile && (
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
                    <div style={{ whiteSpace: 'pre-line' }}>{previewText}</div>

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
