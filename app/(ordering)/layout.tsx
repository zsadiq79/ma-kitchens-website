import type { ReactNode } from 'react';
import { inter, cormorant } from '@/app/fonts';
import '@/app/globals.css';

export default function OrderingLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
