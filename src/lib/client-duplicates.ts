export type ClientDuplicateReason = 'exact_phone' | 'similar_phone' | 'exact_name' | 'similar_name'

export interface ClientDuplicateCandidate {
  id: string
  full_name: string
  phone: string | null
  birth_date?: string | null
  telegram_username?: string | null
}

export interface PotentialClientDuplicate extends ClientDuplicateCandidate {
  reason: ClientDuplicateReason
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h', ң: 'n', ҷ: 'j',
  і: 'i', ї: 'yi', є: 'e', ґ: 'g',
}

/**
 * Единый фонетический ключ для кириллицы и латиницы. Он не предназначен для
 * показа пользователю — только для поиска и проверки дублей.
 */
export function normalizeClientName(value: string | null | undefined) {
  const transliterated = Array.from((value ?? '').toLocaleLowerCase('ru'))
    .map(character => CYRILLIC_TO_LATIN[character] ?? character)
    .join('')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘ʻʼ`´']/g, '')
    // Частые варианты одной и той же узбекской/русской транслитерации.
    .replace(/shch/g, 'shch')
    .replace(/zh/g, 'j')
    .replace(/kh/g, 'h')
    .replace(/gh/g, 'g')
    .replace(/x/g, 'h')

  return transliterated
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function digitsOnly(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

/** Национальная часть телефона: +998 и +7 сравниваются с записью без кода. */
export function normalizeClientPhone(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  const digits = digitsOnly(raw)
  if (!digits) return ''

  // Девятизначный локальный номер тоже может начинаться с 998 (например,
  // 99 804-54-42). Код страны отделяем только при явном «+» или 12 цифрах.
  if (digits.startsWith('998') && (raw.startsWith('+') || digits.length > 9)) {
    return digits.slice(3, 12)
  }
  if (raw.startsWith('+7') && digits.startsWith('7')) return digits.slice(1, 11)
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return digits.slice(1)
  }
  if (digits.length > 10) return digits.slice(-10)
  return digits
}

function appendPhonePart(base: string, part: string, separator = ' ') {
  return part ? `${base}${separator}${part}` : base
}

function formatUzbekPhone(national: string) {
  const digits = national.slice(0, 9)
  let result = '+998'
  result = appendPhonePart(result, digits.slice(0, 2))
  result = appendPhonePart(result, digits.slice(2, 5))
  result = appendPhonePart(result, digits.slice(5, 7), '-')
  result = appendPhonePart(result, digits.slice(7, 9), '-')
  return result
}

function formatRussianPhone(national: string) {
  const digits = national.slice(0, 10)
  let result = '+7'
  result = appendPhonePart(result, digits.slice(0, 3))
  result = appendPhonePart(result, digits.slice(3, 6))
  result = appendPhonePart(result, digits.slice(6, 8), '-')
  result = appendPhonePart(result, digits.slice(8, 10), '-')
  return result
}

/** Маска ввода с автоопределением Узбекистана и России/Казахстана. */
export function formatClientPhoneInput(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  const digits = digitsOnly(raw)
  if (!digits) return ''

  if (digits.startsWith('998') && (raw.startsWith('+') || digits.length > 9)) {
    return formatUzbekPhone(digits.slice(3))
  }
  if (raw.startsWith('+7') && digits.startsWith('7')) return formatRussianPhone(digits.slice(1))
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return formatRussianPhone(digits.slice(1))
  }
  if (!raw.startsWith('+') && digits.length === 10) return formatRussianPhone(digits)
  if (raw.startsWith('+')) return `+${digits}`

  // CRM работает преимущественно с узбекскими номерами: локальные 9 цифр
  // автоматически получают +998.
  return formatUzbekPhone(digits)
}

/** Показывает основной код страны, как только пользователь начинает ввод. */
export function beginClientPhoneInput(value: string | null | undefined) {
  return (value ?? '').trim() ? formatClientPhoneInput(value) : '+998'
}

/** Не оставляет в поле один префикс страны после ухода из него. */
export function finishClientPhoneInput(value: string | null | undefined) {
  return normalizeClientPhone(value) ? formatClientPhoneInput(value) : ''
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

function similarity(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length)
  return maxLength === 0 ? 1 : 1 - levenshtein(left, right) / maxLength
}

function findNameReason(input: string, candidate: string): ClientDuplicateReason | null {
  if (!input || !candidate) return null
  if (input === candidate) return 'exact_name'

  const inputTokens = input.split(' ')
  const candidateTokens = candidate.split(' ')

  // Однословные карточки (например, «Бегзод») сравниваем между собой, но одно
  // имя/фамилию не считаем дублем полного ФИО из нескольких частей.
  if (inputTokens.length === 1 && candidateTokens.length === 1) {
    return input.length >= 5 && candidate.length >= 5 && similarity(input, candidate) >= 0.8
      ? 'similar_name'
      : null
  }
  if (inputTokens.length < 2 || candidateTokens.length < 2) return null

  const sharedTokens = inputTokens.filter(token => candidateTokens.includes(token)).length
  const shortestTokenCount = Math.min(inputTokens.length, candidateTokens.length)

  if (sharedTokens >= 2 && sharedTokens / shortestTokenCount >= 0.75) return 'similar_name'

  const sortedInput = [...inputTokens].sort().join(' ')
  const sortedCandidate = [...candidateTokens].sort().join(' ')
  if (sortedInput === sortedCandidate) return 'similar_name'

  if (input.length >= 6 && candidate.length >= 6 && (input.includes(candidate) || candidate.includes(input))) {
    return 'similar_name'
  }

  return input.length >= 7 && candidate.length >= 7 && similarity(input, candidate) >= 0.82
    ? 'similar_name'
    : null
}

function nameTokenMatches(queryToken: string, candidateToken: string) {
  if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return true
  return queryToken.length >= 4
    && candidateToken.length >= 4
    && similarity(queryToken, candidateToken) >= 0.78
}

/** Один и тот же поиск используется в выборе клиента и API списка клиентов. */
export function clientMatchesSearch(candidate: ClientDuplicateCandidate, query: string) {
  const rawQuery = query.trim()
  if (!rawQuery) return true

  const telegramQuery = rawQuery.replace(/^@/, '').toLocaleLowerCase('ru')
  if (rawQuery.startsWith('@')) {
    return (candidate.telegram_username ?? '')
      .replace(/^@/, '')
      .toLocaleLowerCase('ru')
      .includes(telegramQuery)
  }

  const letterQuery = rawQuery.replace(/[^\p{L}\p{M}’‘ʻʼ`´'\s-]+/gu, ' ')
  const normalizedNameQuery = normalizeClientName(letterQuery)
  const nameTokens = normalizedNameQuery.split(' ').filter(Boolean)
  const candidateNameTokens = normalizeClientName(candidate.full_name).split(' ').filter(Boolean)
  const hasNameQuery = nameTokens.length > 0
  const nameMatches = hasNameQuery && nameTokens.every(queryToken => (
    candidateNameTokens.some(candidateToken => nameTokenMatches(queryToken, candidateToken))
  ))
  const telegramMatches = hasNameQuery && (candidate.telegram_username ?? '')
    .replace(/^@/, '')
    .toLocaleLowerCase('ru')
    .includes(telegramQuery.toLocaleLowerCase('ru'))

  const rawPhoneDigits = digitsOnly(rawQuery)
  const normalizedPhoneQuery = normalizeClientPhone(rawQuery)
  const hasPhoneQuery = rawPhoneDigits.length >= 3 && normalizedPhoneQuery.length >= 3
  const candidatePhone = normalizeClientPhone(candidate.phone)
  const phoneMatches = hasPhoneQuery && candidatePhone.includes(normalizedPhoneQuery)

  if (hasNameQuery && hasPhoneQuery) return (nameMatches || telegramMatches) && phoneMatches
  if (hasNameQuery) return nameMatches || telegramMatches
  if (hasPhoneQuery) return phoneMatches
  return false
}

const reasonPriority: Record<ClientDuplicateReason, number> = {
  exact_phone: 4,
  similar_phone: 3,
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
      const candidatePhone = normalizeClientPhone(candidate.phone)
      const phoneReason: ClientDuplicateReason | null = normalizedPhone.length >= 9
        && normalizedPhone === candidatePhone
        ? 'exact_phone'
        : normalizedPhone.length >= 7 && candidatePhone.endsWith(normalizedPhone)
          ? 'similar_phone'
          : null
      const nameReason = normalizedName.length >= 3
        ? findNameReason(normalizedName, normalizeClientName(candidate.full_name))
        : null
      const reason = phoneReason ?? nameReason
      return reason ? [{ ...candidate, reason }] : []
    })
    .sort((left, right) => reasonPriority[right.reason] - reasonPriority[left.reason]
      || left.full_name.localeCompare(right.full_name, 'ru'))
}
