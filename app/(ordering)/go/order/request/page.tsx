import type { Metadata } from 'next';
import { OrderRequestRecovery } from '@/components/ordering/OrderRequestRecovery';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Order request status | Ma Kitchens',
  robots: { index: false, follow: false, nocache: true },
};

export default function OrderRequestStatusPage() {
  return <OrderRequestRecovery />;
}
