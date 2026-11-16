import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['az', 'en', 'ru'],
  defaultLocale: 'az',
  localePrefix: 'as-needed',
});

export const config = {
  matcher: [
    '/',
    '/(az|en|ru)/:path*',
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};