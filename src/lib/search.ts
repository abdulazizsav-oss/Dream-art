/** Compare visible names without making stored catalogue data depend on formatting. */
export function normalizeSearchText(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru')
}
