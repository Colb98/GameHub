/** Deterministic prototype-style cover gradients (oklch hue from the slug).
 *  Lightness/chroma come from CSS variables so covers adapt to dark mode. */
export function coverHue(slug: string, offset = 0): number {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash + offset) % 360;
}

export function coverGradient(slug: string, offset = 0): string {
  const h = coverHue(slug, offset);
  return `linear-gradient(135deg, oklch(var(--cover-l1) var(--cover-c1) ${h}), oklch(var(--cover-l2) var(--cover-c2) ${(h + 35) % 360}))`;
}

export function gameMediaUrl(mediaPath: string | null | undefined): string | null {
  if (!mediaPath) return null;
  const base = process.env.NEXT_PUBLIC_GAMES_BASE_URL ?? 'http://localhost:4000/g';
  return `${base.replace(/\/$/, '')}/${mediaPath}`;
}

export type BannerWidth = 256 | 512 | 768 | 1280;

/** URL for a server-cached banner rendition. The API only permits these
 * fixed widths so a caller cannot create an unbounded number of files. */
export function gameBannerUrl(
  mediaPath: string | null | undefined,
  width: BannerWidth,
): string | null {
  if (!mediaPath) return null;
  const base =
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  const query = new URLSearchParams({
    path: mediaPath,
    width: String(width),
  });
  return `${base.replace(/\/$/, '')}/media/banner?${query.toString()}`;
}

export function gameBannerSrcSet(
  mediaPath: string | null | undefined,
  widths: BannerWidth[],
): string | undefined {
  if (!mediaPath) return undefined;
  return widths
    .map((width) => `${gameBannerUrl(mediaPath, width)} ${width}w`)
    .join(', ');
}

const NEW_BADGE_DAYS = 21;

/** "NEW" badge for games released within the last three weeks. */
export function isNewGame(releaseDate: string | null): boolean {
  if (!releaseDate) return false;
  const age = Date.now() - new Date(releaseDate).getTime();
  return age >= 0 && age < NEW_BADGE_DAYS * 24 * 60 * 60 * 1000;
}
