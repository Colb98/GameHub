import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { Header } from '@/components/Header';
import '../globals.css';

export const metadata: Metadata = {
  title: 'GameHub — play H5 minigames',
  description: 'Instant-play H5 minigames with leaderboards, ratings and more.',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as never)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Header />
          <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
