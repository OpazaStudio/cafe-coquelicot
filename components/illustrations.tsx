// Line-art SVG illustrations à la flyer Rivage.
// Stroke uses currentColor so they inherit the section's --fg.

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const displayFont = { fontFamily: "var(--font-display)" } as const;
const scriptFont = { fontFamily: "var(--font-script)" } as const;
const bodyFont = { fontFamily: "var(--font-body)" } as const;

type IllustrationProps = { className?: string };

// ─── Big hero illustration: facade with poppies overflowing ──────
export function HeroStorefront({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 600 720" className={className} aria-hidden="true">
      <g {...stroke}>
        {/* Sun/halo behind */}
        <circle cx="300" cy="180" r="160" opacity="0.25" />

        {/* Storefront building */}
        <path d="M 110 700 L 110 320 L 130 280 L 470 280 L 490 320 L 490 700" />
        {/* Awning */}
        <path d="M 90 320 L 510 320 L 500 380 L 100 380 Z" />
        <path d="M 130 320 L 122 380" />
        <path d="M 170 320 L 162 380" />
        <path d="M 210 320 L 202 380" />
        <path d="M 250 320 L 244 380" />
        <path d="M 300 320 L 300 380" />
        <path d="M 350 320 L 356 380" />
        <path d="M 390 320 L 398 380" />
        <path d="M 430 320 L 438 380" />
        <path d="M 470 320 L 478 380" />
        {/* Awning scallop */}
        <path d="M 100 380 Q 110 396 120 380 Q 132 396 144 380 Q 156 396 168 380 Q 180 396 192 380 Q 204 396 216 380 Q 228 396 240 380 Q 252 396 264 380 Q 276 396 288 380 Q 300 396 312 380 Q 324 396 336 380 Q 348 396 360 380 Q 372 396 384 380 Q 396 396 408 380 Q 420 396 432 380 Q 444 396 456 380 Q 468 396 480 380 Q 492 396 500 380" />

        {/* Signage on awning */}
        <text x="300" y="358" style={displayFont} fontSize="38" fontWeight="400"
              textAnchor="middle" fill="currentColor" stroke="none" letterSpacing="-1">
          coquelicot
        </text>

        {/* Storefront windows */}
        <rect x="140" y="420" width="120" height="180" rx="2" />
        <rect x="340" y="420" width="120" height="180" rx="2" />
        <path d="M 200 420 L 200 600" />
        <path d="M 400 420 L 400 600" />
        <path d="M 140 510 L 260 510" />
        <path d="M 340 510 L 460 510" />

        {/* Bouquets in windows */}
        <path d="M 170 590 Q 168 540 170 500" />
        <path d="M 180 590 Q 184 540 184 500" />
        <path d="M 190 590 Q 188 530 196 504" />
        <circle cx="172" cy="498" r="8" />
        <circle cx="186" cy="494" r="6" />
        <circle cx="196" cy="500" r="7" />

        <path d="M 220 590 Q 218 545 220 504" />
        <path d="M 232 590 Q 236 540 240 500" />
        <circle cx="222" cy="500" r="7" />
        <circle cx="238" cy="496" r="8" />

        <path d="M 370 590 Q 368 540 374 502" />
        <path d="M 384 590 Q 388 542 388 500" />
        <path d="M 398 590 Q 396 538 404 506" />
        <circle cx="374" cy="500" r="7" />
        <circle cx="388" cy="494" r="9" />
        <circle cx="404" cy="500" r="6" />

        <path d="M 430 590 Q 428 540 432 502" />
        <path d="M 442 590 Q 446 540 448 500" />
        <circle cx="432" cy="500" r="7" />
        <circle cx="448" cy="496" r="8" />

        {/* Door */}
        <rect x="280" y="420" width="40" height="280" rx="2" />
        <circle cx="312" cy="560" r="2.5" fill="currentColor" />
        <path d="M 300 420 L 300 700" opacity="0.5" />

        {/* Sandwich board */}
        <path d="M 60 700 L 80 600 L 96 600 L 96 700" />
        <text x="78" y="640" style={scriptFont} fontSize="14" fill="currentColor" stroke="none"
              textAnchor="middle">
          ouvert
        </text>
        <text x="78" y="660" style={scriptFont} fontSize="11" fill="currentColor" stroke="none"
              textAnchor="middle">
          fleurs
        </text>
        <text x="78" y="676" style={scriptFont} fontSize="11" fill="currentColor" stroke="none"
              textAnchor="middle">
          bouquets
        </text>

        {/* Plants outside */}
        <path d="M 520 700 Q 520 660 530 640 Q 540 660 540 700" />
        <path d="M 528 700 L 528 660" />
        <path d="M 525 680 Q 520 678 518 670" />
        <path d="M 532 680 Q 538 678 540 670" />
        <rect x="514" y="700" width="32" height="14" />

        {/* Big poppies overflowing on left */}
        <g transform="translate(-20 580)">
          <path d="M 70 60 Q 50 30 60 12 Q 80 4 88 20 Q 96 4 116 12 Q 126 30 106 60 Z" />
          <circle cx="88" cy="32" r="6" />
          <path d="M 88 60 L 88 90" />
        </g>
        <g transform="translate(40 540)">
          <path d="M 50 50 Q 36 30 44 14 Q 60 8 66 22 Q 74 8 88 14 Q 96 30 80 50 Z" />
          <circle cx="66" cy="30" r="5" />
          <path d="M 66 50 L 66 90" />
        </g>

        {/* Birds */}
        <path d="M 200 140 Q 210 130 220 140 Q 230 130 240 140" />
        <path d="M 260 170 Q 270 160 280 170 Q 290 160 300 170" />
        <path d="M 420 130 Q 430 122 438 130 Q 446 122 454 130" />

        {/* Hanging banner */}
        <path d="M 180 260 L 420 260" strokeDasharray="2 4" />
        <path d="M 220 260 L 224 280 L 232 260 Z" />
        <path d="M 250 260 L 254 280 L 262 260 Z" />
        <path d="M 280 260 L 284 280 L 292 260 Z" />
        <path d="M 310 260 L 314 280 L 322 260 Z" />
        <path d="M 340 260 L 344 280 L 352 260 Z" />
        <path d="M 370 260 L 374 280 L 382 260 Z" />

        {/* Ground line */}
        <path d="M 0 712 L 600 712" />
      </g>

      {/* Hand-written "depuis 2019" stamp */}
      <text x="500" y="170" style={scriptFont} fontSize="32" fill="currentColor"
            transform="rotate(-8 500 170)">
        depuis 2019
      </text>
    </svg>
  );
}

