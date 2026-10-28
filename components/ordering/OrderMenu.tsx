'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import {
  foodMoney, MAX_ORDER_QUANTITY, orderSelection, fallbackOrderTarget,
  readPublishedOrderMenu, readOrderDraft, orderDraftSignature,
} from '../../lib/publishedOrderMenu.mjs';
import { orderRequestSignature, validOrderRequestKey } from '../../lib/orderRequest.mjs';
import { AVAILABILITY_POLL_MS, readOrderAvailability, blockedOrderItems, lowStockLabel } from '../../lib/orderAvailability.mjs';
import styles from './OrderMenu.module.css';

type Menu = {
  schemaVersion: 2;
  menuRevision: string;
  minimumOrderItems: number;
  deliveryFeeCents: number;
  menuCycleId: string;
  deliveryDate: string;
  deliveryDateDisplay: string;
  publishedAt: string;
  meals: { id: string; dishName: string; price: number; priceDisplay?: string; imageUrl?: string }[];
};

type SavedRequest = { signature: string; reference: string; capability: string; whatsappUrl: string };
type Availability = { status: string; checkedAt: string; items: { id: string; status: string; lowStockRemaining?: number }[] };

function WhatsAppIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6A12 12 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5ZM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.3-.4A10 10 0 1 1 12 22Zm5.5-7.5c-.3-.1-1.8-.9-2.1-1-.3-.1-.5-.1-.7.2-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.5s1.1 2.9 1.3 3.1c.2.2 2.1 3.2 5.1 4.4l1.7.6c.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.3-.6-.4Z" /></svg>;
}

function DishThumbnail({ src, eager }: { src?: string; eager: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.thumbnail}>
    {src && !failed ? <Image src={src} alt="" width={96} height={96} sizes="(max-width: 600px) 80px, 96px" loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} /> :
      <svg aria-hidden="true" viewBox="0 0 48 48" fill="none"><circle cx="26" cy="24" r="13" stroke="currentColor" strokeWidth="1.5" /><circle cx="26" cy="24" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M7 11v12m-3-12v7c0 5 6 5 6 0v-7M7 23v14m34-26v26m0-26c-5 4-5 12 0 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>}
  </div>;
}

