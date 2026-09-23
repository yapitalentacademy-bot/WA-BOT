'use client';

import React, { useState, useEffect } from 'react';
import { BroadcastLog } from '@/types';

export default function LogsViewer() {
  const [logs, setLogs] = useState<BroadcastLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleClearLogs = async () => {
    if (!confirm('Yakin ingin membersihkan semua riwayat pengiriman?')) return;
    try {
      await fetch('/api/logs', { method: 'DELETE' });
      fetchLogs();
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (filter === 'success') return l.status === 'success';
    if (filter === 'failed') return l.status === 'failed';
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>📜 Riwayat & Log Pengiriman Pesan</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Pantau status pesan yang telah terkirim secara otomatis ke kontak WhatsApp
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
            🔄 Refresh
          </button>
          {logs.length > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleClearLogs}>
              🗑️ Bersihkan Riwayat
            </button>
          )}
        </div>
      </div>

      {/* FILTER BUTTONS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('all')}
        >
          Semua ({logs.length})
        </button>
        <button
          className={`btn btn-sm ${filter === 'success' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('success')}
        >
          Berhasil ({logs.filter((l) => l.status === 'success').length})
        </button>
        <button
          className={`btn btn-sm ${filter === 'failed' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('failed')}
        >
          Gagal ({logs.filter((l) => l.status === 'failed').length})
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Memuat riwayat pengiriman...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Belum ada aktivitas pengiriman pesan.
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Penerima</th>
                <th>Judul / Jadwal</th>
                <th>Pesan & Lampiran</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(log.sentAt).toLocaleString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{log.recipientName || 'Penerima'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--wa-emerald)', fontFamily: 'monospace' }}>
                      +{log.recipientPhone}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.85rem' }}>{log.scheduleTitle || 'Broadcast'}</span>
                  </td>
                  <td style={{ maxWidth: 350 }}>
                    {log.hasAttachment && (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'rgba(0, 168, 132, 0.15)',
                          color: 'var(--wa-emerald)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          marginBottom: 4,
                        }}
                      >
                        <span>📎 {log.attachmentName || 'File Terlampir'}</span>
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '0.82rem',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={log.messageText}
                    >
                      {log.messageText}
                    </div>
                    {log.errorDetails && (
                      <div style={{ color: '#f87171', fontSize: '0.75rem', marginTop: 2 }}>
                        Error: {log.errorDetails}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        background: log.status === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: log.status === 'success' ? '#4ade80' : '#f87171',
                        border: `1px solid ${log.status === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      }}
                    >
                      {log.status === 'success' ? '✓ Terkirim' : '✕ Gagal'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
