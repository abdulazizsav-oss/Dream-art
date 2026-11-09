'use client'

import { useEffect, useRef, useState } from 'react'
import { postOperation, UNCERTAIN_OPERATION_MESSAGE } from '@/lib/operation-request'

// A tab-local marker survives a reload during a request. It contains no payment data.
export function useOrderOperation(orderId: string) {
  const key = `crm:unconfirmed-operation:${orderId}`
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState('')

  function isMarked() {
    try { return sessionStorage.getItem(key) === '1' } catch { return false }
  }

  function mark(value: boolean) {
    try {
      if (value) sessionStorage.setItem(key, '1')
      else sessionStorage.removeItem(key)
    } catch { /* The in-memory guard still works when storage is unavailable. */ }
  }

  useEffect(() => {
    try {
      const marked = sessionStorage.getItem(key) === '1'
      setUncertain(marked)
      setMessage(marked ? UNCERTAIN_OPERATION_MESSAGE : '')
    } catch { /* Storage may be disabled. */ }
  }, [key])

  async function submit(url: string, body: unknown) {
    if (inFlight.current) return false
    if (uncertain || isMarked()) {
      setUncertain(true)
      setMessage(UNCERTAIN_OPERATION_MESSAGE)
      return false
    }
    inFlight.current = true
    setPending(true)
    setMessage('')
    mark(true)
    try {
      const result = await postOperation(url, body)
      const unknown = result.status === 'uncertain'
      mark(unknown)
      setUncertain(unknown)
      setMessage(result.status === 'confirmed' ? '' : result.message)
      return result.status === 'confirmed'
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  function acknowledgeNotSaved() {
    if (inFlight.current) return
    mark(false)
    setUncertain(false)
    setMessage('')
  }

  return { pending, uncertain, message, submit, acknowledgeNotSaved }
}