// ─── Bouquet (for product cards and gallery tiles) ──────────────
export function Bouquet({ variant = 0, className }: IllustrationProps & { variant?: number }) {
  const variants = [
    // Variant 0 — round bouquet
    <g key="0" {...stroke}>
      <path d="M 100 180 Q 96 130 100 90" />
      <circle cx="80" cy="60" r="14" />
      <circle cx="106" cy="48" r="16" />
      <circle cx="128" cy="62" r="13" />
      <circle cx="92" cy="78" r="11" />
      <circle cx="120" cy="80" r="12" />
      <path d="M 80 60 Q 74 52 72 58" />
      <path d="M 106 48 Q 104 38 100 42" />
      <path d="M 128 62 Q 134 52 138 56" />
      <path d="M 78 92 Q 70 86 64 96" />
      <path d="M 124 92 Q 132 88 138 96" />
      <path d="M 85 180 L 115 180 L 110 200 L 90 200 Z" />
      <path d="M 85 188 L 115 188" />
    </g>,
    // Variant 1 — tall stems
    <g key="1" {...stroke}>
      <path d="M 80 180 Q 82 130 88 60" />
      <path d="M 100 180 Q 100 130 104 50" />
      <path d="M 120 180 Q 118 130 116 64" />
      <circle cx="88" cy="56" r="10" />
      <circle cx="104" cy="46" r="12" />
      <circle cx="116" cy="60" r="9" />
      <path d="M 84 100 Q 76 96 72 102" />
      <path d="M 108 110 Q 116 106 122 114" />
      <path d="M 96 140 Q 88 138 84 144" />
      <path d="M 85 180 L 115 180 L 110 200 L 90 200 Z" />
      <path d="M 80 180 Q 100 175 120 180" />
    </g>,
    // Variant 2 — dried wheat bunch
    <g key="2" {...stroke}>
      <path d="M 70 200 L 130 200 L 124 220 L 76 220 Z" />
      <path d="M 78 200 Q 72 140 70 80" />
      <path d="M 90 200 Q 88 140 92 60" />
      <path d="M 100 200 Q 98 130 100 50" />
      <path d="M 112 200 Q 114 140 116 60" />
      <path d="M 124 200 Q 130 140 132 80" />
      {/* Wheat heads */}
      <g transform="translate(70 80)"><path d="M 0 0 L 0 -28" /><path d="M -4 -2 L -8 -8 M 4 -2 L 8 -8 M -4 -10 L -8 -16 M 4 -10 L 8 -16 M -3 -18 L -7 -24 M 3 -18 L 7 -24" /></g>
      <g transform="translate(92 60)"><path d="M 0 0 L 0 -28" /><path d="M -4 -2 L -8 -8 M 4 -2 L 8 -8 M -4 -10 L -8 -16 M 4 -10 L 8 -16 M -3 -18 L -7 -24 M 3 -18 L 7 -24" /></g>
      <g transform="translate(100 50)"><path d="M 0 0 L 0 -28" /><path d="M -4 -2 L -8 -8 M 4 -2 L 8 -8 M -4 -10 L -8 -16 M 4 -10 L 8 -16 M -3 -18 L -7 -24 M 3 -18 L 7 -24" /></g>
      <g transform="translate(116 60)"><path d="M 0 0 L 0 -28" /><path d="M -4 -2 L -8 -8 M 4 -2 L 8 -8 M -4 -10 L -8 -16 M 4 -10 L 8 -16 M -3 -18 L -7 -24 M 3 -18 L 7 -24" /></g>
      <g transform="translate(132 80)"><path d="M 0 0 L 0 -28" /><path d="M -4 -2 L -8 -8 M 4 -2 L 8 -8 M -4 -10 L -8 -16 M 4 -10 L 8 -16 M -3 -18 L -7 -24 M 3 -18 L 7 -24" /></g>
    </g>,
    // Variant 3 — single big bloom
    <g key="3" {...stroke}>
      <path d="M 100 200 L 100 130" />
      <path d="M 100 170 Q 88 168 80 158 Q 92 158 100 170" />
      <path d="M 100 150 Q 112 148 120 138 Q 108 138 100 150" />
      <path d="M 100 130 Q 56 124 50 80 Q 56 40 90 38 Q 104 42 100 64 Q 108 42 130 42 Q 156 50 152 84 Q 148 124 100 130 Z" />
      <path d="M 70 76 Q 80 60 96 70" />
      <path d="M 130 76 Q 120 60 104 70" />
      <ellipse cx="100" cy="80" rx="14" ry="10" />
      <circle cx="92" cy="78" r="0.8" fill="currentColor" />
      <circle cx="100" cy="74" r="0.8" fill="currentColor" />
      <circle cx="108" cy="78" r="0.8" fill="currentColor" />
      <circle cx="96" cy="84" r="0.8" fill="currentColor" />
      <circle cx="104" cy="84" r="0.8" fill="currentColor" />
    </g>,
    // Variant 4 — pampas / dried tall
    <g key="4" {...stroke}>
      <path d="M 80 200 Q 78 150 70 50 Q 60 56 56 70 Q 50 60 56 50 Q 64 38 78 36 Q 88 24 92 32 Q 92 22 100 30 Q 108 18 110 30 Q 118 22 116 36 Q 130 38 134 50 Q 142 60 138 70 Q 134 56 124 60 Q 124 40 116 36 Q 112 60 100 60 Q 88 60 80 36" />
      <path d="M 100 200 Q 102 140 100 40" />
      <path d="M 120 200 Q 124 160 134 70" />
      <path d="M 80 200 L 120 200 L 115 218 L 85 218 Z" />
    </g>,
    // Variant 5 — eucalyptus branch
    <g key="5" {...stroke}>
      <path d="M 100 200 Q 96 130 100 60" />
      <ellipse cx="80" cy="80" rx="10" ry="6" transform="rotate(-30 80 80)" />
      <ellipse cx="120" cy="90" rx="10" ry="6" transform="rotate(30 120 90)" />
      <ellipse cx="78" cy="110" rx="11" ry="7" transform="rotate(-30 78 110)" />
      <ellipse cx="122" cy="120" rx="11" ry="7" transform="rotate(30 122 120)" />
      <ellipse cx="80" cy="140" rx="10" ry="6" transform="rotate(-30 80 140)" />
      <ellipse cx="120" cy="150" rx="10" ry="6" transform="rotate(30 120 150)" />
      <ellipse cx="84" cy="168" rx="9" ry="5" transform="rotate(-30 84 168)" />
      <ellipse cx="116" cy="178" rx="9" ry="5" transform="rotate(30 116 178)" />
      <ellipse cx="100" cy="60" rx="8" ry="5" />
    </g>,
  ];
  return (
    <svg viewBox="0 0 200 240" className={className} aria-hidden="true">
      {variants[variant % variants.length]}
    </svg>
  );
}

