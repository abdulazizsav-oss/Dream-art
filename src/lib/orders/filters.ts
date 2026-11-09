import type { QueueFilter } from './list'

export interface OrderFilters {
  queue: QueueFilter
  q: string
  delivery: 'all' | 'with' | 'without'
  sort: 'newest' | 'oldest' | 'debt'
  page: number
}

export function readOrderFilters(params: Pick<URLSearchParams, 'get'>): OrderFilters {
  const queue = params.get('queue') ?? 'active'
  const delivery = params.get('delivery') ?? 'all'
  const sort = params.get('sort') ?? 'newest'
  const page = Number(params.get('page') ?? 1)
  return {
    queue: ['active', 'overdue', 'debt', 'missing', 'returned', 'all'].includes(queue) ? queue as QueueFilter : 'active',
    q: params.get('q') ?? '',
    delivery: delivery === 'with' || delivery === 'without' ? delivery : 'all',
    sort: sort === 'oldest' || sort === 'debt' ? sort : 'newest',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  }
}
