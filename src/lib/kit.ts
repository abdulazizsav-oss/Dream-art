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

/* ──────── Комплектация с ценами и количеством ──────── */

/** Каталог комплекта у техники (equipment.kit). price — за смену; 0 = входит в базу. */
export interface KitComponent {
  name: string
  /** Цена за смену. 0 — входит в базовую цену техники. */
  price: number
  /** Кол-во по умолчанию при оформлении заказа. */
  default_qty: number
  /** Максимальное кол-во, которое можно выдать. */
  max_qty: number
}

/** Выбранный компонент в заказе (order_items.kit_selection). Цена заморожена. */
export interface KitSelectionEntry {
  name: string
  qty: number
  /** Цена за смену на момент заказа. */
  unit_price: number
}

function toInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) ? n : fallback
}

function toMoney(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Привести произвольный jsonb к валидному каталогу комплекта. */
export function sanitizeKitCatalog(raw: unknown): KitComponent[] {
  if (!Array.isArray(raw)) return []
  const out: KitComponent[] = []
  for (const item of raw) {
    const name = String((item as KitComponent)?.name ?? '').trim()
    if (!name) continue
    const max_qty = Math.max(1, toInt((item as KitComponent)?.max_qty, 1))
    const default_qty = Math.min(max_qty, Math.max(0, toInt((item as KitComponent)?.default_qty, 1)))
    out.push({ name, price: toMoney((item as KitComponent)?.price), default_qty, max_qty })
  }
  return out
}

/** Привести произвольный jsonb к валидному выбору комплекта в заказе. */
export function sanitizeKitSelection(raw: unknown): KitSelectionEntry[] {
  if (!Array.isArray(raw)) return []
  const out: KitSelectionEntry[] = []
  for (const item of raw) {
    const name = String((item as KitSelectionEntry)?.name ?? '').trim()
    if (!name) continue
    const qty = Math.max(0, toInt((item as KitSelectionEntry)?.qty, 0))
    if (qty === 0) continue
    out.push({ name, qty, unit_price: toMoney((item as KitSelectionEntry)?.unit_price) })
  }
  return out
}

/** Сумма доплаты за смену по выбранному комплекту (Σ unit_price × qty). */
export function kitPerShift(selection: KitSelectionEntry[] | null | undefined): number {
  return (selection ?? []).reduce((sum, e) => sum + toMoney(e.unit_price) * Math.max(0, toInt(e.qty, 0)), 0)
}

/** Выбор по умолчанию из каталога (для нового заказа): берём default_qty по каждому компоненту. */
export function defaultKitSelection(catalog: KitComponent[] | null | undefined): KitSelectionEntry[] {
  return (catalog ?? [])
    .filter(c => c.default_qty > 0)
    .map(c => ({ name: c.name, qty: c.default_qty, unit_price: c.price }))
}

/**
 * Развернуть выбор комплекта в плоский список имён-единиц для строкового
 * учёта (selected_kit_items): qty>1 → нумерованные имена.
 */
export function kitSelectionToNames(selection: KitSelectionEntry[] | null | undefined): string[] {
  return (selection ?? []).flatMap(e => expandKitUnits(e.name, e.qty))
}

/** Привести выбор к каталогу: отсечь лишнее, ограничить qty по max, цена из каталога. */
export function reconcileKitSelection(
  selection: KitSelectionEntry[] | null | undefined,
  catalog: KitComponent[] | null | undefined,
): KitSelectionEntry[] {
  const byName = new Map((catalog ?? []).map(c => [c.name, c]))
  const out: KitSelectionEntry[] = []
  for (const entry of selection ?? []) {
    const comp = byName.get(entry.name)
    if (!comp) continue
    const qty = Math.min(comp.max_qty, Math.max(0, toInt(entry.qty, 0)))
    if (qty === 0) continue
    out.push({ name: comp.name, qty, unit_price: comp.price })
  }
  return out
}

/** Existing issued accessories may stay or grow, but never disappear/reprice. */
export function isAdditiveKitSelection(
  current: KitSelectionEntry[] | null | undefined,
  next: KitSelectionEntry[] | null | undefined,
): boolean {
  const nextByName = new Map((next ?? []).map(entry => [entry.name, entry]))
  return (current ?? []).every(entry => {
    const candidate = nextByName.get(entry.name)
    return Boolean(
      candidate
      && candidate.qty >= entry.qty
      && candidate.unit_price === entry.unit_price,
    )
  })
}
