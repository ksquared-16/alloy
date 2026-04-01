"use client";

/**
 * Full-page motion environment: adminV2-style atmospheric field (lighter customer-facing).
 * - Large drifting gradient clouds (heavy blur)
 * - Slow radial blooms (breathe)
 * - Drifting specs: moderate density; blue / Bend Pine / Juniper mix with slightly bolder drift.
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
/** Alloy Blue default, Juniper accent, Bend Pine depth — ~40% pine / ~20% juniper / ~40% blue */
type SpecTone = "blue" | "juniper" | "pine";

type SpecPoint = { left: string; top: string; tone: SpecTone; size?: SpecSize };

function toneFromMod(m: number): SpecTone {
  const x = ((m % 5) + 5) % 5;
  if (x === 0) return "juniper";
  if (x === 1 || x === 2) return "pine";
  return "blue";
}

function toneClass(tone: SpecTone): string {
  if (tone === "juniper") return "public-ambient-spec-dot-juniper";
  if (tone === "pine") return "public-ambient-spec-dot-pine";
  return "";
}

/** Grid + edges + bands — ~25–30% more points than sparse pass; still below original proof grid */
function buildSpecPositions(): SpecPoint[] {
  const out: SpecPoint[] = [];
  for (let row = 0; row <= 5; row++) {
    const t = 3 + row * 15;
    for (let col = 0; col <= 6; col++) {
      const l = 3 + col * 14;
      const tone = toneFromMod(row + col);
      const size: SpecSize = (row + col) % 5 === 0 ? "lg" : (row + col) % 3 === 1 ? "sm" : "md";
      out.push({ left: `${l}%`, top: `${t}%`, tone, size });
    }
  }
  for (let i = 0; i < 11; i++) {
    out.push({ left: `${(i * 8.4) % 100}%`, top: "1%", tone: toneFromMod(i), size: "md" });
    out.push({ left: `${(i * 8.4) % 100}%`, top: "99%", tone: toneFromMod(i + 1), size: "sm" });
    out.push({ left: "1%", top: `${5 + (i * 8)}%`, tone: toneFromMod(i + 2), size: i % 4 === 0 ? "lg" : "md" });
    out.push({ left: "99%", top: `${5 + (i * 8)}%`, tone: toneFromMod(i + 3), size: i % 4 === 1 ? "lg" : "md" });
  }
  for (let i = 0; i < 11; i++) {
    out.push({ left: `${4 + (i * 8.4) % 92}%`, top: `${11 + (i % 6) * 3}%`, tone: toneFromMod(i + 4), size: i % 5 === 0 ? "lg" : "md" });
  }
  for (let i = 0; i < 10; i++) {
    out.push({ left: `${5 + (i * 9.6) % 90}%`, top: `${46 + (i % 4) * 12}%`, tone: toneFromMod(i + 5), size: i % 4 === 0 ? "lg" : "sm" });
    out.push({ left: `${6 + (i * 9) % 88}%`, top: `${76 + (i % 3) * 7}%`, tone: toneFromMod(i + 6), size: "md" });
  }
  return out;
}

const SPEC_POSITIONS = buildSpecPositions();

const HERO_PERIMETER_SPECS: { left: string; top: string; tone: SpecTone; size?: SpecSize }[] = [
  { left: "2%", top: "22%", tone: "juniper", size: "lg" },
  { left: "8%", top: "78%", tone: "pine", size: "md" },
  { left: "52%", top: "4%", tone: "pine", size: "lg" },
  { left: "94%", top: "55%", tone: "juniper", size: "md" },
  { left: "50%", top: "96%", tone: "pine", size: "lg" },
  { left: "18%", top: "12%", tone: "blue", size: "sm" },
  { left: "88%", top: "28%", tone: "pine", size: "md" },
  { left: "38%", top: "88%", tone: "juniper", size: "sm" },
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
            animationDelay: `${(i % 60) * 0.15}s`,
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
