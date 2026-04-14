// Cloudflare Worker — Daily Cron Trigger
// Calls the Next.js API route /api/cron every day at 08:00 Tashkent time

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const url = `${env.APP_URL}/api/cron`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
      },
    })

    const data = await res.json()
    console.log('[CRON] Result:', JSON.stringify(data))

    if (!res.ok) {
      throw new Error(`Cron failed: ${res.status}`)
    }
  },
}

interface Env {
  APP_URL: string
  CRON_SECRET: string
}
