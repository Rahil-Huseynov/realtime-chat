import '../style.css';
import { NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  setRequestLocale,
} from 'next-intl/server';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Realtime Chat',
  description: 'Private messaging and calls',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!['az', 'en', 'ru'].includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}