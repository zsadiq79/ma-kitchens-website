import type { ReactNode } from 'react';
import { inter, cormorant } from '@/app/fonts';
import '@/app/globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function OrderingLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="font-sans antialiased"><Header compactMobile />{children}<div className="pb-72"><Footer /></div></body>
    </html>
  );
}
