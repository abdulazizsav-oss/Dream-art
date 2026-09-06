import { z } from 'zod'

export const returnMissingKitSchema = z.object({
  items: z.array(z.object({
    order_item_id: z.string().uuid(),
    returned_now: z.array(z.string().trim().min(1).max(500)).min(1).max(200),
  })).min(1).max(500),
})
