// The monogram of a person without a photo: one letter, the first letter of their name (a bracket or quote before it is not a letter).
export function initials(name) {
  const first = String(name || '').trim().match(/[\p{L}\p{N}]/u)
  return first ? first[0].toUpperCase() : '?'
}
