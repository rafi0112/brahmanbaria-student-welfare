// Password rules for new passwords (register, reset, activation), shared by the form checklist and the submit check.
// The server repeats the same rules for its own accounts; Supabase enforces its project's password policy as well.

export const MIN_LENGTH = 10
export const MAX_LENGTH = 72 // bcrypt (and Supabase) only use the first 72 bytes

// A short list of passwords and patterns people reach for first. The meter treats anything built on them as weak.
const COMMON = ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'football',
  'bangladesh', 'dhaka', 'brahmanbaria', 'bswa', 'jagannath', 'jnu', 'student', 'abc123', '123456', '111111', '000000']

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiopasdfghjklzxcvbnm']

function hasSequence(pw, n = 4) {
  const s = pw.toLowerCase()
  for (const seq of SEQUENCES) {
    for (let i = 0; i + n <= seq.length; i++) {
      const part = seq.slice(i, i + n)
      if (s.includes(part) || s.includes([...part].reverse().join(''))) return true
    }
  }
  return false
}

// Words from the person's own name and email that should not appear in the password.
function personalWords({ email = '', name = '' } = {}) {
  const local = String(email).split('@')[0] || ''
  return [local, ...String(name).split(/\s+/), ...local.split(/[._\-+0-9]+/)]
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3)
}

// Each rule: id (also the string key suffix), whether it passes, and whether it is required to submit.
export function checkPassword(pw = '', who = {}) {
  const lower = pw.toLowerCase()
  const personal = personalWords(who)
  const rules = [
    { id: 'length', ok: pw.length >= MIN_LENGTH && pw.length <= MAX_LENGTH, required: true },
    { id: 'lower', ok: /[a-z]/.test(pw), required: true },
    { id: 'upper', ok: /[A-Z]/.test(pw), required: true },
    { id: 'digit', ok: /\d/.test(pw), required: true },
    { id: 'symbol', ok: /[^A-Za-z0-9\s]/.test(pw), required: true },
    { id: 'personal', ok: pw.length > 0 && !personal.some((w) => lower.includes(w)), required: true },
    { id: 'common', ok: pw.length > 0 && !COMMON.some((w) => lower.includes(w)) && !hasSequence(pw) && !/(.)\1\1/.test(pw), required: true },
  ]
  const ok = rules.every((r) => !r.required || r.ok)
  // 0 empty, 1 weak, 2 fair, 3 good, 4 strong
  let score = 0
  if (pw) {
    const passed = rules.filter((r) => r.ok).length
    score = passed <= 3 ? 1 : passed <= 5 ? 2 : ok ? (pw.length >= 14 ? 4 : 3) : 2
  }
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
