'use client';

import React, { useState, useEffect } from 'react';
import WaConnectionCard from '@/components/WaConnectionCard';
import ScheduleModal from '@/components/ScheduleModal';
import ScheduleFileManager from '@/components/ScheduleFileManager';
import ContactManager from '@/components/ContactManager';
import TemplateManager from '@/components/TemplateManager';
import LogsViewer from '@/components/LogsViewer';
import QuickBroadcastModal from '@/components/QuickBroadcastModal';
import { BroadcastSchedule, AttachedFile, MessageTemplate } from '@/types';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'files' | 'contacts' | 'templates' | 'logs'>('dashboard');

  // Modal States
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [selectedFileForSchedule, setSelectedFileForSchedule] = useState<AttachedFile | null>(null);

  // Dashboard Stats & Schedules
  const [schedules, setSchedules] = useState<BroadcastSchedule[]>([]);
  const [stats, setStats] = useState({
    activeSchedules: 0,
    totalContacts: 0,
    totalFiles: 0,
    totalLogs: 0,
  });

  const loadDashboardData = async () => {
    try {
      const [schRes, contactsRes, filesRes, logsRes] = await Promise.all([
        fetch('/api/schedules'),
        fetch('/api/contacts'),
        fetch('/api/files'),
        fetch('/api/logs'),
      ]);

      const [schData, contactsData, filesData, logsData] = await Promise.all([
        schRes.json(),
        contactsRes.json(),
        filesRes.json(),
        logsRes.json(),
      ]);

      const validSchedules = Array.isArray(schData) ? schData : [];
      setSchedules(validSchedules);

      setStats({
        activeSchedules: validSchedules.filter((s: BroadcastSchedule) => s.status === 'active').length,
        totalContacts: Array.isArray(contactsData) ? contactsData.length : 0,
        totalFiles: Array.isArray(filesData) ? filesData.length : 0,
        totalLogs: Array.isArray(logsData) ? logsData.length : 0,
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleScheduleWithFile = (file: AttachedFile) => {
    setSelectedFileForSchedule(file);
    setShowScheduleModal(true);
  };

  const handleInstantWithFile = (file: AttachedFile) => {
    setSelectedFileForSchedule(file);
    setShowQuickModal(true);
  };

  const handleUseTemplate = (template: MessageTemplate) => {
    setSelectedFileForSchedule(null);
    setShowScheduleModal(true);
  };

  const handleDeleteSchedule = async (id: string, title: string) => {
    if (!confirm(`Hapus jadwal "${title}"?`)) return;
    try {
      await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      loadDashboardData();
    } catch (err) {
      console.error('Error deleting schedule:', err);
    }
  };

  const handleToggleSchedule = async (schedule: BroadcastSchedule) => {
    const newStatus = schedule.status === 'active' ? 'paused' : 'active';
    try {
      await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      loadDashboardData();
    } catch (err) {
      console.error('Error updating schedule status:', err);
    }
  };

  return (
    <div className="app-container">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">⚡</div>
          <div>
            <div className="brand-title">Share Otomatis</div>
            <div className="brand-subtitle">WA Scheduler & Bot</div>
          </div>
        </div>

        <ul className="nav-list">
          <li>
            <button
              className={`nav-item-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <span className="nav-icon">📊</span>
              <span>Dashboard & Jadwal</span>
              {stats.activeSchedules > 0 && (
                <span className="nav-badge" style={{ background: 'var(--wa-emerald)', color: '#0b141a', fontWeight: 600 }}>
                  {stats.activeSchedules}
                </span>
              )}
            </button>
          </li>
          <li>
            <button
              className={`nav-item-btn ${activeTab === 'files' ? 'active' : ''}`}
              onClick={() => setActiveTab('files')}
            >
              <span className="nav-icon">📁</span>
              <span>File Dokumen Jadwal</span>
              <span className="nav-badge">{stats.totalFiles}</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-item-btn ${activeTab === 'contacts' ? 'active' : ''}`}
              onClick={() => setActiveTab('contacts')}
            >
              <span className="nav-icon">👥</span>
              <span>Kontak & Grup WA</span>
              <span className="nav-badge">{stats.totalContacts}</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-item-btn ${activeTab === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveTab('templates')}
            >
              <span className="nav-icon">📝</span>
              <span>Template Pesan</span>
            </button>
          </li>
          <li>
            <button
              className={`nav-item-btn ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              <span className="nav-icon">📜</span>
              <span>Riwayat Pengiriman</span>
              <span className="nav-badge">{stats.totalLogs}</span>
            </button>
          </li>
        </ul>

        {/* BOTTOM QUICK ACTIONS */}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '0.85rem' }}
            onClick={() => {
              setSelectedFileForSchedule(null);
              setShowScheduleModal(true);
            }}
          >
            ➕ Buat Jadwal Baru
          </button>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: '0.85rem' }}
            onClick={() => {
              setSelectedFileForSchedule(null);
              setShowQuickModal(true);
            }}
          >
            🚀 Kirim Broadcast Cepat
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h1 style={{ fontSize: '1.6rem', color: '#ffffff' }}>Pusat Kontrol Jadwal Otomatis</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Kirim chat dan bagikan file jadwal ke WhatsApp secara berkala dan otomatis
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSelectedFileForSchedule(null);
                    setShowQuickModal(true);
                  }}
                >
                  🚀 Broadcast Instan
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setSelectedFileForSchedule(null);
                    setShowScheduleModal(true);
                  }}
                >
                  📅 + Buat Jadwal Baru
                </button>
              </div>
            </div>

            {/* WA CONNECTION CARD */}
            <WaConnectionCard />

            {/* STATS OVERVIEW GRID */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: 'var(--wa-emerald)' }}>
                  📅
                </div>
                <div className="stat-info">
                  <span className="stat-value">{stats.activeSchedules}</span>
                  <span className="stat-label">Jadwal Aktif</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                  📁
                </div>
                <div className="stat-info">
                  <span className="stat-value">{stats.totalFiles}</span>
                  <span className="stat-label">File Jadwal Tersimpan</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                  👥
                </div>
                <div className="stat-info">
                  <span className="stat-value">{stats.totalContacts}</span>
                  <span className="stat-label">Total Kontak Tujuan</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                  📨
                </div>
                <div className="stat-info">
                  <span className="stat-value">{stats.totalLogs}</span>
                  <span className="stat-label">Total Riwayat Pesan</span>
                </div>
              </div>
            </div>

            {/* ACTIVE SCHEDULES LIST */}
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <div className="card-title">
                  <span>⏱️</span>
                  <span>Daftar Jadwal Pengiriman Otomatis ({schedules.length})</span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={loadDashboardData}
                >
                  🔄 Perbarui Data
                </button>
              </div>

              {schedules.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>Belum ada jadwal broadcast yang dibuat.</p>
                  <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                    Buat jadwal baru dengan menautkan file dokumen/flyer jadwal dan pesan template Anda.
                  </p>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setSelectedFileForSchedule(null);
                      setShowScheduleModal(true);
                    }}
                  >
                    ➕ Buat Jadwal Sekarang
                  </button>
                </div>
              ) : (
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Nama Jadwal</th>
                        <th>File Tertaut</th>
                        <th>Frekuensi & Waktu</th>
                        <th>Target Penerima</th>
                        <th>Status</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.map((sch) => {
                        return (
                          <tr key={sch.id}>
                            <td>
                              <div style={{ fontWeight: 600, color: '#ffffff' }}>{sch.title}</div>
                              <div
                                style={{
                                  fontSize: '0.78rem',
                                  color: 'var(--text-muted)',
                                  maxWidth: 240,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {sch.message}
                              </div>
                            </td>
                            <td>
                              {sch.attachedFile ? (
                                <div
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    background: 'rgba(0, 168, 132, 0.15)',
                                    color: 'var(--wa-emerald)',
                                    padding: '3px 8px',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.78rem',
                                    maxWidth: 180,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={sch.attachedFile.originalName}
                                >
                                  <span>📎</span>
                                  <span>{sch.attachedFile.originalName}</span>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Tanpa File</span>
                              )}
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  background: 'var(--bg-elevated)',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  marginRight: 6,
                                }}
                              >
                                {sch.scheduleType === 'once'
                                  ? 'Sekali'
                                  : sch.scheduleType === 'daily'
                                  ? 'Harian'
                                  : 'Mingguan'}
                              </span>
                              <span style={{ fontSize: '0.85rem' }}>
                                {sch.scheduleType === 'once'
                                  ? new Date(sch.scheduledTime).toLocaleString('id-ID', {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : sch.recurringTime + ' WIB'}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.82rem' }}>
                                {sch.recipients.type === 'all'
                                  ? 'Semua Kontak'
                                  : sch.recipients.type === 'group'
                                  ? `Grup: ${sch.recipients.targetGroup}`
                                  : `${sch.recipients.customPhones?.length || 0} Nomor`}
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '3px 8px',
                                  borderRadius: 'var(--radius-full)',
                                  fontWeight: 600,
                                  background:
                                    sch.status === 'active'
                                      ? 'rgba(34, 197, 94, 0.15)'
                                      : sch.status === 'completed'
                                      ? 'rgba(56, 189, 248, 0.15)'
                                      : 'rgba(245, 158, 11, 0.15)',
                                  color:
                                    sch.status === 'active'
                                      ? '#4ade80'
                                      : sch.status === 'completed'
                                      ? '#38bdf8'
                                      : '#fbbf24',
                                }}
                              >
                                {sch.status === 'active'
                                  ? '● Aktif'
                                  : sch.status === 'completed'
                                  ? '✓ Selesai'
                                  : '⏸ Jeda'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  title={sch.status === 'active' ? 'Jeda Jadwal' : 'Aktifkan'}
                                  onClick={() => handleToggleSchedule(sch)}
                                >
                                  {sch.status === 'active' ? '⏸' : '▶'}
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ color: '#f87171' }}
                                  title="Hapus Jadwal"
                                  onClick={() => handleDeleteSchedule(sch.id, sch.title)}
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: FILES & ATTACHMENTS */}
        {activeTab === 'files' && (
          <ScheduleFileManager
            onScheduleFile={handleScheduleWithFile}
            onInstantBroadcastFile={handleInstantWithFile}
          />
        )}

        {/* TAB 3: CONTACTS */}
        {activeTab === 'contacts' && <ContactManager />}

        {/* TAB 4: TEMPLATES */}
        {activeTab === 'templates' && (
          <TemplateManager onUseTemplate={handleUseTemplate} />
        )}

        {/* TAB 5: LOGS */}
        {activeTab === 'logs' && <LogsViewer />}
      </main>

      {/* MODAL BUAT JADWAL */}
      <ScheduleModal
        isOpen={showScheduleModal}
        onClose={() => {
          setShowScheduleModal(false);
          setSelectedFileForSchedule(null);
        }}
        onSuccess={() => {
          loadDashboardData();
          setActiveTab('dashboard');
        }}
        initialFile={selectedFileForSchedule}
      />

      {/* MODAL QUICK BROADCAST */}
      <QuickBroadcastModal
        isOpen={showQuickModal}
        onClose={() => {
          setShowQuickModal(false);
          setSelectedFileForSchedule(null);
        }}
        onSuccess={() => {
          loadDashboardData();
          setActiveTab('logs');
        }}
        initialFile={selectedFileForSchedule}
      />
    </div>
  );
}
