export interface CloseChecklistSource {
  id: string
}

export interface CloseChecklistRow<T extends CloseChecklistSource> {
  item: T
  confirmed: boolean
}

/**
 * Every open order item must stay visible in the full-close checklist.
 * Kit/accessory presence must never decide whether equipment is returned.
 */
export function buildCloseChecklist<T extends CloseChecklistSource>(
  items: readonly T[],
  confirmedItemIds: ReadonlySet<string>,
): CloseChecklistRow<T>[] {
  return items.map(item => ({
    item,
    confirmed: confirmedItemIds.has(item.id),
  }))
}

export function canCloseEveryItem<T extends CloseChecklistSource>(
  checklist: readonly CloseChecklistRow<T>[],
): boolean {
  return checklist.length > 0 && checklist.every(row => row.confirmed)
}

