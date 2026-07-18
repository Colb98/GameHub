import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Fredoka, Manrope } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { AppShell } from '@/components/AppShell';
import { FavoritesProvider } from '@/components/FavoritesProvider';
import { ToastProvider } from '@/components/Toaster';
import '../globals.css';

// Fredoka has no Vietnamese subset; Manrope (which does) is the fallback font
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fredoka',
});

const manrope = Manrope({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'GameHub — play H5 minigames',
  description: 'Instant-play H5 minigames with leaderboards, ratings and more.',
};

/** Runs before paint: applies the stored theme (or the OS preference) so the
 *  first frame is already in the right mode — no flash on reload. */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('gamehub_theme');var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

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
    <html
      lang={locale}
      className={`${fredoka.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <ToastProvider>
            <FavoritesProvider>
              <AppShell>{children}</AppShell>
            </FavoritesProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
