/**
 * The Subscription Tracker mark: a mint receipt with three bold line items and a coral renewal dot pinned
 * to its corner, on a navy tile. Inspired by the receipt symbol, drawn with thick shapes only so it reads
 * at 16 px, carries no text, and sits on light or dark backgrounds (the tile keeps its own navy ground).
 *
 * `tile` draws the rounded navy square (icon, splash); without it the mark floats on a navy surface
 * (app header). Keep this file and public/icon.svg in step.
 */
export function Logo({ size = 40, tile = true, tileFill = '#0B1F3A', className = '', title = 'Subscription Tracker' }: { size?: number; tile?: boolean; /** Lighter navy when the tile itself sits on navy. */ tileFill?: string; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      {tile && <rect width="128" height="128" rx="30" fill={tileFill} />}
      <LogoShapes />
    </svg>
  )
}

/** The receipt, its line items and the renewal dot, shared with the static icon. */
export function LogoShapes() {
  return (
    <>
      {/* Receipt: rounded top, three broad scallops along the bottom. */}
      <path d="M32 36 C32 27 39 22 46 22 H82 C89 22 96 27 96 36 V96 L84 106 L74 96 L64 106 L54 96 L44 106 L32 96 Z" fill="#2DD4BF" />
      {/* Line items */}
      <rect x="44" y="42" width="40" height="10" rx="5" fill="#0B1F3A" />
      <rect x="44" y="60" width="40" height="10" rx="5" fill="#0B1F3A" />
      <rect x="44" y="78" width="24" height="10" rx="5" fill="#0B1F3A" />
      {/* Renewal dot, ringed so it separates from the receipt at any size */}
      <circle cx="96" cy="34" r="20" fill="#0B1F3A" />
      <circle cx="96" cy="34" r="14" fill="#FF6B5B" />
    </>
  )
}
