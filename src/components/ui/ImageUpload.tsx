'use client'

import { useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Upload, X, Loader2, ImageIcon } from 'lucide-react'

interface ImageUploadProps {
  bucket: 'equipment-photos' | 'category-photos' | 'brand-logos' | 'client-photos'
  value?: string | null
  onChange: (url: string | null) => void
  className?: string
  aspectRatio?: 'square' | 'landscape' | 'portrait'
}

export function ImageUpload({
  bucket,
  value,
  onChange,
  className,
  aspectRatio = 'landscape',
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const supabase = createClient()

  const aspectClass = {
    square: 'aspect-square',
    landscape: 'aspect-video',
    portrait: 'aspect-[3/4]',
  }[aspectRatio]

  async function uploadFile(file: File) {
    if (!file.type.startsWith('image/')) {
      alert('Только изображения (JPG, PNG, WEBP)')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      alert('Максимальный размер файла — 15 МБ (до сжатия)')
      return
    }

    setUploading(true)
    try {
      // Сжатие: ужимаем до ~0.4 МБ / 1600px по длинной стороне, WebP по возможности
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.4,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        initialQuality: 0.82,
        fileType: 'image/webp',
      }).catch(() => file) // fallback на оригинал если сжатие упало

      const useWebp = compressed.type === 'image/webp'
      const ext = useWebp ? 'webp' : (file.name.split('.').pop() ?? 'jpg')
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error } = await supabase.storage.from(bucket).upload(path, compressed, {
        cacheControl: '3600',
        upsert: false,
        contentType: compressed.type,
      })
      if (error) throw error

      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (err) {
      console.error('Upload error:', err)
      alert('Ошибка загрузки фото')
    } finally {
      setUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleFileChange}
        disabled={uploading}
      />

      <div
        className={cn(
          'relative w-full rounded-xl border-2 border-dashed transition-colors cursor-pointer overflow-hidden bg-gray-50',
          aspectClass,
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300',
          uploading && 'pointer-events-none opacity-60',
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {value ? (
          <>
            <img
              src={value}
              alt="Uploaded"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Remove button */}
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-2 right-2 z-10 w-8 h-8 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            {/* Replace hint */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
              <span className="opacity-0 hover:opacity-100 text-white text-xs font-medium bg-black/60 px-3 py-1.5 rounded-full">
                Заменить
              </span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
            {uploading ? (
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="w-6 h-6 text-gray-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-600">
                    <Upload className="w-3.5 h-3.5 inline mr-1" />
                    Нажмите или перетащите
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WEBP · до 5 МБ</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
