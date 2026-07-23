export type ClientDuplicateReason = 'exact_phone' | 'exact_name' | 'similar_name'

export interface ClientDuplicateCandidate {
  id: string
  full_name: string
  phone: string | null
  birth_date?: string | null
}

export interface PotentialClientDuplicate extends ClientDuplicateCandidate {
  reason: ClientDuplicateReason
}

export function normalizeClientPhone(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length < 7) return digits
  // The same Uzbek number is often entered once as +998 XX XXX XX XX and
  // another time without the country code. Comparing the last 9 digits avoids
  // creating a duplicate because of formatting alone.
  return digits.length >= 9 ? digits.slice(-9) : digits
}

export function normalizeClientName(value: string | null | undefined) {
  return (value ?? '')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function levenshtein(left: string, right: string) {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(left[i - 1] !== right[j - 1]),
      )
    }
    previous = current
  }
  return previous[right.length]
}

function findNameReason(input: string, candidate: string): ClientDuplicateReason | null {
  if (!input || !candidate) return null
  if (input === candidate) return 'exact_name'

  const inputTokens = input.split(' ')
  const candidateTokens = candidate.split(' ')

  // A surname or first name alone is too broad a signal: it would produce
  // false positives for many unrelated clients. Similarity starts at two
  // name parts; exact full-name matching above remains available.
  if (inputTokens.length < 2 || candidateTokens.length < 2) return null

  const sharedTokens = inputTokens.filter(token => candidateTokens.includes(token)).length
  const shortestTokenCount = Math.min(inputTokens.length, candidateTokens.length)

  if (shortestTokenCount >= 2 && sharedTokens >= 2 && sharedTokens / shortestTokenCount >= 0.75) {
    return 'similar_name'
  }

  if (input.length >= 6 && candidate.length >= 6 && (input.includes(candidate) || candidate.includes(input))) {
    return 'similar_name'
  }

  const maxLength = Math.max(input.length, candidate.length)
  const similarity = 1 - levenshtein(input, candidate) / maxLength
  return input.length >= 7 && candidate.length >= 7 && similarity >= 0.82
    ? 'similar_name'
    : null
}

const reasonPriority: Record<ClientDuplicateReason, number> = {
  exact_phone: 3,
  exact_name: 2,
  similar_name: 1,
}

export function findPotentialClientDuplicates(
  candidates: readonly ClientDuplicateCandidate[],
  input: { full_name?: string | null; phone?: string | null },
): PotentialClientDuplicate[] {
  const normalizedName = normalizeClientName(input.full_name)
  const normalizedPhone = normalizeClientPhone(input.phone)

  return candidates
    .flatMap(candidate => {
      const phoneMatches = normalizedPhone.length >= 9
        && normalizedPhone === normalizeClientPhone(candidate.phone)
      const nameReason = normalizedName.length >= 3
        ? findNameReason(normalizedName, normalizeClientName(candidate.full_name))
        : null
      const reason = phoneMatches ? 'exact_phone' : nameReason
      return reason ? [{ ...candidate, reason }] : []
    })
    .sort((left, right) => reasonPriority[right.reason] - reasonPriority[left.reason]
      || left.full_name.localeCompare(right.full_name, 'ru'))
}
