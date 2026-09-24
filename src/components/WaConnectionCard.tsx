'use client';

import React, { useState, useEffect } from 'react';
import { WhatsAppStatus, WhatsAppAccountInfo } from '@/types';

interface WaConnectionCardProps {
  onStatusChange?: (status: WhatsAppStatus) => void;
}

export default function WaConnectionCard({ onStatusChange }: WaConnectionCardProps) {
  const [accounts, setAccounts] = useState<WhatsAppAccountInfo[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('acc_1');
  const [connectedCount, setConnectedCount] = useState<number>(0);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Rename account state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingAccountId, setRenamingAccountId] = useState('');
  const [newLabelInput, setNewLabelInput] = useState('');

  // Test send state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Halo! Ini adalah pesan tes dari sistem Share Otomatis WA.');
  const [testAccountId, setTestAccountId] = useState('acc_1');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/wa/status');
      const data = await res.json();
      if (Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
        setConnectedCount(data.connectedCount || 0);

        // Notify parent of overall status
        if (onStatusChange) {
          const overallStatus = data.connectedCount > 0 ? 'connected' : (data.status || 'disconnected');
          onStatusChange(overallStatus);
        }
      }
    } catch (err) {
      console.error('Failed to fetch WA status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Fast poll if any account is connecting or waiting_qr
    const hasActiveQRorConnecting = accounts.some(
      (a) => a.status === 'waiting_qr' || a.status === 'connecting'
    );
    const intervalTime = hasActiveQRorConnecting ? 3000 : 8000;
    const interval = setInterval(fetchStatus, intervalTime);
    return () => clearInterval(interval);
  }, [accounts]);

  const currentAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0] || {
    id: 'acc_1',
    label: 'Akun 1 (Utama)',
    status: 'disconnected' as WhatsAppStatus,
    qrCodeDataUrl: null,
    userInfo: null,
  };

  const handleAccountAction = async (accountId: string, action: 'connect' | 'disconnect' | 'reconnect') => {
    setLoadingAction(`${accountId}-${action}`);
    try {
      const res = await fetch('/api/wa/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, action }),
      });
      const data = await res.json();
      if (Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
      }
    } catch (err) {
      console.error(`Error performing ${action} on ${accountId}:`, err);
    } finally {
      setLoadingAction(null);
      fetchStatus();
    }
  };

  const handleOpenRename = (acc: WhatsAppAccountInfo) => {
    setRenamingAccountId(acc.id);
    setNewLabelInput(acc.label);
    setShowRenameModal(true);
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelInput.trim()) return;

    try {
      await fetch('/api/wa/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rename',
          accountId: renamingAccountId,
          newLabel: newLabelInput.trim(),
        }),
      });
      setShowRenameModal(false);
      fetchStatus();
    } catch (err) {
      console.error('Failed to rename account:', err);
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
          accountId: testAccountId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim pesan');

      setTestResult({ type: 'success', text: `✅ Pesan tes berhasil dikirim ke ${testPhone}!` });
      setTimeout(() => {
        setShowTestModal(false);
        setTestResult(null);
      }, 2500);
    } catch (err: any) {
      setTestResult({ type: 'error', text: err?.message || 'Gagal mengirim pesan tes' });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        {/* CARD HEADER */}
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="card-title">
            <span style={{ fontSize: '1.4rem' }}>📱</span>
            <div>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Koneksi WhatsApp (Multi-Akun)</span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    background: connectedCount > 0 ? 'var(--wa-teal)' : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontWeight: 600,
                  }}
                >
                  {connectedCount} / 5 Akun Terhubung
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Hubungkan hingga 5 akun WhatsApp sekaligus untuk rotasi pesan dan proteksi anti-ban maksimal
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`status-pill ${connectedCount > 0 ? 'connected' : 'disconnected'}`}>
              <span className="pulsing-dot" />
              {connectedCount > 0 ? `${connectedCount} Akun Online` : 'Belum Ada Akun Terhubung'}
            </span>
          </div>
        </div>

        {/* 5 ACCOUNT SELECTOR TABS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 8,
            marginBottom: 20,
            padding: 4,
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {accounts.map((acc, idx) => {
            const isSelected = acc.id === currentAccount.id;
            const isConn = acc.status === 'connected';
            const isWaiting = acc.status === 'waiting_qr';
            const isConnecting = acc.status === 'connecting';

            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => setSelectedAccountId(acc.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected ? '1.5px solid var(--wa-emerald)' : '1px solid transparent',
                  background: isSelected
                    ? 'rgba(0, 168, 132, 0.18)'
                    : isConn
                    ? 'rgba(0, 168, 132, 0.06)'
                    : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isSelected ? '#fff' : 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.label || `Akun ${idx + 1}`}
                  </span>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: isConn ? '#22c55e' : isWaiting ? '#eab308' : isConnecting ? '#38bdf8' : '#6b7280',
                      flexShrink: 0,
                    }}
                  />
                </div>
                <div style={{ fontSize: '0.7rem', color: isConn ? 'var(--wa-emerald)' : 'var(--text-muted)' }}>
                  {isConn ? (acc.userInfo?.phone ? `+${acc.userInfo.phone}` : 'Terhubung') : isWaiting ? 'Scan QR' : isConnecting ? 'Menghubungkan...' : 'Nonaktif'}
                </div>
              </button>
            );
          })}
        </div>

        {/* ACTIVE ACCOUNT DETAILS CARD */}
        <div
          style={{
            background: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            padding: 18,
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* Header of Active Account Tab */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>
                {currentAccount.status === 'connected' ? '🟢' : currentAccount.status === 'waiting_qr' ? '🟡' : '⚪'}
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.96rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{currentAccount.label}</span>
                  <button
                    type="button"
                    onClick={() => handleOpenRename(currentAccount)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}
                    title="Ganti Label Akun"
                  >
                    ✏️ Edit Nama
                  </button>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  ID Slot: <code>{currentAccount.id}</code> &bull; Status: {currentAccount.status === 'connected' ? 'Terhubung (Online)' : currentAccount.status === 'waiting_qr' ? 'Menunggu Scan QR' : currentAccount.status === 'connecting' ? 'Menghubungkan...' : 'Belum Terhubung'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {currentAccount.status === 'connected' && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setTestAccountId(currentAccount.id);
                      setShowTestModal(true);
                    }}
                  >
                    ✉️ Uji Coba Kirim
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={Boolean(loadingAction)}
                    onClick={() => handleAccountAction(currentAccount.id, 'disconnect')}
                  >
                    {loadingAction === `${currentAccount.id}-disconnect` ? 'Memutus...' : 'Putus Koneksi'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* STATUS: DISCONNECTED */}
          {currentAccount.status === 'disconnected' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 4 }}>
                  Slot <strong>{currentAccount.label}</strong> belum terhubung ke WhatsApp.
                </p>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Klik tombol di samping untuk memunculkan QR Code khusus akun ini dan scan dari WhatsApp di HP Anda.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(loadingAction)}
                onClick={() => handleAccountAction(currentAccount.id, 'connect')}
              >
                {loadingAction === `${currentAccount.id}-connect` ? 'Menyiapkan...' : `⚡ Hubungkan ${currentAccount.label}`}
              </button>
            </div>
          )}

          {/* STATUS: WAITING QR */}
          {currentAccount.status === 'waiting_qr' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
              <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 2 }}>
                Scan QR Code ini untuk menghubungkan <strong>{currentAccount.label}</strong>:
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                Buka WhatsApp di HP &rarr; Menu Perangkat Tertaut (Linked Devices) &rarr; Tautkan Perangkat
              </p>

              {currentAccount.qrCodeDataUrl ? (
                <div
                  style={{
                    background: '#ffffff',
                    padding: 14,
                    borderRadius: 'var(--radius-lg)',
                    display: 'inline-block',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    marginBottom: 14,
                  }}
                >
                  <img
                    src={currentAccount.qrCodeDataUrl}
                    alt={`WhatsApp QR Code - ${currentAccount.label}`}
                    style={{ width: 210, height: 210, display: 'block' }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: 210,
                    height: 210,
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    marginBottom: 14,
                  }}
                >
                  Memuat QR Code...
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={Boolean(loadingAction)}
                  onClick={() => handleAccountAction(currentAccount.id, 'reconnect')}
                >
                  🔄 Refresh QR Code
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={Boolean(loadingAction)}
                  onClick={() => handleAccountAction(currentAccount.id, 'disconnect')}
                >
                  ✕ Batal
                </button>
              </div>
            </div>
          )}

          {/* STATUS: CONNECTING */}
          {currentAccount.status === 'connecting' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div className="pulsing-dot" style={{ width: 16, height: 16, margin: '0 auto 10px auto', color: 'var(--wa-emerald)' }} />
              <p style={{ color: 'var(--text-main)', fontWeight: 500 }}>Menghubungkan {currentAccount.label} ke server WhatsApp...</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                Mohon tunggu beberapa detik saat sesi WhatsApp diinisialisasi.
              </p>
            </div>
          )}

          {/* STATUS: CONNECTED */}
          {currentAccount.status === 'connected' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: 'rgba(0, 168, 132, 0.2)',
                  border: '2px solid var(--wa-emerald)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                }}
              >
                👤
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#ffffff' }}>
                  {currentAccount.userInfo?.name || currentAccount.label}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--wa-emerald)', marginTop: 2 }}>
                  +{currentAccount.userInfo?.phone || 'Nomor Terhubung'} &bull; Aktif & Siap Mengirim Broadcast
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MULTI-ACCOUNT ROTATION INFO BANNER */}
        <div
          style={{
            marginTop: 14,
            padding: '10px 14px',
            background: 'rgba(0, 168, 132, 0.08)',
            border: '1px solid rgba(0, 168, 132, 0.2)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.82rem',
            color: 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🛡️</span>
          <div>
            <strong style={{ color: '#fff' }}>Fitur Multi-Akun Otomatis:</strong> Anda dapat menghubungkan hingga 5 nomor WhatsApp berbeda. Saat mengirim broadcast atau membuat jadwal, Anda bisa memilih <strong>Rotasi Otomatis</strong> agar pesan dikirim bergantian antar nomor yang aktif sehingga risiko ban nomor berkurang drastis!
          </div>
        </div>
      </div>

      {/* MODAL RENAME ACCOUNT */}
      {showRenameModal && (
        <div className="modal-overlay" onClick={() => setShowRenameModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>✏️ Ganti Nama Label Akun</h3>
              <button className="close-btn" onClick={() => setShowRenameModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSaveRename}>
              <div className="form-group">
                <label className="form-label">Nama / Label Akun</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Admin CS, Sales 1, WA Pribadi"
                  value={newLabelInput}
                  onChange={(e) => setNewLabelInput(e.target.value)}
                  required
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Beri nama yang mudah dikenali untuk mengidentifikasi nomor ini saat broadcast.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRenameModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan Nama
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <label className="form-label">Kirim Menggunakan Akun</label>
                <select
                  className="form-select"
                  value={testAccountId}
                  onChange={(e) => setTestAccountId(e.target.value)}
                >
                  {accounts
                    .filter((a) => a.status === 'connected')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} (+{a.userInfo?.phone || 'Nomor Aktif'})
                      </option>
                    ))}
                </select>
              </div>

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
