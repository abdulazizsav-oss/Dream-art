import { NextRequest, NextResponse } from 'next/server'
import { bot } from '@/lib/bot/index'

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Telegram webhook secret is not configured' }, { status: 500 })
  }

  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== webhookSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  await bot.handleUpdate(body)
  return NextResponse.json({ ok: true })
}
