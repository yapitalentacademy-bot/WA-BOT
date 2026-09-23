'use client';

import React, { useState, useEffect } from 'react';
import { WhatsAppStatus, WhatsAppUserInfo } from '@/types';

interface WaConnectionCardProps {
  onStatusChange?: (status: WhatsAppStatus) => void;
}

export default function WaConnectionCard({ onStatusChange }: WaConnectionCardProps) {
  const [status, setStatus] = useState<WhatsAppStatus>('disconnected');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<WhatsAppUserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Halo! Ini adalah pesan tes dari sistem Share Otomatis WA.');
  const [showTestModal, setShowTestModal] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/wa/status');
      const data = await res.json();
      setStatus(data.status);
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setUserInfo(data.userInfo);
      if (onStatusChange) onStatusChange(data.status);
    } catch (err) {
      console.error('Failed to fetch WA status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 3 seconds while waiting for QR or connecting, otherwise every 10 seconds
    const intervalTime = status === 'waiting_qr' || status === 'connecting' ? 3000 : 10000;
    const interval = setInterval(fetchStatus, intervalTime);
    return () => clearInterval(interval);
  }, [status]);

  const handleConnect = async (action: 'connect' | 'disconnect' | 'reconnect' = 'connect') => {
    setLoading(true);
    try {
      const res = await fetch('/api/wa/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setStatus(data.status || 'connecting');
      if (data.qrCodeDataUrl) setQrCodeDataUrl(data.qrCodeDataUrl);
      if (data.userInfo) setUserInfo(data.userInfo);
    } catch (err) {
      console.error('Error connecting WA:', err);
    } finally {
      setLoading(false);
      fetchStatus();
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone) return;
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/wa/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: testPhone,
          message: testMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim pesan');

      setTestResult({ type: 'success', text: 'Pesan tes berhasil dikirim ke ' + testPhone });
      setTimeout(() => {
        setShowTestModal(false);
        setTestResult(null);
      }, 2000);
    } catch (err: any) {
      setTestResult({ type: 'error', text: err?.message || 'Gagal mengirim pesan tes' });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div className="card-title">
            <span style={{ fontSize: '1.4rem' }}>📱</span>
            <div>
              <div style={{ fontWeight: 600 }}>Koneksi WhatsApp</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Integrasi langsung via QR Code WhatsApp Web
              </div>
            </div>
          </div>
          <div>
            <span className={`status-pill ${status}`}>
              <span className="pulsing-dot" />
              {status === 'connected' && 'Terhubung (Online)'}
              {status === 'waiting_qr' && 'Menunggu Scan QR'}
              {status === 'connecting' && 'Menghubungkan...'}
              {status === 'disconnected' && 'Belum Terhubung'}
            </span>
          </div>
        </div>

        {/* STATUS: DISCONNECTED */}
        {status === 'disconnected' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 6 }}>
                Akun WhatsApp Anda belum terhubung. Klik tombol untuk memunculkan QR Code dan scan dari WhatsApp di HP Anda.
              </p>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Buka WhatsApp di HP &rarr; Titik Tiga / Pengaturan &rarr; <strong>Perangkat Tertaut (Linked Devices)</strong> &rarr; Scan QR.
              </div>
            </div>
            <button
              onClick={() => handleConnect('connect')}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? 'Menghubungkan...' : '⚡ Hubungkan WhatsApp'}
            </button>
          </div>
        )}

        {/* STATUS: WAITING QR */}
        {status === 'waiting_qr' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '12px 0' }}>
            <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 4 }}>
              Scan QR Code ini menggunakan WhatsApp Anda:
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Buka WhatsApp di HP &gt; Menu Perangkat Tertaut &gt; Tautkan Perangkat
            </p>

            {qrCodeDataUrl ? (
              <div
                style={{
                  background: '#ffffff',
                  padding: 16,
                  borderRadius: 'var(--radius-lg)',
                  display: 'inline-block',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  marginBottom: 16,
                }}
              >
                <img
                  src={qrCodeDataUrl}
                  alt="WhatsApp QR Code"
                  style={{ width: 220, height: 220, display: 'block' }}
                />
              </div>
            ) : (
              <div
                style={{
                  width: 220,
                  height: 220,
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  marginBottom: 16,
                }}
              >
                Memuat QR Code...
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => handleConnect('reconnect')}
                className="btn btn-secondary btn-sm"
                disabled={loading}
              >
                🔄 Refresh QR Code
              </button>
              <button
                onClick={() => handleConnect('disconnect')}
                className="btn btn-danger btn-sm"
                disabled={loading}
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* STATUS: CONNECTING */}
        {status === 'connecting' && !qrCodeDataUrl && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div className="pulsing-dot" style={{ width: 16, height: 16, margin: '0 auto 12px auto', color: 'var(--wa-emerald)' }} />
            <p style={{ color: 'var(--text-main)', fontWeight: 500 }}>Menghubungkan ke server WhatsApp...</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
              Mohon tunggu beberapa detik saat sesi WhatsApp diinisialisasi.
            </p>
          </div>
        )}

        {/* STATUS: CONNECTED */}
        {status === 'connected' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'rgba(0, 168, 132, 0.2)',
                  border: '2px solid var(--wa-emerald)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 26,
                }}
              >
                👤
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#ffffff' }}>
                  {userInfo?.name || 'WhatsApp Aktif'}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--wa-emerald)' }}>
                  +{userInfo?.phone || 'Nomor Terhubung'} &bull; Siap Kirim Otomatis
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowTestModal(true)}
                className="btn btn-secondary"
              >
                ✉️ Uji Coba Kirim
              </button>
              <button
                onClick={() => handleConnect('disconnect')}
                className="btn btn-danger"
                disabled={loading}
              >
                Putus Koneksi
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL UJI COBA KIRIM */}
      {showTestModal && (
        <div className="modal-overlay" onClick={() => setShowTestModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem' }}>✉️ Uji Coba Kirim Pesan WhatsApp</h3>
              <button className="close-btn" onClick={() => setShowTestModal(false)}>&times;</button>
            </div>

            {testResult && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 16,
                  fontSize: '0.88rem',
                  background: testResult.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: testResult.type === 'success' ? '#4ade80' : '#f87171',
                  border: `1px solid ${testResult.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}
              >
                {testResult.text}
              </div>
            )}

            <form onSubmit={handleSendTest}>
              <div className="form-group">
                <label className="form-label">Nomor WhatsApp Tujuan</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: 08123456789 atau 628123456789"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  Bisa gunakan nomor WhatsApp Anda sendiri untuk memastikan pesan masuk.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Isi Pesan Uji Coba</label>
                <textarea
                  className="form-textarea"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowTestModal(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={testLoading}
                >
                  {testLoading ? 'Mengirim...' : '🚀 Kirim Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
