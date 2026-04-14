import { Telegraf } from 'telegraf'

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled')
}

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN ?? 'placeholder')

bot.command('start', async ctx => {
  const username = ctx.from?.username
  const chatId = ctx.chat?.id

  await ctx.reply(
    `Добро пожаловать в Dream Art!\n\nЧтобы получать уведомления о ваших арендах, сообщите менеджеру свой Telegram: @${username ?? 'ваш_username'}\n\nВаш Chat ID: ${chatId}`
  )
})

bot.command('myrentals', async ctx => {
  await ctx.reply('Список активных аренд доступен у менеджера. Свяжитесь с нами для уточнения.')
})
