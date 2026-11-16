import { createNavigation } from 'next-intl/navigation';

export const locales = ['az', 'en', 'ru'] as const;

export const { Link, redirect, usePathname, useRouter } =
  createNavigation({
    locales,
    defaultLocale: 'az',
    localePrefix: 'as-needed',
  });