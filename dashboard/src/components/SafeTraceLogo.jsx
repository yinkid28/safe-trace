/**
 * SafeTraceLogo — Pure SVG + CSS logo component
 *
 * No PNG dependency. Every element is a vector path,
 * so animation is pixel-perfect at any size.
 *
 * Props
 *   size      "sm" (32 px) | "md" (140 px) | "lg" (240 px) | number
 *   animate   boolean  (default true)
 *   variant   "default" | "light"
 */
import "./SafeTraceLogo.css";

const SIZES = { sm: 32, md: 140, lg: 240 };

/* All coordinates live in a 400 × 420 viewBox,
   traced from logo.png (1254 × 1254 px).
   Colors matched to --color-primary: #6B4F3A.   */

const SHIELD =
  "M200 34 L300 62 Q312 67 312 84 L312 186 Q312 268 200 288 Q88 268 88 186 L88 84 Q88 67 100 62 Z";

const S_ROAD =
  "M192 268 C150 260 105 248 128 222 C152 196 270 198 258 168 C246 138 128 130 150 100 C172 70 224 54 240 64";

const PIN =
  "M240 76 C234 64 226 54 226 42 A14 14 0 1 1 254 42 C254 54 246 64 240 76 Z";

const WAVE1 = "M254 30 A12 12 0 0 1 266 42";
const WAVE2 = "M252 22 A18 18 0 0 1 274 44";
const WAVE3 = "M250 14 A24 24 0 0 1 282 46";

export default function SafeTraceLogo({
  size = "md",
  animate = true,
  variant = "default",
}) {
  const px = typeof size === "number" ? size : (SIZES[size] ?? SIZES.md);
  const isLight = variant === "light";

  /* ── SMALL / LIGHT → icon only (no text) ── */
  if (isLight || px <= 48) {
    const stroke = isLight ? "#fff" : "#6B4F3A";
    const fill   = isLight ? "rgba(255,255,255,0.08)" : "#fff";
    const road   = isLight ? "rgba(255,255,255,0.4)" : "#8B6B50";
    const pin    = isLight ? "#fff" : "#d93838";
    const pinDot = isLight ? "rgba(255,255,255,0.3)" : "#fff";

    return (
      <div className="st-logo" style={{ width: px, height: px }}>
        <svg viewBox="60 0 290 310" fill="none" width="100%" height="100%">
          <path d={SHIELD} stroke={stroke} strokeWidth="12" strokeLinejoin="round" fill={fill} />
          <path d={S_ROAD} stroke={road} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d={PIN} fill={pin} />
          <circle cx="240" cy="42" r="4" fill={pinDot} />
        </svg>
      </div>
    );
  }

  /* ── FULL LOGO — shield + text, optional animation ── */
  return (
    <div
      className={`st-logo ${animate ? "st-logo--animate" : ""}`}
      style={{ width: px, display: "block", margin: "0 auto" }}
    >
      <svg viewBox="0 0 400 420" fill="none" width="100%">
        {/* Shield white interior (fades in behind stroke) */}
        <path className="st-shield-fill" d={SHIELD} fill="white" />

        {/* Shield brown border (draws on when animated) */}
        <path
          className="st-shield-stroke"
          d={SHIELD}
          stroke="#6B4F3A"
          strokeWidth="12"
          strokeLinejoin="round"
          fill="none"
        />

        {/* S-road inside shield */}
        <path
          className="st-road"
          d={S_ROAD}
          stroke="#8B6B50"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Small dot at road start */}
        <circle className="st-road-dot" cx="192" cy="268" r="5" fill="#6B4F3A" />

        {/* Red location pin at top of S */}
        <g className="st-pin-group">
          <path d={PIN} fill="#d93838" />
          <circle cx="240" cy="42" r="5" fill="white" />
        </g>

        {/* Signal wave arcs */}
        <path className="st-wave st-wave-1" d={WAVE1} stroke="#d93838" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path className="st-wave st-wave-2" d={WAVE2} stroke="#d93838" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path className="st-wave st-wave-3" d={WAVE3} stroke="#d93838" strokeWidth="1.5" strokeLinecap="round" fill="none" />

        {/* "SafeTrace" */}
        <text
          className="st-text-main"
          x="200"
          y="350"
          textAnchor="middle"
          fontSize="48"
          fontFamily="'Poppins', 'Segoe UI', sans-serif"
          fill="#6B4F3A"
        >
          <tspan fontWeight="800">Safe</tspan>
          <tspan fontWeight="600">Trace</tspan>
        </text>

        {/* Tagline with decorative dashes */}
        <g className="st-tagline">
          <line x1="72" y1="379" x2="100" y2="379" stroke="#bbb" strokeWidth="0.8" />
          <text
            x="200"
            y="383"
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fontFamily="'Poppins', 'Segoe UI', sans-serif"
            fill="#999"
            letterSpacing="0.12em"
          >
            YOUR SILENT SAFETY COMPANION
          </text>
          <line x1="300" y1="379" x2="328" y2="379" stroke="#bbb" strokeWidth="0.8" />
        </g>
      </svg>
    </div>
  );
}
