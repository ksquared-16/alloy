"use client";

/**
 * Full-page motion environment: adminV2-style atmospheric field (lighter customer-facing).
 * - Large drifting gradient clouds (heavy blur)
 * - Slow radial blooms (breathe)
 * - Drifting specs: ~2× prior density; 40% blue / 60% pine+juniper; stronger drift amplitude.
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
/** ~40% Alloy Blue / ~60% Bend Pine + Juniper (50% pine, 10% juniper in the mix) */
type SpecTone = "blue" | "juniper" | "pine";

type SpecPoint = { left: string; top: string; tone: SpecTone; size?: SpecSize };

function toneFromMod(m: number): SpecTone {
  const x = ((m % 10) + 10) % 10;
  if (x < 4) return "blue";
  if (x < 9) return "pine";
  return "juniper";
}

function toneClass(tone: SpecTone): string {
  if (tone === "juniper") return "public-ambient-spec-dot-juniper";
  if (tone === "pine") return "public-ambient-spec-dot-pine";
  return "";
}

/** ~2× prior count: 7×12 grid + 22-edge strip + 22 upper band + 20×2 mid/lower = 234 (even spread, no clumps) */
const GRID_ROWS = 7;
const GRID_COLS = 12;
const EDGE_N = 22;
const UPPER_N = 22;
const MID_LOWER_N = 20;

function buildSpecPositions(): SpecPoint[] {
  const out: SpecPoint[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const t = 4 + row * 13;
    for (let col = 0; col < GRID_COLS; col++) {
      const l = 3 + (col * 91) / (GRID_COLS - 1);
      const tone = toneFromMod(row * 17 + col * 3);
      const size: SpecSize = (row + col) % 5 === 0 ? "lg" : (row + col) % 3 === 1 ? "sm" : "md";
      out.push({ left: `${l}%`, top: `${t}%`, tone, size });
    }
  }
  for (let i = 0; i < EDGE_N; i++) {
    const u = EDGE_N <= 1 ? 0 : i / (EDGE_N - 1);
    const x = 3 + u * 94;
    const y = 4 + u * 88;
    out.push({ left: `${x}%`, top: "0.85%", tone: toneFromMod(i), size: "md" });
    out.push({ left: `${x}%`, top: "99.15%", tone: toneFromMod(i + 3), size: "sm" });
    out.push({ left: "0.85%", top: `${y}%`, tone: toneFromMod(i + 5), size: i % 5 === 0 ? "lg" : "md" });
    out.push({ left: "99.15%", top: `${y}%`, tone: toneFromMod(i + 7), size: i % 5 === 1 ? "lg" : "md" });
  }
  for (let i = 0; i < UPPER_N; i++) {
    const left = 2 + (i * 92) / (UPPER_N - 1 || 1);
    const top = 8.5 + (i % 7) * 2.05;
    out.push({
      left: `${left}%`,
      top: `${top}%`,
      tone: toneFromMod(i + 11),
      size: i % 6 === 0 ? "lg" : "md",
    });
  }
  for (let i = 0; i < MID_LOWER_N; i++) {
    const leftMid = 4 + ((i * 47) % 91);
    const topMid = 43 + (i % 5) * 9;
    out.push({
      left: `${leftMid}%`,
      top: `${topMid}%`,
      tone: toneFromMod(i + 19),
      size: i % 4 === 0 ? "lg" : "sm",
    });
    const leftLow = 5 + ((i * 53) % 89);
    const topLow = 73 + (i % 4) * 6.2;
    out.push({
      left: `${leftLow}%`,
      top: `${topLow}%`,
      tone: toneFromMod(i + 29),
      size: "md",
    });
  }
  return out;
}

const SPEC_POSITIONS = buildSpecPositions();

/** 16 specs — staggered perimeter; 6 blue / 8 pine / 2 juniper (40% / 50% / 10%) */
const HERO_PERIMETER_SPECS: { left: string; top: string; tone: SpecTone; size?: SpecSize }[] = [
  { left: "2%", top: "22%", tone: "pine", size: "lg" },
  { left: "8%", top: "78%", tone: "pine", size: "md" },
  { left: "52%", top: "4%", tone: "pine", size: "lg" },
  { left: "94%", top: "55%", tone: "pine", size: "md" },
  { left: "50%", top: "96%", tone: "pine", size: "lg" },
  { left: "18%", top: "12%", tone: "blue", size: "sm" },
  { left: "88%", top: "28%", tone: "blue", size: "md" },
  { left: "38%", top: "88%", tone: "juniper", size: "sm" },
  { left: "30%", top: "7%", tone: "pine", size: "sm" },
  { left: "71%", top: "11%", tone: "blue", size: "md" },
  { left: "14%", top: "48%", tone: "pine", size: "md" },
  { left: "91%", top: "42%", tone: "blue", size: "sm" },
  { left: "44%", top: "18%", tone: "pine", size: "lg" },
  { left: "63%", top: "84%", tone: "blue", size: "md" },
  { left: "26%", top: "58%", tone: "blue", size: "md" },
  { left: "77%", top: "68%", tone: "juniper", size: "sm" },
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
