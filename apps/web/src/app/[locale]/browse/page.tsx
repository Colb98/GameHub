import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { apiGet } from '@/lib/server-api';
import type { CategoryCount } from '@/lib/types';
import { BrowseClient } from '@/components/BrowseClient';
import { GameCardSkeleton } from '@/components/GameCard';

export const dynamic = 'force-dynamic';

function BrowseSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </div>
  );
}

export default async function BrowsePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const categories = ((await apiGet<CategoryCount[]>('/games/categories')) ?? []).map(
    (c) => c.category,
  );

  return (
    <Suspense fallback={<BrowseSkeleton />}>
      <BrowseClient categories={categories} />
    </Suspense>
  );
}
