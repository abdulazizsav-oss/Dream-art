import { cn } from '@/lib/utils'

interface BrandLogoProps {
  variant?: 'full' | 'compact'
  className?: string
}

/** Vector lettering based on the studio sign; compact mark for narrow headers. */
export function BrandLogo({ variant = 'full', className }: BrandLogoProps) {
  const compact = variant === 'compact'

  return (
    // Plain SVG images need no raster optimization or client-side JavaScript.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={compact ? '/brand/dream-art-mark.svg' : '/brand/dream-art-logo.svg'}
      alt={compact ? 'Dream Art' : 'Dream Art Photography'}
      width={compact ? 64 : 336}
      height={compact ? 64 : 72}
      className={cn('block h-auto shrink-0', compact ? 'w-11' : 'w-48 max-w-full', className)}
      draggable={false}
    />
  )
}
