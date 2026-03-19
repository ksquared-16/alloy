"use client";

/**
 * Full-page atmospheric layer for homepage: soft radial blooms (Alloy blue, pine, juniper)
 * and visible drifting specs. Renders fixed behind content so the page feels alive and premium.
 */
const PAGE_SPEC_POSITIONS: { left: string; top: string; juniper?: boolean }[] = [
  { left: "8%", top: "12%" },
  { left: "22%", top: "8%", juniper: true },
  { left: "45%", top: "15%" },
  { left: "72%", top: "22%" },
  { left: "88%", top: "18%", juniper: true },
  { left: "12%", top: "35%" },
  { left: "38%", top: "42%" },
  { left: "65%", top: "38%" },
  { left: "92%", top: "45%" },
  { left: "5%", top: "62%" },
  { left: "28%", top: "68%", juniper: true },
  { left: "55%", top: "72%" },
  { left: "78%", top: "65%" },
  { left: "18%", top: "88%" },
  { left: "50%", top: "92%" },
  { left: "82%", top: "85%", juniper: true },
];

export default function HomeAmbient() {
  return (
    <div className="home-atmosphere" aria-hidden>
      {/* Soft radial blooms */}
      <div className="home-atmosphere-bloom home-atmosphere-bloom-blue" />
      <div className="home-atmosphere-bloom home-atmosphere-bloom-pine" style={{ animationDelay: "-2s" }} />
      <div className="home-atmosphere-bloom home-atmosphere-bloom-juniper" style={{ animationDelay: "-4s" }} />
      {/* Drifting specs */}
      {PAGE_SPEC_POSITIONS.map((pos, i) => (
        <div
          key={i}
          className={`public-ambient-spec public-ambient-spec-dot ${pos.juniper ? "public-ambient-spec-dot-juniper" : ""}`}
          style={{ left: pos.left, top: pos.top }}
        />
      ))}
    </div>
  );
}
