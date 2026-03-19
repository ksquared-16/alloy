"use client";

/**
 * Very subtle floating micro-specs for hero (and optionally modals).
 * Uses CSS classes from globals.css (public-hero-specs, public-hero-spec).
 */
const SPEC_POSITIONS = [
  { left: "12%", top: "25%" },
  { left: "28%", top: "60%" },
  { left: "18%", top: "75%" },
  { left: "35%", top: "35%" },
  { left: "22%", top: "48%" },
  { left: "8%", top: "55%" },
  { left: "40%", top: "18%" },
  { left: "15%", top: "88%" },
  { left: "32%", top: "82%" },
];

export default function HeroSpecs() {
  return (
    <div className="public-hero-specs" aria-hidden>
      {SPEC_POSITIONS.map((pos, i) => (
        <div
          key={i}
          className="public-hero-spec"
          style={{ left: pos.left, top: pos.top }}
        />
      ))}
    </div>
  );
}
