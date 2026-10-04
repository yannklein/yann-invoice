import { getGoogle } from '@/lib/google/client';
import { requireIds } from '@/lib/google/drive';
import { readSettings, syncIndex } from '@/lib/index/store';
import { deriveBanks, deriveClients } from '@/lib/invoice/derive';
import { SyncWarning } from '@/components/SyncWarning';
import { NewInvoiceForm } from './NewInvoiceForm';

export default async function NewInvoicePage() {
  const g = await getGoogle();
  const ids = await requireIds(g);
  const [{ rows, failed }, settings] = await Promise.all([syncIndex(g, ids), readSettings(g.sheets, ids.indexId)]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  return (
    <div className="space-y-4">
      <SyncWarning failed={failed.length} consequence="Their data is from the last successful sync, so check the suggested number before creating." />
      <NewInvoiceForm
        clients={deriveClients(rows)}
        banks={deriveBanks(rows)}
        numbers={rows.map((r) => r.invoice.number)}
        settings={settings}
        today={today}
      />
    </div>
  );
}
