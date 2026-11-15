// The rule for new passwords (register, reset, activation), shared by the form checklist and the submit check: 6 to 72
// characters, nothing else (the association asked for no other restriction). The server repeats it for its own
// accounts; Supabase applies its project's minimum length as well.

export const MIN_LENGTH = 6
export const MAX_LENGTH = 72 // bytes: bcrypt (and Supabase) only use the first 72

// Each rule: id (also the string key suffix), whether it passes, and whether it is required to submit.
export function checkPassword(pw = '') {
  const length = [...pw].length
  const bytes = new TextEncoder().encode(pw).length
  const rules = [{ id: 'length', ok: length >= MIN_LENGTH && bytes <= MAX_LENGTH, required: true }]
  const ok = rules[0].ok
  // the meter only informs, it never blocks: 0 empty, 1 too short, then by length: 2 (4+), 3 (10+), 4 (16+)
  const score = !pw ? 0 : !ok ? 1 : length >= 16 ? 4 : length >= 10 ? 3 : 2
  return { rules, ok, score }
}

// A random 16-character password with every character class, without look-alike characters (0/O, 1/l/I),
// grouped as xxxx-xxxx-xxxx-xxxx so it is easy to read and type once.
export function suggestPassword(rand = (n) => crypto.getRandomValues(new Uint32Array(n))) {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%&*?']
  const all = sets.join('')
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = rand(15)
    const chars = Array.from(r, (x, i) => (i < 4 ? sets[i][x % sets[i].length] : all[x % all.length]))
    // shuffle so the guaranteed classes are not always first
    const order = rand(chars.length)
    for (let i = chars.length - 1; i > 0; i--) { const j = order[i] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
    const pw = [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 11), chars.slice(11)].map((g) => g.join('')).join('-')
    if (checkPassword(pw).ok) return pw
  }
  return 'Bs7#kQ2v-Rt9!xW4m' // practically unreachable; still meets every rule
}
