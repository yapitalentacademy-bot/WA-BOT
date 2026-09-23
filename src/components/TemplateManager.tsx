'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageTemplate, AttachedFile } from '@/types';

interface TemplateManagerProps {
  onUseTemplate?: (template: MessageTemplate) => void;
}

export default function TemplateManager({ onUseTemplate }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal create template
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Jadwal');
  const [attachedFileId, setAttachedFileId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tplRes, filesRes] = await Promise.all([fetch('/api/templates'), fetch('/api/files')]);
      const [tplData, filesData] = await Promise.all([tplRes.json(), filesRes.json()]);
      setTemplates(Array.isArray(tplData) ? tplData : []);
      setFiles(Array.isArray(filesData) ? filesData : []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const insertVariable = (varName: string) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const before = content.substring(0, start);
    const after = content.substring(end, content.length);
    setContent(`${before}{${varName}}${after}`);
  };

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const linkedFile = files.find((f) => f.id === attachedFileId);

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          category,
          attachedFileId: linkedFile?.id,
          attachedFileName: linkedFile?.originalName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan template');

      setShowAddModal(false);
      setTitle('');
      setContent('');
      setAttachedFileId('');
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Gagal menambah template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus template "${name}"?`)) return;

    try {
      const res = await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Gagal menghapus template');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>📝 Koleksi Template Broadcast</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Kelola template pesan jadwal dan broadcast yang dapat dipakai berulang kali secara instan
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          ➕ Buat Template Baru
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Memuat template...
        </div>
      ) : templates.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Belum ada template yang disimpan.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
          {templates.map((tpl) => (
            <div key={tpl.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <h4 style={{ fontSize: '1rem', color: '#ffffff' }}>{tpl.title}</h4>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      background: 'rgba(0, 168, 132, 0.15)',
                      color: 'var(--wa-emerald)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 600,
                    }}
                  >
                    {tpl.category || 'Umum'}
                  </span>
                </div>

                <div
                  style={{
                    background: 'var(--bg-input)',
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    color: 'var(--text-main)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    lineHeight: 1.4,
                    maxHeight: 140,
                    overflowY: 'auto',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {tpl.content}
                </div>

                {tpl.attachedFileName && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 10,
                      fontSize: '0.78rem',
                      color: 'var(--wa-emerald)',
                    }}
                  >
                    <span>📎 File tertaut:</span>
                    <strong style={{ color: '#fff' }}>{tpl.attachedFileName}</strong>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                {onUseTemplate && (
                  <button className="btn btn-primary btn-sm" onClick={() => onUseTemplate(tpl)}>
                    ⚡ Gunakan untuk Broadcast
                  </button>
                )}
                <button
                  onClick={() => handleDelete(tpl.id, tpl.title)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                  }}
                >
                  🗑️ Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL ADD TEMPLATE */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📝 Buat Template Broadcast Baru</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>&times;</button>
            </div>

            {error && (
              <div style={{ color: '#f87171', marginBottom: 12, fontSize: '0.85rem' }}>{error}</div>
            )}

            <form onSubmit={handleAddTemplate}>
              <div className="form-group">
                <label className="form-label">Judul Template</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Misal: Jadwal Pengajian, Undangan Rapat, Info Kuliah"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kategori</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Jadwal, Pengumuman, Reminder"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tautkan File Lampiran Default (Opsional)</label>
                <select
                  className="form-select"
                  value={attachedFileId}
                  onChange={(e) => setAttachedFileId(e.target.value)}
                >
                  <option value="">-- Tanpa File Lampiran --</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.originalName} ({(f.size / 1024).toFixed(1)} KB)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Isi Pesan Template</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['nama', 'jadwal', 'waktu', 'tanggal', 'kegiatan'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="chip"
                        style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                        onClick={() => insertVariable(v)}
                      >
                        +{`{${v}}`}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  ref={textareaRef}
                  className="form-textarea"
                  rows={6}
                  placeholder="Halo {nama}, berikut jadwal {kegiatan} Anda pada {waktu}..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
