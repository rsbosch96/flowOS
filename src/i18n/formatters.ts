import { defaultCurrency, defaultLocale, type SupportedCurrency, type SupportedLocale } from "./config.ts";

export function formatMoney(minorUnits: number, locale: SupportedLocale = defaultLocale, currency: SupportedCurrency = defaultCurrency): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minorUnits / 100);
}

export function formatDate(value: Date | string | number, locale: SupportedLocale = defaultLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

export function formatNumber(value: number, locale: SupportedLocale = defaultLocale): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(value: number, locale: SupportedLocale = defaultLocale): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value);
}
