'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AttachedFile } from '@/types';

interface ScheduleFileManagerProps {
  onScheduleFile: (file: AttachedFile) => void;
  onInstantBroadcastFile: (file: AttachedFile) => void;
}

export default function ScheduleFileManager({
  onScheduleFile,
  onInstantBroadcastFile,
}: ScheduleFileManagerProps) {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // CSV Schedule Importer
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState(
    '081234567890, Budi Santoso, Jadwal Ujian Mandiri, 2026-09-25T08:00\n089876543210, Siti Rahma, Jadwal Bimbingan Proyek, 2026-09-25T13:30'
  );
  const [csvProcessing, setCsvProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengunggah file');

      setSuccess(`File "${data.file.originalName}" berhasil diunggah!`);
      fetchFiles();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Gagal mengunggah file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus file "${name}"?`)) return;

    try {
      const res = await fetch(`/api/files?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchFiles();
    } catch (err: any) {
      alert(err?.message || 'Gagal menghapus file');
    }
  };

  const handleProcessCsv = async () => {
    setCsvProcessing(true);
    setError(null);
    try {
      const lines = csvText.split('\n').filter((l) => l.trim().length > 0);
      let count = 0;

      for (const line of lines) {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length >= 2) {
          const phone = parts[0];
          const name = parts[1] || 'Sobat';
          const title = parts[2] || 'Jadwal Otomatis';
          const scheduledTime = parts[3] || new Date(Date.now() + 30 * 60 * 1000).toISOString();

          await fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              message: `Halo {nama},\n\nBerikut kami sampaikan jadwal kegiatan Anda:\n📅 *Kegiatan*: {jadwal}\n⏰ *Waktu*: {waktu}\n\nTerima kasih!`,
              recipients: {
                type: 'custom',
                customPhones: [phone],
              },
              scheduleType: 'once',
              scheduledTime,
              antiBanDelayMin: 3,
              antiBanDelayMax: 6,
            }),
          });
          count++;
        }
      }

      setSuccess(`${count} jadwal otomatis berhasil dibuat dari daftar file!`);
      setShowCsvModal(false);
    } catch (err: any) {
      setError(err?.message || 'Gagal memproses data CSV');
    } finally {
      setCsvProcessing(false);
    }
  };

  return (
    <div>
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>📁 Manajemen File Jadwal & Lampiran</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Unggah dan kelola file dokumen PDF, flyer gambar, atau spreadsheet jadwal untuk di-share otomatis
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowCsvModal(true)}
          >
            📊 Impor Jadwal dari CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Mengunggah...' : '📤 Unggah File Jadwal'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            style={{ display: 'none' }}
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx"
          />
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

      {/* FILE LISTING */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Memuat daftar file jadwal...
        </div>
      ) : files.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
          <h3 style={{ marginBottom: 6 }}>Belum Ada File Jadwal yang Diunggah</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 450, marginBottom: 18 }}>
            Unggah file jadwal berupa PDF, gambar pengumuman (flyer), dokumen Word, atau spreadsheet Excel agar dapat dibagikan otomatis ke kontak Anda.
          </p>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            📤 Unggah File Jadwal Pertama Anda
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {files.map((file) => {
            const isPdf = file.mimeType.includes('pdf');
            const isImg = file.mimeType.includes('image');
            const isSheet = file.mimeType.includes('spreadsheet') || file.originalName.endsWith('.csv') || file.originalName.endsWith('.xlsx');

            return (
              <div key={file.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 'var(--radius-md)',
                        background: isPdf ? 'rgba(239, 68, 68, 0.15)' : isImg ? 'rgba(56, 189, 248, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                        color: isPdf ? '#f87171' : isImg ? '#38bdf8' : '#4ade80',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                        flexShrink: 0,
                      }}
                    >
                      {isPdf ? '📕' : isImg ? '🖼️' : isSheet ? '📊' : '📄'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.92rem',
                          color: '#ffffff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={file.originalName}
                      >
                        {file.originalName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {(file.size / 1024).toFixed(1)} KB &bull; Diunggah {new Date(file.uploadedAt).toLocaleDateString('id-ID')}
                      </div>
                    </div>
                  </div>

                  {isImg && (
                    <div
                      style={{
                        width: '100%',
                        height: 120,
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        background: '#000',
                        marginBottom: 12,
                      }}
                    >
                      <img
                        src={file.url}
                        alt={file.originalName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => onScheduleFile(file)}
                    >
                      📅 Jadwalkan
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => onInstantBroadcastFile(file)}
                    >
                      🚀 Kirim Cepat
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: '0.78rem', color: 'var(--wa-emerald)', textDecoration: 'none' }}
                    >
                      🔍 Buka / Unduh File
                    </a>
                    <button
                      onClick={() => handleDelete(file.id, file.originalName)}
                      style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: '0.78rem', cursor: 'pointer' }}
                    >
                      🗑️ Hapus
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CSV MODAL */}
      {showCsvModal && (
        <div className="modal-overlay" onClick={() => setShowCsvModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem' }}>📊 Buat Jadwal Otomatis dari Teks / File CSV</h3>
              <button className="close-btn" onClick={() => setShowCsvModal(false)}>&times;</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Format per baris: <code>Nomor_WA, Nama, Judul_Jadwal, Waktu_ISO</code>
            </p>

            <div className="form-group">
              <textarea
                className="form-textarea"
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setShowCsvModal(false)}>
                Batal
              </button>
              <button
                className="btn btn-primary"
                onClick={handleProcessCsv}
                disabled={csvProcessing}
              >
                {csvProcessing ? 'Memproses...' : '🚀 Buat Jadwal Massal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
