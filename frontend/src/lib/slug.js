// URL-safe name from the Latin letters and digits of a title ("Rivers of B'baria!" -> "rivers-of-b-baria").
// A Bangla-only title gives "" and the editor asks for a URL name to be typed.
export function slugFrom(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}
