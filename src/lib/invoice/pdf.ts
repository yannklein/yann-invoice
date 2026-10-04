import type { IndexRow } from './derive';

export const sheetUrl = (fileId: string) => `https://docs.google.com/spreadsheets/d/${fileId}/edit`;

export function pdfExportUrl(fileId: string): string {
  const params = new URLSearchParams({
    format: 'pdf', size: 'A4', portrait: 'true', fitw: 'true', gridlines: 'false',
    printtitle: 'false', sheetnames: 'false', pagenum: 'UNDEFINED',
  });
  return `https://docs.google.com/spreadsheets/d/${fileId}/export?${params}`;
}

export function pdfFileName(row: IndexRow): string {
  const { number, clientName } = row.invoice;
  const base = number ? `Invoice ${number} - ${clientName}` : row.title;
  return `${base.replace(/[/\\:*?"<>|]/g, '-')}.pdf`;
}

export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