// ─── Simple icons used in prestation cards ─────────────────────
export function IconWedding({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <g {...stroke}>
        <circle cx="32" cy="32" r="14" />
        <circle cx="48" cy="32" r="14" />
        <path d="M 22 32 L 22 18 M 18 22 L 26 22" />
        <path d="M 58 32 L 58 18 M 54 22 L 62 22" />
        <path d="M 40 46 Q 36 56 40 70" />
        <path d="M 30 62 Q 36 60 40 66" />
        <path d="M 50 62 Q 44 60 40 66" />
        <circle cx="34" cy="56" r="3" />
        <circle cx="46" cy="56" r="3" />
        <circle cx="40" cy="66" r="3.5" />
      </g>
    </svg>
  );
}

export function IconEvent({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <g {...stroke}>
        <path d="M 14 20 L 66 20 L 64 30 L 16 30 Z" />
        <path d="M 24 20 L 22 30" />
        <path d="M 34 20 L 34 30" />
        <path d="M 44 20 L 46 30" />
        <path d="M 56 20 L 58 30" />
        <path d="M 20 30 L 22 70" />
        <path d="M 60 30 L 58 70" />
        <path d="M 20 70 L 60 70" />
        {/* Bouquet on table */}
        <path d="M 40 56 L 40 42" />
        <circle cx="34" cy="38" r="6" />
        <circle cx="44" cy="36" r="6" />
        <circle cx="40" cy="46" r="5" />
        <path d="M 36 56 L 44 56 L 42 62 L 38 62 Z" />
        {/* String lights */}
        <path d="M 14 12 Q 40 8 66 12" strokeDasharray="2 3" />
        <circle cx="22" cy="11" r="1.5" fill="currentColor" />
        <circle cx="40" cy="8" r="1.5" fill="currentColor" />
        <circle cx="58" cy="11" r="1.5" fill="currentColor" />
      </g>
    </svg>
  );
}

