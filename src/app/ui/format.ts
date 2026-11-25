const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const numberFormatter = new Intl.NumberFormat();

export const formatDateTime = (iso: string) => dateFormatter.format(new Date(iso));
export const formatShortDate = (iso: string) => shortDateFormatter.format(new Date(iso));
export const formatNumber = (n: number) => numberFormatter.format(n);

/** Reading time at 230 words per minute. */
export function readingTime(words: number): string {
  const minutes = Math.max(1, Math.round(words / 230));
  return `${minutes} min read`;
}
