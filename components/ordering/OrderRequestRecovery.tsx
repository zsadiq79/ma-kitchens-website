'use client';

import { useEffect, useState } from 'react';
import { foodMoney } from '../../lib/publishedOrderMenu.mjs';

type Recovery = { reference: string; status: string; deliveryDate: string; publicTotalCents: number; createdAt: string };

const statusText: Record<string, string> = {
  UNASSIGNED: 'Saved. Ma Kitchens still needs to match your WhatsApp message.',
  RECEIVED: 'Your WhatsApp message has been matched to this request.',
  UNDER_REVIEW: 'Ma Kitchens is reviewing this request.',
  ACCEPTED: 'Ma Kitchens accepted this request.',
  REJECTED: 'Ma Kitchens could not accept this request.',
  EXPIRED: 'This request has expired.',
};

export function OrderRequestRecovery() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Recovery | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      let capability = '';
      try {
        const fromLink = window.location.hash.slice(1);
        if (/^[A-Za-z0-9_-]{43}$/.test(fromLink)) {
          capability = fromLink;
          try { window.sessionStorage.setItem('ma-kitchens:order-request-recovery:v1', capability); } catch { /* The fragment capability remains usable without storage. */ }
          window.history.replaceState(null, '', window.location.pathname);
        } else capability = window.sessionStorage.getItem('ma-kitchens:order-request-recovery:v1') || '';
      } catch { capability = ''; }
      if (!/^[A-Za-z0-9_-]{43}$/.test(capability)) {
        if (alive) { setMessage('Open the saved request status link from your order page.'); setLoading(false); }
        return;
      }
      try {
        const response = await fetch('/api/order-requests/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ capability }) });
        const data = await response.json();
        if (!response.ok || !data?.ok) throw new Error();
        if (!data.found) { if (alive) setMessage('We could not find a saved request for this link.'); return; }
        if (alive) setResult(data as Recovery);
      } catch { if (alive) setMessage('Request status is temporarily unavailable. Try again shortly.'); }
      finally { if (alive) setLoading(false); }
    }
    void load();
    return () => { alive = false; };
  }, []);

  return <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 22px', color: '#2f2f2f' }}>
    <a href="/go/order/current" style={{ color: '#476548', fontSize: 13, textDecoration: 'none' }}>← Back to the menu</a>
    <h1 style={{ margin: '28px 0 8px', fontSize: 30 }}>Your order request</h1>
    {loading ? <p>Checking your saved request…</p> : result ? <section aria-live="polite">
      <p style={{ color: '#476548', fontWeight: 700, fontSize: 18 }}>{result.reference}</p>
      <p>{statusText[result.status] || 'Your request status has been updated.'}</p>
      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px 18px', marginTop: 24 }}>
        <dt>Delivery date</dt><dd style={{ margin: 0 }}>{result.deliveryDate}</dd>
        <dt>Public estimate</dt><dd style={{ margin: 0 }}>{foodMoney(result.publicTotalCents)}</dd>
      </dl>
      <p style={{ fontSize: 12, color: '#716c62', marginTop: 24 }}>This status page does not confirm that your WhatsApp message was sent.</p>
    </section> : <p role="status">{message}</p>}
  </main>;
}
