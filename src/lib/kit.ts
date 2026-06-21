/**
 * Помощники для комплектации с количеством.
 *
 * Подход «пронумерованные единицы»: элемент с количеством N>1 хранится как
 * отдельные строки «Имя 1 … Имя N». Имена различны → работают существующий
 * учёт комплекта (selected/returned/missing_kit_items) и уникальный индекс
 * истории недосдачи без изменений БД и RPC.
 */

/**
 * Развернуть элемент комплекта с количеством в пронумерованные единицы.
 * qty<=1 → [name]; qty>=2 → ["name 1", …, "name N"].
 */
export function expandKitUnits(name: string, qty: number = 1): string[] {
  const base = (name ?? '').trim()
  if (!base) return []
  const n = Math.max(1, Math.floor(Number(qty) || 1))
  if (n === 1) return [base]
  return Array.from({ length: n }, (_, i) => `${base} ${i + 1}`)
}

export interface KitGroup {
  /** Базовое имя без хвостового номера ("Батарея 2" → "Батарея"). */
  base: string
  /** Сколько единиц с этим базовым именем. */
  count: number
  /** Исходные имена единиц в порядке появления. */
  units: string[]
}

/**
 * Сгруппировать пронумерованные единицы для компактного показа, сохраняя
 * порядок первого появления базового имени.
 * Базовым считается имя без хвоста " <число>" (только если есть пробел перед
 * числом — поэтому "V90" остаётся "V90").
 */
export function groupKitUnits(names: string[]): KitGroup[] {
  const order: string[] = []
  const map = new Map<string, KitGroup>()
  for (const raw of names ?? []) {
    const name = (raw ?? '').trim()
    if (!name) continue
    const match = name.match(/^(.*\S)\s+(\d+)$/)
    const base = match ? match[1] : name
    let group = map.get(base)
    if (!group) {
      group = { base, count: 0, units: [] }
      map.set(base, group)
      order.push(base)
    }
    group.count += 1
    group.units.push(name)
  }
  return order.map(base => map.get(base)!)
}

/**
 * Компактная подпись группы: "Батарея ×2" для нескольких единиц.
 * Для одиночной — исходное имя как есть (чтобы не терять легаси-метки вроде
 * "BAT 2", где число было частью названия, а не количеством).
 */
export function formatKitGroup(group: KitGroup): string {
  return group.count > 1 ? `${group.base} ×${group.count}` : group.units[0]
}