export function IconSubscription({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <g {...stroke}>
        {/* Vase */}
        <path d="M 26 30 L 22 70 L 58 70 L 54 30 Z" />
        <path d="M 22 30 L 58 30" />
        <path d="M 26 38 L 54 38" />
        {/* Flowers */}
        <path d="M 40 30 L 40 14" />
        <path d="M 32 30 Q 30 22 26 14" />
        <path d="M 48 30 Q 50 22 54 14" />
        <circle cx="40" cy="12" r="6" />
        <circle cx="26" cy="14" r="5" />
        <circle cx="54" cy="14" r="5" />
        <path d="M 40 6 Q 44 4 46 8" />
        <path d="M 22 10 Q 18 12 18 16" />
        {/* Calendar marks */}
        <text x="40" y="62" style={scriptFont} fontSize="11" fill="currentColor" stroke="none"
              textAnchor="middle">x4</text>
      </g>
    </svg>
  );
}

export function IconWorkshop({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <g {...stroke}>
        {/* Two hands holding stems */}
        <path d="M 14 60 Q 14 50 20 44 L 28 38 L 32 32 L 36 38 L 40 32 L 44 38 L 48 32 L 52 38 L 60 44 Q 66 50 66 60 Q 66 68 60 72 L 20 72 Q 14 68 14 60 Z" />
        <path d="M 32 38 Q 30 28 32 18" />
        <path d="M 40 32 Q 38 22 40 12" />
        <path d="M 48 38 Q 50 28 48 18" />
        <circle cx="32" cy="16" r="5" />
        <circle cx="40" cy="10" r="6" />
        <circle cx="48" cy="16" r="5" />
        <path d="M 22 60 L 26 60" />
        <path d="M 54 60 L 58 60" />
      </g>
    </svg>
  );
}

