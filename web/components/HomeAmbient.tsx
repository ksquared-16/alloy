"use client";

/**
 * Document-scoped ambient (rendered inside `public-site-atmosphere-layer` in ConditionalSiteLayout).
 * Specs: single staggered grid for even coverage; ~30% blue / 55% pine / 15% juniper; strong pine read.
 */
const CLOUDS = [
  { className: "home-atmosphere-cloud home-atmosphere-cloud-1" },
  { className: "home-atmosphere-cloud home-atmosphere-cloud-2" },
  { className: "home-atmosphere-cloud home-atmosphere-cloud-3" },
  { className: "home-atmosphere-cloud home-atmosphere-cloud-4" },
  { className: "home-atmosphere-cloud home-atmosphere-cloud-5" },
];

const BLOOMS = [
  { className: "home-atmosphere-bloom home-atmosphere-bloom-blue" },
  { className: "home-atmosphere-bloom home-atmosphere-bloom-pine", style: { animationDelay: "-2s" } },
  { className: "home-atmosphere-bloom home-atmosphere-bloom-juniper", style: { animationDelay: "-4s" } },
  { className: "home-atmosphere-bloom home-atmosphere-bloom-mid", style: { animationDelay: "-6s" } },
];

type SpecSize = "sm" | "md" | "lg";
type SpecTone = "blue" | "juniper" | "pine";

type SpecPoint = { left: string; top: string; tone: SpecTone; size?: SpecSize };

/** 30% blue / 55% Bend Pine / 15% juniper — pine + juniper dominate vs blue */
function toneFromMod(m: number): SpecTone {
  const x = ((m % 100) + 100) % 100;
  if (x < 30) return "blue";
  if (x < 85) return "pine";
  return "juniper";
}

function toneClass(tone: SpecTone): string {
  if (tone === "juniper") return "public-ambient-spec-dot-juniper";
  if (tone === "pine") return "public-ambient-spec-dot-pine";
  return "";
}

/* 13×18 = 234 specs; margins keep field under header/footer chrome; odd-row stagger reduces grid aliasing */
const SPEC_COLS = 13;
const SPEC_ROWS = 18;
const MARGIN_X = 3.5;
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 16;

function buildSpecPositions(): SpecPoint[] {
  const out: SpecPoint[] = [];
  const innerW = 100 - 2 * MARGIN_X;
  const innerH = 100 - MARGIN_TOP - MARGIN_BOTTOM;
  const cellW = innerW / SPEC_COLS;
  const cellH = innerH / SPEC_ROWS;
  const stagger = cellW * 0.5;

  for (let r = 0; r < SPEC_ROWS; r++) {
    const rowShift = (r % 2) * stagger;
    for (let c = 0; c < SPEC_COLS; c++) {
      let l = MARGIN_X + cellW * (c + 0.5) + rowShift;
      l = Math.min(100 - MARGIN_X - 0.35, Math.max(MARGIN_X + 0.35, l));
      const t = MARGIN_TOP + cellH * (r + 0.5);
      const tone = toneFromMod(r * 97 + c * 41 + (r % 3) * 17);
      const size: SpecSize = (r + c) % 7 === 0 ? "lg" : (r + c) % 4 === 1 ? "sm" : "md";
      out.push({ left: `${l.toFixed(2)}%`, top: `${t.toFixed(2)}%`, tone, size });
    }
  }
  return out;
}

const SPEC_POSITIONS = buildSpecPositions();

/** 16 hero specs — ~5 blue / ~9 pine / ~2 juniper, spread on card perimeter */
const HERO_PERIMETER_SPECS: { left: string; top: string; tone: SpecTone; size?: SpecSize }[] = [
  { left: "3%", top: "20%", tone: "pine", size: "lg" },
  { left: "10%", top: "76%", tone: "pine", size: "md" },
  { left: "50%", top: "5%", tone: "pine", size: "lg" },
  { left: "92%", top: "52%", tone: "pine", size: "md" },
  { left: "48%", top: "93%", tone: "pine", size: "lg" },
  { left: "20%", top: "14%", tone: "blue", size: "sm" },
  { left: "86%", top: "30%", tone: "blue", size: "md" },
  { left: "36%", top: "86%", tone: "juniper", size: "sm" },
  { left: "28%", top: "9%", tone: "pine", size: "sm" },
  { left: "68%", top: "13%", tone: "blue", size: "md" },
  { left: "12%", top: "46%", tone: "pine", size: "md" },
  { left: "89%", top: "40%", tone: "blue", size: "sm" },
  { left: "42%", top: "16%", tone: "pine", size: "lg" },
  { left: "61%", top: "82%", tone: "blue", size: "md" },
  { left: "24%", top: "56%", tone: "pine", size: "md" },
  { left: "75%", top: "66%", tone: "juniper", size: "sm" },
];

export default function HomeAmbient() {
  return (
    <div className="home-atmosphere" aria-hidden>
      {CLOUDS.map((c, i) => (
        <div key={`cloud-${i}`} className={c.className} />
      ))}
      {BLOOMS.map((b, i) => (
        <div key={`bloom-${i}`} className={b.className} style={b.style} />
      ))}
      {SPEC_POSITIONS.map((pos, i) => (
        <div
          key={i}
          className={`public-ambient-spec public-ambient-spec-dot ${toneClass(pos.tone)} ${pos.size === "sm" ? "public-ambient-spec-sm" : ""} ${pos.size === "lg" ? "public-ambient-spec-lg" : ""}`}
          style={{
            left: pos.left,
            top: pos.top,
            animationDelay: `${(i % 100) * 0.11}s`,
          }}
        />
      ))}
    </div>
  );
}

export function HeroPerimeterSpecs() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible -z-10" aria-hidden>
      {HERO_PERIMETER_SPECS.map((pos, i) => (
        <div
          key={i}
          className={`public-ambient-spec public-ambient-spec-dot absolute ${toneClass(pos.tone)} ${pos.size === "sm" ? "public-ambient-spec-sm" : ""} ${pos.size === "lg" ? "public-ambient-spec-lg" : ""}`}
          style={{
            left: pos.left,
            top: pos.top,
            animationDelay: `${i * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}
