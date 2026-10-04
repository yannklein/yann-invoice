import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { readSettings, syncIndex } from '@/lib/index/store';
import { deriveBanks, deriveClients } from '@/lib/invoice/derive';
import { NewInvoiceForm } from './NewInvoiceForm';

export default async function NewInvoicePage() {
  const g = await getGoogle();
  const ids = await requireIds(g);
  const [rows, settings] = await Promise.all([syncIndex(g, ids), readSettings(g.sheets, ids.indexId)]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  return (
    <NewInvoiceForm
      clients={deriveClients(rows)}
      banks={deriveBanks(rows)}
      numbers={rows.map((r) => r.invoice.number)}
      settings={settings}
      today={today}
    />
  );
}