export function IconCorporate({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <g {...stroke}>
        <path d="M 16 70 L 16 30 L 40 18 L 64 30 L 64 70 Z" />
        <rect x="22" y="38" width="8" height="10" />
        <rect x="36" y="38" width="8" height="10" />
        <rect x="50" y="38" width="8" height="10" />
        <rect x="22" y="54" width="8" height="10" />
        <rect x="50" y="54" width="8" height="10" />
        {/* Plant in middle window */}
        <path d="M 40 64 L 40 54" />
        <circle cx="38" cy="52" r="3" />
        <circle cx="42" cy="50" r="3" />
        <path d="M 36 60 L 44 60 L 42 64 L 38 64 Z" />
      </g>
    </svg>
  );
}

export function IconDelivery({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <g {...stroke}>
        {/* Bicycle */}
        <circle cx="20" cy="58" r="10" />
        <circle cx="58" cy="58" r="10" />
        <path d="M 20 58 L 36 38 L 52 38" />
        <path d="M 36 38 L 58 58" />
        <path d="M 30 58 L 40 38" />
        <path d="M 52 38 L 56 32" />
        <path d="M 50 32 L 60 32" />
        {/* Basket with flowers */}
        <path d="M 12 38 L 30 38 L 28 28 L 14 28 Z" />
        <path d="M 18 28 Q 16 22 14 18" />
        <path d="M 22 28 L 22 16" />
        <path d="M 26 28 Q 28 22 30 18" />
        <circle cx="14" cy="16" r="3" />
        <circle cx="22" cy="14" r="4" />
        <circle cx="30" cy="16" r="3" />
      </g>
    </svg>
  );
}

// ─── Map illustration ──────────────────────────────────────────
export function MapDoodle({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 400 300" className={className} preserveAspectRatio="none" aria-hidden="true">
      <g {...stroke} opacity="0.8">
        {/* Streets */}
        <path d="M 0 80 L 400 100" />
        <path d="M 0 180 L 400 200" />
        <path d="M 80 0 L 100 300" />
        <path d="M 200 0 L 220 300" />
        <path d="M 320 0 L 340 300" />
        <path d="M 60 240 Q 200 230 360 250" />

        {/* Blocks */}
        <path d="M 120 110 L 196 112 L 196 174 L 122 172 Z" opacity="0.35" />
        <path d="M 232 110 L 318 114 L 320 178 L 234 174 Z" opacity="0.35" />
        <path d="M 124 210 L 196 212 L 198 240 L 126 238 Z" opacity="0.35" />

        {/* Park */}
        <circle cx="60" cy="130" r="22" opacity="0.4" />
        <path d="M 50 130 Q 60 124 70 130 M 54 122 L 58 118 M 66 122 L 62 118" opacity="0.6" />
      </g>

      {/* Pin */}
      <g>
        <path d="M 220 130 Q 210 156 220 174 Q 230 156 220 130 Z"
              fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="220" cy="142" r="5" fill="white" />
      </g>

      {/* Hand-written label */}
      <text x="240" y="142" style={scriptFont} fontSize="22" fill="currentColor">
        nous
      </text>
      <path d="M 234 134 Q 230 124 224 124" {...stroke} />

      {/* Compass */}
      <g transform="translate(360 36)">
        <circle r="12" {...stroke} />
        <path d="M 0 -10 L 3 0 L 0 10 L -3 0 Z" fill="currentColor" />
        <text y="-16" textAnchor="middle" style={bodyFont} fontSize="8"
              fill="currentColor" stroke="none">N</text>
      </g>
    </svg>
  );
}

