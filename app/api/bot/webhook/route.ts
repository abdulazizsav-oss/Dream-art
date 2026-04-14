import { NextRequest, NextResponse } from 'next/server'
import { bot } from '@/lib/bot/index'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  await bot.handleUpdate(body)
  return NextResponse.json({ ok: true })
}
