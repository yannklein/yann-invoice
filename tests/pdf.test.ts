import { describe, expect, it } from 'vitest';
import { contentDisposition, pdfExportUrl, pdfFileName } from '@/lib/invoice/pdf';
import { parseInvoice } from '@/lib/invoice/parse';
import { ES_202609003, JP_STEAMPUNK_2021 } from './fixtures/grids';

const row = (grid: string[][], title: string) => ({ fileId: 'f', title, modifiedTime: 'm', meta: {}, invoice: parseInvoice(grid, title) });

describe('pdf helpers', () => {
  it('builds an A4 portrait fit-to-width export URL', () => {
    const url = new URL(pdfExportUrl('abc'));
    expect(url.pathname).toBe('/spreadsheets/d/abc/export');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ format: 'pdf', size: 'A4', portrait: 'true', fitw: 'true', gridlines: 'false' });
  });
  it('names the file by number and client, falling back to the title, without path characters', () => {
    expect(pdfFileName(row(ES_202609003, 'Invoice Le Wagon Spain - 202609003'))).toBe('Invoice 202609003 - LE WAGON SPAIN, S.L.pdf');
    expect(pdfFileName(row(JP_STEAMPUNK_2021, 'Invoice Steampunk Digital - CoffeeCam/iPhone'))).toBe('Invoice Steampunk Digital - CoffeeCam-iPhone.pdf');
  });
  it('encodes non-ASCII names for the download header', () => {
    expect(contentDisposition('Invoice 株式会社.pdf')).toBe(`attachment; filename="Invoice ____.pdf"; filename*=UTF-8''Invoice%20%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE.pdf`);
  });
});
