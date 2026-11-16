import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  const locale =
    requested && ['az', 'en', 'ru'].includes(requested)
      ? requested
      : 'az';

  const messages = (
    await import(`../../../../locales/${locale}.json`)
  ).default;

  return {
    locale,
    messages,
  };
});