// ─── Arrows ────────────────────────────────────────────────────
export function ArrowRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M 2 8 L 14 8 M 9 3 L 14 8 L 9 13" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowDiag({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <path d="M 6 22 L 22 6 M 10 6 L 22 6 L 22 18" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── About illustration: woman with bouquet ───────────────────
export function AboutFlorist({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 360 460" className={className} aria-hidden="true">
      <g {...stroke}>
        {/* Background frame */}
        <rect x="20" y="20" width="320" height="420" />

        {/* Head */}
        <ellipse cx="180" cy="120" rx="42" ry="50" />
        {/* Hair bun */}
        <path d="M 138 100 Q 132 78 152 64 Q 168 56 188 60 Q 218 64 224 86 Q 230 102 222 124" />
        <circle cx="170" cy="56" r="12" />
        {/* Face features */}
        <path d="M 162 118 Q 164 116 166 118" />
        <path d="M 194 118 Q 196 116 198 118" />
        <path d="M 174 138 Q 180 142 186 138" />
        <path d="M 178 128 L 180 132 L 178 134" />
        {/* Earrings */}
        <circle cx="138" cy="124" r="2" fill="currentColor" />
        <circle cx="222" cy="124" r="2" fill="currentColor" />

        {/* Neck + shoulders */}
        <path d="M 168 168 L 168 184 Q 130 196 110 240 Q 100 280 102 320 L 102 420" />
        <path d="M 192 168 L 192 184 Q 230 196 250 240 Q 260 280 258 320 L 258 420" />

        {/* Apron strap */}
        <path d="M 130 196 L 150 230 L 150 420" />
        <path d="M 230 196 L 210 230 L 210 420" />
        <path d="M 150 230 L 210 230" />
        <path d="M 150 280 L 210 280" />

        {/* Arms holding bouquet */}
        <path d="M 110 240 Q 90 280 130 320" />
        <path d="M 250 240 Q 270 280 230 320" />
        <path d="M 130 320 L 230 320" />

        {/* Bouquet */}
        <path d="M 158 320 L 160 280" />
        <path d="M 172 320 L 170 264" />
        <path d="M 180 320 L 180 250" />
        <path d="M 188 320 L 192 268" />
        <path d="M 202 320 L 204 280" />
        <circle cx="160" cy="278" r="10" />
        <circle cx="172" cy="262" r="12" />
        <circle cx="184" cy="248" r="14" />
        <circle cx="196" cy="264" r="11" />
        <circle cx="208" cy="280" r="9" />
        <path d="M 156 270 Q 148 264 142 270" />
        <path d="M 218 280 Q 226 274 230 280" />
        <ellipse cx="178" cy="234" rx="8" ry="5" transform="rotate(-30 178 234)" />
        <ellipse cx="194" cy="232" rx="8" ry="5" transform="rotate(20 194 232)" />

        {/* Apron pocket */}
        <rect x="170" y="340" width="40" height="30" />
        <path d="M 180 350 L 180 360" />
        <circle cx="190" cy="354" r="2" fill="currentColor" />
      </g>
      <text x="280" y="76" style={scriptFont} fontSize="22" fill="currentColor" stroke="none"
            transform="rotate(8 280 76)">Léa</text>
      <path d="M 276 78 Q 264 92 232 100" {...stroke} strokeDasharray="2 3" />
    </svg>
  );
}
