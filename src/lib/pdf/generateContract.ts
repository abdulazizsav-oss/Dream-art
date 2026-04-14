import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

interface ContractData {
  orderNumber: string
  clientName: string
  clientPhone: string | null
  clientPassport: string | null
  startDate: string
  endDate: string
  items: { name: string; serialNumber: string | null; dailyRate: number; days: number; subtotal: number }[]
  totalAmount: number
  depositAmount: number
  notes: string | null
  createdAt: string
}

export async function generateContract(data: ContractData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const { width, height } = page.getSize()
  let y = height - 50

  function line(text: string, x = 50, size = 10, bold = false) {
    page.drawText(text, { x, y, size, font: bold ? boldFont : font, color: rgb(0.1, 0.1, 0.1) })
    y -= size + 4
  }

  function gap(n = 1) { y -= n * 10 }

  // Header
  line('ДОГОВОР АРЕНДЫ ФОТО/ВИДЕО ТЕХНИКИ', 120, 14, true)
  gap()
  line(`Dream Art — Аренда оборудования`, 180, 10)
  gap(2)

  // Contract number and date
  line(`№ ${data.orderNumber}    от ${data.createdAt}`, 50, 10, true)
  gap()

  // Parties
  line('СТОРОНЫ:', 50, 11, true)
  gap(0.5)
  line('Арендодатель: Dream Art (далее — Компания)')
  line(`Арендатор: ${data.clientName}`)
  if (data.clientPhone) line(`Телефон: ${data.clientPhone}`)
  if (data.clientPassport) line(`Документ: ${data.clientPassport}`)
  gap()

  // Rental period
  line('СРОК АРЕНДЫ:', 50, 11, true)
  gap(0.5)
  line(`С ${data.startDate} по ${data.endDate}`)
  gap()

  // Equipment list
  line('АРЕНДУЕМОЕ ОБОРУДОВАНИЕ:', 50, 11, true)
  gap(0.5)

  data.items.forEach((item, i) => {
    line(`${i + 1}. ${item.name}${item.serialNumber ? ` (S/N: ${item.serialNumber})` : ''}`)
    line(`   ${item.dailyRate.toLocaleString('ru')} сум/день × ${item.days} дн. = ${item.subtotal.toLocaleString('ru')} сум`, 50, 9)
    gap(0.3)
  })
  gap(0.5)

  // Totals
  line('─'.repeat(70), 50, 10)
  gap(0.3)
  line(`Итого за аренду: ${data.totalAmount.toLocaleString('ru')} сум`, 50, 11, true)
  if (data.depositAmount > 0) {
    line(`Депозит: ${data.depositAmount.toLocaleString('ru')} сум`)
  }
  gap()

  // Terms
  line('УСЛОВИЯ:', 50, 11, true)
  gap(0.5)
  const terms = [
    '1. Арендатор принял оборудование в исправном состоянии.',
    '2. Арендатор обязуется вернуть оборудование в указанный срок.',
    '3. В случае повреждения оборудования Арендатор возмещает ущерб.',
    '4. При просрочке возврата начисляется штраф 1.5× дневная ставка за каждый день.',
    '5. Депозит возвращается при возврате оборудования в надлежащем состоянии.',
  ]
  terms.forEach(t => { line(t, 50, 9); gap(0.2) })

  if (data.notes) {
    gap()
    line('ПРИМЕЧАНИЯ:', 50, 10, true)
    gap(0.3)
    line(data.notes, 50, 9)
  }

  gap(3)

  // Signatures
  line('ПОДПИСИ:', 50, 11, true)
  gap(1)
  line('Арендодатель: _______________________', 50, 10)
  gap(2)
  line('Арендатор: _______________________', 50, 10)
  gap(2)
  line('Дата: _______________________', 50, 10)

  const pdfBytes = await pdfDoc.save()
  return pdfBytes
}
