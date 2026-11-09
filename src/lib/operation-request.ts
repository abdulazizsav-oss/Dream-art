export type OperationResult =
  | { status: 'confirmed' }
  | { status: 'rejected'; message: string }
  | { status: 'uncertain'; message: string }

export const UNCERTAIN_OPERATION_MESSAGE = 'Сервер не подтвердил результат. Операция могла сохраниться. Проверьте позиции и журнал платежей в карточке заказа перед повторной отправкой.'

/** Never retry a financial mutation automatically: a lost response is not a failed write. */
export async function postOperation(url: string, body: unknown, request: typeof fetch = fetch): Promise<OperationResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (response.ok) return { status: 'confirmed' }
    if (response.status >= 500 || response.status === 408) {
      return { status: 'uncertain', message: UNCERTAIN_OPERATION_MESSAGE }
    }
    const payload = await response.json().catch(() => null)
    return {
      status: 'rejected',
      message: typeof payload?.error === 'string' ? payload.error : 'Не удалось сохранить. Проверьте данные и повторите попытку.',
    }
  } catch {
    return { status: 'uncertain', message: UNCERTAIN_OPERATION_MESSAGE }
  } finally {
    clearTimeout(timeout)
  }
}
