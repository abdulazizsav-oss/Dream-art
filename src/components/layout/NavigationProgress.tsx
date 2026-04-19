'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * Тонкая синяя полоска прогресса вверху страницы при навигации между разделами.
 * Работает через перехват кликов по ссылкам + отслеживание смены pathname.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPath = useRef(pathname)

  // Запускаем прогресс при клике по любой ссылке
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      // Только внутренние навигационные ссылки (не скачивание, не внешние)
      if (!href || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('#')) return
      startProgress()
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  // Завершаем прогресс когда pathname сменился
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname
      completeProgress()
    }
  }, [pathname])

  function startProgress() {
    if (tickRef.current) clearInterval(tickRef.current)
    setVisible(true)
    setWidth(15)

    // Постепенно ползём до ~85% пока ждём
    let current = 15
    tickRef.current = setInterval(() => {
      current = current < 40 ? current + 8
        : current < 65 ? current + 4
        : current < 80 ? current + 1.5
        : current
      setWidth(current)
      if (current >= 80) {
        clearInterval(tickRef.current!)
        tickRef.current = null
      }
    }, 180)
  }

  function completeProgress() {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    setWidth(100)
    setTimeout(() => {
      setVisible(false)
      setWidth(0)
    }, 380)
  }

  if (!visible && width === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[999] h-[3px] pointer-events-none">
      <div
        className={cn(
          'h-full bg-gradient-to-r from-blue-500 to-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.7)]',
          'transition-[width] ease-out',
          width === 100 ? 'duration-200' : 'duration-300',
          !visible && 'opacity-0 transition-opacity duration-300',
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