export function OrderMenu({ menu }: { menu: Menu | null }) {
  const [quantities, setQuantities] = useState<string[]>(() => menu ? menu.meals.map(() => '') : []);
  const [expired, setExpired] = useState(false);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedRequest, setSavedRequest] = useState<SavedRequest | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);
  const availabilityRef = useRef<Availability | null>(null);
  const availabilityFlight = useRef<Promise<Availability> | null>(null);
  const saveLock = useRef(false);
  const pendingRef = useRef<{signature:string;requestKey:string}|null>(null);
  const [retryKey,setRetryKey] = useState('');
  const minimumOrderItems = menu?.minimumOrderItems ?? 5;
  const deliveryFeeCents = menu?.deliveryFeeCents ?? 1000;
  const selection = menu ? orderSelection(menu, quantities) : null;
  const currentOrderSignature = menu ? orderRequestSignature(menu, quantities) : '';
  const blocked = selection ? blockedOrderItems(availability, selection) : [];
  const statusById = new Map(availability?.items.map(item => [item.id, item.status]) || []);
  const allSoldOut = Boolean(menu && availability?.status === 'OPEN' && menu.meals.every(meal => statusById.get(meal.id) === 'SOLD_OUT'));
  const reopening = savedRequest?.signature === currentOrderSignature;
  const ready = Boolean(selection && selection.totalQuantity >= minimumOrderItems && !selection.invalidIndexes.length && !expired && !stale &&
    (reopening || !blocked.length));

  async function refreshAvailability(): Promise<Availability> {
    if (!menu) throw new Error('MENU_CLOSED');
    if (availabilityFlight.current) return availabilityFlight.current;
    const operation = (async () => {
      const response = await fetch('/api/order-menu/availability', { signal: AbortSignal.timeout(12000) });
      const value = await response.json();
      if (!response.ok) {
        if (value?.error === 'MENU_CLOSED') setExpired(true);
        throw new Error('AVAILABILITY_UNAVAILABLE');
      }
      const result = readOrderAvailability(value, menu) as Availability;
      availabilityRef.current = result;
      setAvailability(result); setAvailabilityError(false);
      if (result.status === 'CLOSED') setExpired(true);
      if (result.status === 'STALE') setStale(true);
      return result;
    })();
    availabilityFlight.current = operation;
    try { return await operation; }
    catch (error) { setAvailabilityError(true); throw error; }
    finally { availabilityFlight.current = null; }
  }

  useEffect(() => {
    if (!menu || expired || stale) return;
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!disposed && document.visibilityState === 'visible') timer = setTimeout(check, AVAILABILITY_POLL_MS);
    };
    const check = async () => {
      if (disposed || document.visibilityState !== 'visible') return;
      try { await refreshAvailability(); } catch { /* The form explains retry; never invent zero stock. */ }
      schedule();
    };
    const visibility = () => {
      if (timer) clearTimeout(timer);
      if (document.visibilityState === 'visible') void check();
    };
    void check();
    document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
    // The published menu is immutable for this page. Quantity edits do not restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, expired, stale]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem('ma-kitchens:pending-order-request:v1');
      const pending = raw ? JSON.parse(raw) : null;
      if (pending && typeof pending.signature === 'string' && validOrderRequestKey(pending.requestKey)) {
        pendingRef.current = pending; setRetryKey(pending.requestKey);
      }
    } catch { /* The in-memory identity still supports retries when storage is disabled. */ }
  }, []);

  useEffect(() => {
    if (!menu) return;
    try {
      const saved = readOrderDraft(window.sessionStorage.getItem('ma-kitchens:order-selection:v1'), menu);
      if (saved) setQuantities(saved);
    } catch { /* Ordering still works when browser storage is unavailable. */ }
    setDraftReady(true);
  }, [menu]);

  useEffect(() => {
    if (!menu || !draftReady) return;
    try {
      if (expired) window.sessionStorage.removeItem('ma-kitchens:order-selection:v1');
      else window.sessionStorage.setItem('ma-kitchens:order-selection:v1', JSON.stringify({
        signature: orderDraftSignature(menu), quantities,
      }));
    } catch { /* Browser storage is optional. */ }
  }, [menu, quantities, draftReady, expired]);

  useEffect(() => {
    if (!menu) return;
    const check = () => {
      if (!readPublishedOrderMenu(menu)) setExpired(true);
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, [menu]);

  useEffect(() => {
    if (!menu || !draftReady) return;
    try {
      const raw = window.sessionStorage.getItem('ma-kitchens:saved-order-request:v1');
      const saved = raw ? JSON.parse(raw) as SavedRequest : null;
      if (saved && typeof saved.signature === 'string' && typeof saved.reference === 'string' &&
          typeof saved.capability === 'string' && typeof saved.whatsappUrl === 'string' &&
          saved.signature === currentOrderSignature) setSavedRequest(saved);
    } catch { /* Recovery from this convenience cache is optional. */ }
  }, [menu, quantities, draftReady, currentOrderSignature]);

  function updateQuantity(index: number, value: string) {
    setQuantities(current => current.map((quantity, i) => i === index ? value : quantity));
    setMessage('');
  }

  function stepQuantity(index: number, change: number) {
    const current = /^\d+$/.test(quantities[index]) ? Number(quantities[index]) : 0;
    const next = Math.max(0, Math.min(MAX_ORDER_QUANTITY, current + change));
    updateQuantity(index, next ? String(next) : '');
  }

  async function continueToWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current) return;
    if (!selection || selection.invalidIndexes.length || selection.totalQuantity < minimumOrderItems || !menu || expired || stale) return;
    const signature = orderRequestSignature(menu, quantities);
    if (savedRequest?.signature === signature) {
      window.location.assign(savedRequest.whatsappUrl);
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setMessage('');
    try {
      let currentAvailability = availabilityRef.current;
      if (!currentAvailability || Date.now() - Date.parse(currentAvailability.checkedAt) > 30000) {
        try { currentAvailability = await refreshAvailability(); }
        catch { /* The existing capture endpoint still checks stock authoritatively. */ }
      }
      if (currentAvailability && currentAvailability.status !== 'OPEN') return;
      const unavailableItems = currentAvailability ? blockedOrderItems(currentAvailability, selection) : [];
      if (unavailableItems.length) {
        setMessage('Some selected dishes are no longer available. Remove them before continuing.'); return;
      }
      let pending = pendingRef.current;
      try {
        const raw = window.sessionStorage.getItem('ma-kitchens:pending-order-request:v1');
        const stored = raw ? JSON.parse(raw) : null;
        if (stored?.signature === signature && validOrderRequestKey(stored.requestKey)) pending = stored;
      } catch { /* Storage is optional. */ }
      const requestKey = pending?.signature === signature ? pending.requestKey : crypto.randomUUID();
      pendingRef.current = {signature,requestKey}; setRetryKey(requestKey);
      try { window.sessionStorage.setItem('ma-kitchens:pending-order-request:v1', JSON.stringify({signature,requestKey})); } catch { /* Keep the identity in memory. */ }
      const response = await fetch('/api/order-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestKey, menuRevision: menu.menuRevision, menuCycleId: menu.menuCycleId,
          deliveryDate: menu.deliveryDate, items: selection.items.map(item => ({ id: item.id, quantity: item.quantity })) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || typeof result.reference !== 'string' ||
          typeof result.capability !== 'string' || typeof result.whatsappUrl !== 'string') {
        if (result?.error === 'MENU_CLOSED' || result?.error === 'MENU_STALE' || result?.error === 'MENU_REVISION_MISMATCH') {
          if (result.error === 'MENU_CLOSED') setExpired(true); else setStale(true);
        } else if (result?.error === 'ITEM_UNAVAILABLE') {
          setMessage('A selected dish no longer has enough servings. Reduce its quantity or remove it, then try again.');
          void refreshAvailability().catch(() => {});
        } else if (result?.error === 'ORDER_CAPTURE_UNCERTAIN') {
          setMessage('We could not confirm the save. Your choices are still here. Try again to check the same request.');
        } else {
          setMessage('We could not save your request. Your choices are still here. Please try again.');
        }
        return;
      }
      const saved: SavedRequest = { signature, reference: result.reference, capability: result.capability, whatsappUrl: result.whatsappUrl };
      setSavedRequest(saved);
      try { window.sessionStorage.setItem('ma-kitchens:saved-order-request:v1', JSON.stringify(saved)); } catch { /* Saving and navigation do not depend on storage. */ }
      window.location.assign(saved.whatsappUrl);
    } catch (error) {
      setMessage('We could not confirm the save. Your choices are still here. Try again to check the same request.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function checkPreviousSave() {
    if (saveLock.current || !retryKey) return;
    saveLock.current = true; setSaving(true);
    try {
      const response = await fetch('/api/order-requests/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestKey:retryKey})});
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error();
      if (!result.found) { setMessage('No saved request was found for that attempt. You can retry your current choices while the menu is open.'); return; }
      const saved = {signature:pendingRef.current?.signature||'',reference:result.reference,capability:result.capability,whatsappUrl:result.whatsappUrl};
      setSavedRequest(saved);
      try { window.sessionStorage.setItem('ma-kitchens:saved-order-request:v1',JSON.stringify(saved)); } catch { /* Optional convenience cache. */ }
      setMessage('Your earlier request is saved. You can reopen WhatsApp using its reference.');
    } catch { setMessage('Request status is temporarily unavailable. Your saved attempt has been kept.'); }
    finally { saveLock.current=false;setSaving(false); }
  }

  const unavailable = !menu || expired || stale;
  return (
    <div className={styles.screen}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>Choose your dishes</h1>
          {unavailable ? <p className={styles.lead}>{stale ? 'This menu has changed. Refresh to load the current dishes before sending a request.' : 'Our current menu is closed. Get in touch and we’ll help you with what’s coming next.'}</p> : <>
            <p className={styles.lead}>Enter quantities for your favourites.<br /><span className={styles.minimum}>Minimum order: {minimumOrderItems} items.</span></p>
            <div className={styles.delivery}><span aria-hidden="true">◷</span> Delivery {menu.deliveryDateDisplay}</div>
          </>}
        </div>
        {!unavailable && <div className={styles.availabilityNotice} role="status" aria-live="polite">
          {allSoldOut ? 'This week’s menu is sold out.' : blocked.length ? 'A selected dish is no longer available. Remove it to continue.' :
            availabilityError ? 'Availability updates are temporarily unavailable. We’ll check again before saving your request.' : ''}
        </div>}
        {unavailable ? <section className={styles.closed} aria-label="Menu unavailable">
          <h2>{stale ? 'Refresh the current menu' : 'A fresh menu is on its way'}</h2>
          <p>{stale ? 'Your saved choices remain in this tab. Refresh the page to load the latest menu.' : 'Ask us for the current menu on WhatsApp.'}</p>
          {stale ? <button className={styles.whatsappButton} type="button" onClick={() => window.location.reload()}>Refresh menu</button> : <a className={styles.whatsappButton} href={fallbackOrderTarget().toString()}><WhatsAppIcon />Ask for the current menu</a>}
        </section> : <form onSubmit={continueToWhatsApp} noValidate>
          <div className={styles.listHeading}><h2>This week’s dishes</h2><span>QUANTITY</span></div>
          <div className={styles.dishList}>
            {menu.meals.map((meal, index) => {
              const invalid = Boolean(selection?.invalidIndexes.includes(index));
              const selected = !invalid && Number(quantities[index]) > 0;
              const dishStatus = statusById.get(meal.id);
              const stockLabel = lowStockLabel(availability?.items.find(item => item.id === meal.id));
              const dishUnavailable = dishStatus === 'SOLD_OUT' || dishStatus === 'UNAVAILABLE';
              return <div key={meal.id} className={`${styles.dish} ${selected ? styles.selected : ''} ${dishUnavailable ? styles.unavailableDish : ''}`}>
                <DishThumbnail key={meal.imageUrl || 'no-photo'} src={meal.imageUrl} eager={index < 2} />
                <div className={styles.dishContent}>
                <div className={styles.dishInfo}>
                  <div><label htmlFor={`quantity-${index}`} className={styles.dishName}>{meal.dishName}</label>
                    <p className={styles.price}>{foodMoney(Math.round(meal.price * 100))}<span> each</span></p>
                    {dishUnavailable && <span id={`availability-${index}`} className={styles.soldOut}>{dishStatus === 'SOLD_OUT' ? 'Sold out' : 'Unavailable'}</span>}
                    {stockLabel && <span id={`availability-${index}`} className={styles.lowStock}>{stockLabel}</span>}
                  </div>
                </div>
                <div className={styles.quantityArea}>
                  <div className={`${styles.quantity} ${invalid ? styles.invalid : ''}`}>
                    <button type="button" aria-label={`Remove one ${meal.dishName}`} disabled={!quantities[index] || quantities[index] === '0'} onClick={() => stepQuantity(index, -1)}>−</button>
                    <input id={`quantity-${index}`} aria-label={`Quantity for ${meal.dishName}`} disabled={dishUnavailable} type="text" inputMode="numeric" enterKeyHint="next" autoComplete="off" maxLength={6} placeholder="Qty" value={quantities[index]} onChange={event => updateQuantity(index, event.target.value)} onFocus={event => event.target.select()} onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const next = document.getElementById(`quantity-${index + 1}`) || document.getElementById('continue-order');
                        next?.focus();
                      }
                    }} aria-invalid={invalid || undefined} aria-describedby={dishUnavailable || stockLabel ? `availability-${index}` : invalid ? `error-${index}` : undefined} />
                    <button type="button" aria-label={`Add one ${meal.dishName}`} disabled={dishUnavailable || Number(quantities[index]) >= MAX_ORDER_QUANTITY} onClick={() => stepQuantity(index, 1)}>+</button>
                  </div>
                  {dishUnavailable && Number(quantities[index]) > 0 && <button type="button" className={styles.removeUnavailable} onClick={() => updateQuantity(index, '')}>Remove {meal.dishName}</button>}
                  {invalid && <p id={`error-${index}`} className={styles.fieldError}>Use a whole number, 1–999.</p>}
                </div>
                </div>
              </div>;
            })}
          </div>
          <p className={styles.afterList}>Made by local cooks. Chosen by you.</p>
          <div className={styles.orderBar}>
            <div className={styles.orderBarInner}>
              <div className={styles.summary} aria-live="polite" aria-atomic="true">
                <div><span className={styles.summaryTitle}>{selection?.items.length ? `${selection.items.length} ${selection.items.length === 1 ? 'dish' : 'dishes'} · ${selection.totalQuantity} ${selection.totalQuantity === 1 ? 'item' : 'items'}` : 'Your selection starts here'}</span>
                  <span className={styles.summaryHint}>{(selection?.totalQuantity || 0) < minimumOrderItems ? `Add ${minimumOrderItems - (selection?.totalQuantity || 0)} more ${(minimumOrderItems - (selection?.totalQuantity || 0)) === 1 ? 'item' : 'items'} to continue` : 'Your order is ready to review'}</span></div>
              </div>
              <div className={styles.costs} aria-live="polite" aria-atomic="true">
                <div><span>Food subtotal</span><span>{foodMoney(selection?.subtotalCents || 0)}</span></div>
                <div><span>Delivery</span><span>{foodMoney(deliveryFeeCents)}</span></div>
                <div className={styles.total}><span>Estimated total</span><strong>{foodMoney((selection?.subtotalCents || 0) + deliveryFeeCents)}</strong></div>
              </div>
              <p className={styles.sendNote}>We’ll confirm availability and your final total.</p>
              {message && <p className={styles.formError} role="alert">{message}</p>}
              <button id="continue-order" className={styles.whatsappButton} type="submit" disabled={!ready || saving}><WhatsAppIcon />{saving ? 'Saving request…' : savedRequest?.signature === currentOrderSignature ? 'Open WhatsApp again' : 'Save request & open WhatsApp'}<span aria-hidden="true">↗</span></button>
              {savedRequest?.signature === currentOrderSignature && <p className={styles.sendNote}>Order ref: {savedRequest.reference}. Your request is saved. Press Send in WhatsApp to send it.</p>}
              {savedRequest?.signature === currentOrderSignature && <p className={styles.sendNote}><a href={`/go/order/request#${savedRequest.capability}`}>Check saved request status</a></p>}
            </div>
          </div>
        </form>}
        {retryKey && <section className={styles.closed} aria-label="Previous request">
          <h2>Check your earlier save</h2>
          <button type="button" className={styles.whatsappButton} disabled={saving} onClick={checkPreviousSave}>Check saved request</button>
          {savedRequest && <p>Order ref: {savedRequest.reference}. <a href={savedRequest.whatsappUrl}>Open WhatsApp</a> · <a href={`/go/order/request#${savedRequest.capability}`}>View status</a></p>}
          {unavailable && message && <p role="status">{message}</p>}
        </section>}
        <section className={styles.explore} aria-label="Explore Ma Kitchens">
          <h2>More from Ma Kitchens</h2>
          <p>Meet the story behind your meals and see what’s cooking.</p>
          <div><a href="/">Explore our website <span aria-hidden="true">↗</span></a><a href="/about">Our story</a><a href="/contact">Get in touch</a></div>
          {!unavailable && <p className={styles.savedNote}>You can return to your choices in this tab.</p>}
        </section>
      </main>
    </div>
  );
}

