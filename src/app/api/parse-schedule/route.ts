import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

export interface ParsedScheduleResult {
  success: boolean;
  rows: Array<{
    id: string;
    tanggal?: string;
    hari?: string;
    waktu?: string;
    kegiatan?: string;
    petugas?: string;
    lokasi?: string;
    keterangan?: string;
    rawData: Record<string, string>;
  }>;
  columns: string[];
  columnMapping: {
    tanggalKey?: string;
    waktuKey?: string;
    kegiatanKey?: string;
    petugasKey?: string;
    lokasiKey?: string;
    keteranganKey?: string;
  };
  detectedDateRange?: string;
  message?: string;
}

function autoDetectColumns(columns: string[]) {
  const mapping: {
    tanggalKey?: string;
    waktuKey?: string;
    kegiatanKey?: string;
    petugasKey?: string;
    lokasiKey?: string;
    keteranganKey?: string;
  } = {};

  for (const col of columns) {
    const c = col.toLowerCase().trim();
    if (!mapping.tanggalKey && (c.includes('tanggal') || c.includes('tgl') || c.includes('date') || c === 'hari')) {
      mapping.tanggalKey = col;
    } else if (!mapping.waktuKey && (c.includes('waktu') || c.includes('jam') || c.includes('time') || c.includes('pukul'))) {
      mapping.waktuKey = col;
    } else if (!mapping.kegiatanKey && (c.includes('kegiatan') || c.includes('acara') || c.includes('agenda') || c.includes('jadwal') || c.includes('materi') || c.includes('topik'))) {
      mapping.kegiatanKey = col;
    } else if (!mapping.petugasKey && (c.includes('petugas') || c.includes('imam') || c.includes('ustadz') || c.includes('penceramah') || c.includes('pemateri') || c.includes('pj'))) {
      mapping.petugasKey = col;
    } else if (!mapping.lokasiKey && (c.includes('lokasi') || c.includes('tempat') || c.includes('ruang') || c.includes('masjid') || c.includes('aula'))) {
      mapping.lokasiKey = col;
    } else if (!mapping.keteranganKey && (c.includes('keterangan') || c.includes('catatan') || c.includes('ket') || c.includes('info') || c.includes('note'))) {
      mapping.keteranganKey = col;
    }
  }

  // Fallback if not matched
  if (!mapping.tanggalKey && columns.length > 0) mapping.tanggalKey = columns[0];
  if (!mapping.kegiatanKey && columns.length > 1) mapping.kegiatanKey = columns[1];
  if (!mapping.waktuKey && columns.length > 2) mapping.waktuKey = columns[2];

  return mapping;
}

function parseExcelBuffer(buffer: Buffer): { rows: any[]; columns: string[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

  if (json.length === 0) return { rows: [], columns: [] };

  const columns = Object.keys(json[0]);
  const rows = json.map((r, i) => {
    const rawData: Record<string, string> = {};
    for (const key of columns) {
      const val = r[key];
      if (val instanceof Date) {
        rawData[key] = val.toISOString().split('T')[0];
      } else {
        rawData[key] = String(val ?? '').trim();
      }
    }
    return {
      id: `row-${i + 1}-${Math.random().toString(36).substring(2, 6)}`,
      rawData,
    };
  });

  return { rows, columns };
}

async function parseDocxBuffer(buffer: Buffer): Promise<{ rows: any[]; columns: string[] }> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    if (lines.length < 2) return { rows: [], columns: [] };

    // Assume tab/comma or bar separated header
    const sep = lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : ',';
    const columns = lines[0].split(sep).map((c) => c.trim()).filter(Boolean);

    const rows = lines.slice(1).map((line, i) => {
      const parts = line.split(sep).map((p) => p.trim());
      const rawData: Record<string, string> = {};
      columns.forEach((col, idx) => {
        rawData[col] = parts[idx] || '';
      });
      return {
        id: `row-doc-${i + 1}`,
        rawData,
      };
    });

    return { rows, columns };
  } catch (err) {
    console.error('Error parsing docx:', err);
    return { rows: [], columns: [] };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { localPath, filePath } = body || {};

    const targetPath = localPath || filePath;
    if (!targetPath || !fs.existsSync(targetPath)) {
      return NextResponse.json(
        { success: false, error: 'Path file tidak valid atau file tidak ditemukan di server' },
        { status: 400 }
      );
    }

    const ext = path.extname(targetPath).toLowerCase();
    const buffer = fs.readFileSync(targetPath);

    let extracted: { rows: any[]; columns: string[] } = { rows: [], columns: [] };

    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      extracted = parseExcelBuffer(buffer);
    } else if (['.docx', '.doc'].includes(ext)) {
      extracted = await parseDocxBuffer(buffer);
    } else {
      // Fallback text parsing
      const text = buffer.toString('utf-8');
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        const sep = lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : ',';
        const columns = lines[0].split(sep).map((c) => c.trim()).filter(Boolean);
        const rows = lines.slice(1).map((line, i) => {
          const parts = line.split(sep).map((p) => p.trim());
          const rawData: Record<string, string> = {};
          columns.forEach((col, idx) => {
            rawData[col] = parts[idx] || '';
          });
          return { id: `row-txt-${i + 1}`, rawData };
        });
        extracted = { rows, columns };
      }
    }

    if (extracted.rows.length === 0 || extracted.columns.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'File berhasil dibaca tetapi tidak ditemukan tabel data jadwal yang valid.',
        rows: [],
        columns: [],
        columnMapping: {},
      });
    }

    const columnMapping = autoDetectColumns(extracted.columns);

    // Standardize row fields based on detected column mapping
    const formattedRows = extracted.rows.map((r) => {
      const raw = r.rawData || {};
      return {
        id: r.id,
        tanggal: columnMapping.tanggalKey ? raw[columnMapping.tanggalKey] : '',
        hari: columnMapping.tanggalKey ? raw[columnMapping.tanggalKey] : '',
        waktu: columnMapping.waktuKey ? raw[columnMapping.waktuKey] : '',
        kegiatan: columnMapping.kegiatanKey ? raw[columnMapping.kegiatanKey] : '',
        petugas: columnMapping.petugasKey ? raw[columnMapping.petugasKey] : '',
        lokasi: columnMapping.lokasiKey ? raw[columnMapping.lokasiKey] : '',
        keterangan: columnMapping.keteranganKey ? raw[columnMapping.keteranganKey] : '',
        rawData: raw,
      };
    });

    // Detect date range if available
    const dates = formattedRows.map((r) => r.tanggal).filter(Boolean);
    let detectedDateRange = '';
    if (dates.length > 0) {
      detectedDateRange = `${dates[0]} s.d. ${dates[dates.length - 1]}`;
    }

    return NextResponse.json({
      success: true,
      rows: formattedRows,
      columns: extracted.columns,
      columnMapping,
      detectedDateRange,
      totalRows: formattedRows.length,
    });
  } catch (error: any) {
    console.error('Error in parse-schedule route:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Gagal mengekstrak isi file jadwal' },
      { status: 500 }
    );
  }
}
