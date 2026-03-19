"use client";

/**
 * Full-page motion environment: adminV2-style atmospheric field (lighter customer-facing).
 * - Large drifting gradient clouds (heavy blur)
 * - Slow radial blooms (breathe)
 * - Dense drifting specs: small/medium/large, blue + juniper, clearly visible in screenshots.
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
type SpecPoint = { left: string; top: string; juniper?: boolean; size?: SpecSize };

/** ~50% fewer specs: grid + edges + content bands (lighter density) */
function buildSpecPositions(): SpecPoint[] {
  const out: SpecPoint[] = [];
  // Grid: ~5x6 (was ~10x11)
  for (let row = 0; row <= 5; row++) {
    const t = 3 + row * 17;
    for (let col = 0; col <= 6; col++) {
      const l = 4 + col * 15;
      const juniper = (row + col) % 3 === 0;
      const size: SpecSize = (row + col) % 5 === 0 ? "lg" : (row + col) % 3 === 1 ? "sm" : "md";
      out.push({ left: `${l}%`, top: `${t}%`, juniper, size });
    }
  }
  // Edge perimeter (half)
  for (let i = 0; i < 12; i++) {
    out.push({ left: `${(i * 8.4) % 100}%`, top: "1%", juniper: i % 2 === 0, size: "md" });
    out.push({ left: `${(i * 8.4) % 100}%`, top: "99%", juniper: i % 2 === 1, size: "sm" });
    out.push({ left: "1%", top: `${6 + (i * 8)}%`, juniper: i % 3 === 0, size: i % 4 === 0 ? "lg" : "md" });
    out.push({ left: "99%", top: `${6 + (i * 8)}%`, juniper: i % 3 === 1, size: i % 4 === 1 ? "lg" : "md" });
  }
  // Hero band (half)
  for (let i = 0; i < 11; i++) {
    out.push({ left: `${4 + (i * 8.4) % 92}%`, top: `${12 + (i % 6) * 3}%`, juniper: i % 2 === 0, size: i % 5 === 0 ? "lg" : "md" });
  }
  // Mid + lower bands (half)
  for (let i = 0; i < 10; i++) {
    out.push({ left: `${5 + (i * 9.6) % 90}%`, top: `${48 + (i % 4) * 12}%`, juniper: i % 3 === 0, size: i % 4 === 0 ? "lg" : "sm" });
    out.push({ left: `${6 + (i * 9) % 88}%`, top: `${78 + (i % 3) * 7}%`, juniper: i % 2 === 1, size: "md" });
  }
  return out;
}

const SPEC_POSITIONS = buildSpecPositions();

const HERO_PERIMETER_SPECS: { left: string; top: string; juniper?: boolean; size?: SpecSize }[] = [
  { left: "2%", top: "22%", juniper: true, size: "lg" },
  { left: "8%", top: "78%", juniper: true, size: "md" },
  { left: "52%", top: "4%", juniper: true, size: "lg" },
  { left: "94%", top: "55%", juniper: true, size: "md" },
  { left: "50%", top: "96%", juniper: true, size: "lg" },
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
          className={`public-ambient-spec public-ambient-spec-dot ${pos.juniper ? "public-ambient-spec-dot-juniper" : ""} ${pos.size === "sm" ? "public-ambient-spec-sm" : ""} ${pos.size === "lg" ? "public-ambient-spec-lg" : ""}`}
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
          className={`public-ambient-spec public-ambient-spec-dot absolute ${pos.juniper ? "public-ambient-spec-dot-juniper" : ""} ${pos.size === "sm" ? "public-ambient-spec-sm" : ""} ${pos.size === "lg" ? "public-ambient-spec-lg" : ""}`}
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
