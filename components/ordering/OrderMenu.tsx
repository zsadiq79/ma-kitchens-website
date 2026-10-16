'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  foodMoney, MAX_ORDER_QUANTITY, orderSelection, fallbackOrderTarget,
  readPublishedOrderMenu, selectedOrderTarget,
} from '../../lib/publishedOrderMenu.mjs';
import styles from './OrderMenu.module.css';

type Menu = {
  menuCycleId: string;
  deliveryDate: string;
  deliveryDateDisplay: string;
  publishedAt: string;
  meals: { dishName: string; price: number; priceDisplay?: string }[];
};

function WhatsAppIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6A12 12 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5ZM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.3-.4A10 10 0 1 1 12 22Zm5.5-7.5c-.3-.1-1.8-.9-2.1-1-.3-.1-.5-.1-.7.2-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.5s1.1 2.9 1.3 3.1c.2.2 2.1 3.2 5.1 4.4l1.7.6c.7.2 1.3.2 1.8.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.3-.6-.4Z" /></svg>;
}

export function OrderMenu({ menu }: { menu: Menu | null }) {
  const [quantities, setQuantities] = useState<string[]>(() => menu ? menu.meals.map(() => '') : []);
  const [expired, setExpired] = useState(false);
  const [message, setMessage] = useState('');
  const record = menu ? { schemaVersion: 1, ...menu } : null;
  const selection = menu ? orderSelection(menu, quantities) : null;
  const ready = Boolean(selection?.items.length && !selection.invalidIndexes.length && !expired);

  useEffect(() => {
    if (!menu) return;
    const check = () => {
      if (!readPublishedOrderMenu({ schemaVersion: 1, ...menu })) setExpired(true);
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, [menu]);

  function updateQuantity(index: number, value: string) {
    setQuantities(current => current.map((quantity, i) => i === index ? value : quantity));
    setMessage('');
  }

  function stepQuantity(index: number, change: number) {
    const current = /^\d+$/.test(quantities[index]) ? Number(quantities[index]) : 0;
    const next = Math.max(0, Math.min(MAX_ORDER_QUANTITY, current + change));
    updateQuantity(index, next ? String(next) : '');
  }

  function continueToWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      // Recheck expiry on the actual tap, even if the page was left open overnight.
      const url = selectedOrderTarget(record, quantities);
      window.location.assign(url.toString());
    } catch (error) {
      if (error instanceof Error && error.message === 'MENU_EXPIRED') {
        setExpired(true); setMessage('This menu has closed. Ask us for the current menu below.');
      } else setMessage('Enter a whole-number quantity for the dishes you would like.');
    }
  }

  const unavailable = !menu || expired;
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <a href="/" className={styles.brand} aria-label="Ma Kitchens home">Ma Kitchens<span className={styles.brandDot} aria-hidden="true">✳</span></a>
        <span className={styles.headerNote}>Home cooked. With heart.</span>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>Choose your dishes</h1>
          {unavailable ? <p className={styles.lead}>Our current menu is closed. Get in touch and we’ll help you with what’s coming next.</p> : <>
            <p className={styles.lead}>Enter quantities for your favourites.<br />Leave everything else blank.</p>
            <div className={styles.delivery}><span aria-hidden="true">◷</span> Delivery {menu.deliveryDateDisplay}</div>
          </>}
        </div>
        {unavailable ? <section className={styles.closed} aria-label="Menu unavailable">
          <h2>A fresh menu is on its way</h2>
          <p>Ask us for the current menu on WhatsApp.</p>
          <a className={styles.whatsappButton} href={fallbackOrderTarget().toString()}><WhatsAppIcon />Ask for the current menu</a>
        </section> : <form onSubmit={continueToWhatsApp} noValidate>
          <div className={styles.listHeading}><h2>This week’s dishes</h2><span>QUANTITY</span></div>
          <div className={styles.dishList}>
            {menu.meals.map((meal, index) => {
              const invalid = Boolean(selection?.invalidIndexes.includes(index));
              const selected = !invalid && Number(quantities[index]) > 0;
              return <div key={index} className={`${styles.dish} ${selected ? styles.selected : ''}`}>
                <div className={styles.dishInfo}><span className={styles.dishNumber}>{String(index + 1).padStart(2, '0')}</span>
                  <div><label htmlFor={`quantity-${index}`} className={styles.dishName}>{meal.dishName}</label>
                    <p className={styles.price}>{foodMoney(Math.round(meal.price * 100))}<span> each</span></p>
                  </div>
                </div>
                <div className={styles.quantityArea}>
                  <div className={`${styles.quantity} ${invalid ? styles.invalid : ''}`}>
                    <button type="button" aria-label={`Remove one ${meal.dishName}`} disabled={!quantities[index] || quantities[index] === '0'} onClick={() => stepQuantity(index, -1)}>−</button>
                    <input id={`quantity-${index}`} aria-label={`Quantity for ${meal.dishName}`} type="text" inputMode="numeric" enterKeyHint="next" autoComplete="off" maxLength={6} placeholder="Qty" value={quantities[index]} onChange={event => updateQuantity(index, event.target.value)} onFocus={event => event.target.select()} onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        const next = document.getElementById(`quantity-${index + 1}`) || document.getElementById('continue-order');
                        next?.focus();
                      }
                    }} aria-invalid={invalid || undefined} aria-describedby={invalid ? `error-${index}` : undefined} />
                    <button type="button" aria-label={`Add one ${meal.dishName}`} disabled={Number(quantities[index]) >= MAX_ORDER_QUANTITY} onClick={() => stepQuantity(index, 1)}>+</button>
                  </div>
                  {invalid && <p id={`error-${index}`} className={styles.fieldError}>Use a whole number, 1–999.</p>}
                </div>
              </div>;
            })}
          </div>
          <p className={styles.afterList}>Made by local cooks. Chosen by you.</p>
          <div className={styles.orderBar}>
            <div className={styles.orderBarInner}>
              <div className={styles.summary} aria-live="polite" aria-atomic="true">
                <div><span className={styles.summaryTitle}>{selection?.items.length ? `${selection.items.length} ${selection.items.length === 1 ? 'dish' : 'dishes'} · ${selection.totalQuantity} ${selection.totalQuantity === 1 ? 'item' : 'items'}` : 'Your selection starts here'}</span>
                  <span className={styles.summaryHint}>Food subtotal · delivery confirmed in WhatsApp</span></div>
                <strong>{foodMoney(selection?.subtotalCents || 0)}</strong>
              </div>
              {message && <p className={styles.formError} role="alert">{message}</p>}
              <button id="continue-order" className={styles.whatsappButton} type="submit" disabled={!ready}><WhatsAppIcon />Continue to WhatsApp<span aria-hidden="true">↗</span></button>
              <p className={styles.sendNote}>Review your message in WhatsApp, then press Send.</p>
            </div>
          </div>
        </form>}
        <footer className={styles.footer}><a href="/privacy">Privacy</a><span>Ma Kitchens · Sydney</span></footer>
      </main>
    </div>
  );
}
