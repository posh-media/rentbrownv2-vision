/** Property image asset key → public URL (mirrors apps/web). */
export function propertyImage(key: string): string {
  return `/properties/${key}.jpg`;
}
