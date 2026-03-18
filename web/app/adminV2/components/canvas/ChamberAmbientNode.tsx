"use client";

import { memo, useMemo } from "react";
import { type NodeProps } from "reactflow";
export type ChamberAmbientData = {
  intensity: number;
  width: number;
  height: number;
};

const R6 = [0, 60, 120, 180, 240, 300];
const R8 = [0, 45, 90, 135, 180, 225, 270, 315];
const R10 = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const R12 = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const R16 = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5];
const R20 = [0, 18, 36, 54, 72, 90, 108, 126, 144, 162, 180, 198, 216, 234, 252, 270, 288, 306, 324, 342];

/** Company org view: ~1.5× stronger field vs prior (blooms + filter in CSS). */
const AMP = 1.5;

const DRIFT: { l: number; t: number }[] = (() => {
  const d: { l: number; t: number }[] = [];
  for (let l = 0; l <= 100; l += 2.6) {
    d.push({ l, t: 1.2 + (l % 11) * 0.18 });
    d.push({ l, t: 98.5 - (l % 9) * 0.18 });
  }
  for (let t = 1.5; t < 98.5; t += 2.1) {
    d.push({ l: 0.4 + (t % 7) * 0.11, t });
    d.push({ l: 99.3 - (t % 7) * 0.11, t });
  }
  for (let i = 0; i < 95; i++) {
    d.push({ l: 4 + (i % 28) * 3.4, t: 5 + (i % 26) * 3.5 });
    d.push({ l: 2.5 + (i * 5.7) % 95, t: 82 + (i % 15) });
    d.push({ l: 12 + ((i * 13) % 76), t: 18 + ((i * 11) % 62) });
  }
  return d;
})();

const DRIFT_MICRO: { l: number; t: number }[] = (() => {
  const d: { l: number; t: number }[] = [];
  for (let i = 0; i < 110; i++) {
    d.push({
      l: 6 + ((i * 17.3) % 88),
      t: 8 + ((i * 23.7) % 84),
    });
  }
  return d;
})();

function ChamberAmbientNodeComponent({ data }: NodeProps<ChamberAmbientData>) {
  const { width: W, height: H, intensity } = data;
  const rm = useMemo(() => Math.min(W, H) * 0.42, [W, H]);
  const rings = useMemo(
    () => [
      { r: rm * 0.09, R: R6, cls: "adminv2-chamber-spec-a", rev: true, dur: "adminv2-chamber-ring-fast" },
      { r: rm * 0.12, R: R8, cls: "adminv2-chamber-spec-a", rev: false, dur: "adminv2-chamber-ring-slow" },
      { r: rm * 0.17, R: R10, cls: "adminv2-chamber-spec-b", rev: true, dur: "adminv2-chamber-ring-mid" },
      { r: rm * 0.22, R: R10, cls: "adminv2-chamber-spec-b", rev: false, dur: "adminv2-chamber-ring-mid" },
      { r: rm * 0.28, R: R8, cls: "adminv2-chamber-spec-c", rev: true, dur: "adminv2-chamber-ring-fast" },
      { r: rm * 0.34, R: R8, cls: "adminv2-chamber-spec-c", rev: false, dur: "adminv2-chamber-ring-fast" },
      { r: rm * 0.4, R: R12, cls: "adminv2-chamber-spec-d", rev: true, dur: "adminv2-chamber-ring-slow" },
      { r: rm * 0.46, R: R12, cls: "adminv2-chamber-spec-d", rev: false, dur: "adminv2-chamber-ring-slow" },
      { r: rm * 0.52, R: R10, cls: "adminv2-chamber-spec-e", rev: true, dur: "adminv2-chamber-ring-mid" },
      { r: rm * 0.58, R: R10, cls: "adminv2-chamber-spec-e", rev: false, dur: "adminv2-chamber-ring-mid" },
      { r: rm * 0.65, R: R12, cls: "adminv2-chamber-spec-f", rev: true, dur: "adminv2-chamber-ring-outer" },
      { r: rm * 0.72, R: R12, cls: "adminv2-chamber-spec-f", rev: false, dur: "adminv2-chamber-ring-outer" },
      { r: rm * 0.79, R: R16, cls: "adminv2-chamber-spec-g", rev: true, dur: "adminv2-chamber-ring-horizon" },
      { r: rm * 0.86, R: R16, cls: "adminv2-chamber-spec-g", rev: false, dur: "adminv2-chamber-ring-horizon" },
      { r: rm * 0.91, R: R20, cls: "adminv2-chamber-spec-d", rev: true, dur: "adminv2-chamber-ring-horizon" },
    ],
    [rm]
  );

  return (
    <div
      className="adminv2-chamber-ambient-anchor nodrag nopan"
      style={{
        width: 1,
        height: 1,
        position: "relative",
        opacity: Math.min(1, Math.max(0.96, intensity) * 1.08),
      }}
    >
      <div
        className="adminv2-chamber-ambient-root"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: W,
          height: H,
          marginLeft: -W / 2,
          marginTop: -H / 2,
        }}
      >
      <div className="adminv2-chamber-ambient-masked adminv2-chamber-vivid adminv2-chamber-org-amp">
        <div
          className="adminv2-chamber-bloom adminv2-chamber-bloom-1"
          style={{
            background: `radial-gradient(ellipse 62% 56% at 42% 44%, rgba(0, 162, 131, ${Math.min(0.72, 0.44 * AMP)}) 0%, rgba(0, 162, 131, ${Math.min(0.45, 0.26 * AMP)}) 26%, rgba(0, 162, 131, ${Math.min(0.2, 0.11 * AMP)}) 50%, transparent 70%)`,
          }}
        />
        <div
          className="adminv2-chamber-bloom adminv2-chamber-bloom-2"
          style={{
            background: `radial-gradient(ellipse 56% 62% at 68% 58%, rgba(0, 162, 131, ${Math.min(0.38, 0.22 * AMP)}) 0%, rgba(0, 162, 131, ${Math.min(0.16, 0.09 * AMP)}) 38%, transparent 58%)`,
          }}
        />
        <div
          className="adminv2-chamber-bloom adminv2-chamber-bloom-3"
          style={{
            background: `radial-gradient(ellipse 48% 50% at 52% 22%, rgba(0, 162, 131, ${Math.min(0.34, 0.2 * AMP)}) 0%, rgba(0, 120, 100, ${Math.min(0.16, 0.09 * AMP)}) 42%, transparent 55%)`,
          }}
        />
        <div
          className="adminv2-chamber-bloom adminv2-chamber-bloom-4"
          style={{
            background: `radial-gradient(ellipse 58% 46% at 28% 78%, rgba(0, 162, 131, ${Math.min(0.52, 0.3 * AMP)}) 0%, rgba(0, 162, 131, ${Math.min(0.18, 0.1 * AMP)}) 40%, transparent 55%)`,
          }}
        />
        {DRIFT.map((p, idx) => (
          <span
            key={`d-${idx}`}
            className="adminv2-chamber-drift"
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              animationDelay: `${(idx % 40) * 0.08}s`,
            }}
          />
        ))}
        {DRIFT.map((p, idx) => (
          <span
            key={`d2-${idx}`}
            className="adminv2-chamber-drift adminv2-chamber-drift-phase2"
            style={{
              left: `${(p.l + 3.7) % 100}%`,
              top: `${(p.t + 2.1) % 100}%`,
              animationDelay: `${0.4 + (idx % 35) * 0.06}s`,
            }}
          />
        ))}
        {DRIFT.map((p, idx) => (
          <span
            key={`d3-${idx}`}
            className="adminv2-chamber-drift adminv2-chamber-drift-phase3"
            style={{
              left: `${(p.l + 11.3) % 100}%`,
              top: `${(p.t + 7.8) % 100}%`,
              animationDelay: `${0.2 + (idx % 28) * 0.05}s`,
            }}
          />
        ))}
        {DRIFT_MICRO.map((p, idx) => (
          <span
            key={`dm-${idx}`}
            className="adminv2-chamber-drift adminv2-chamber-drift-micro"
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              animationDelay: `${(idx % 50) * 0.04}s`,
            }}
          />
        ))}
        {rings.map((ring, ri) => (
          <div
            key={`ring-${ri}`}
            className={`adminv2-chamber-ring ${ring.rev ? "adminv2-chamber-ring-rev" : ""} ${ring.dur}`}
            aria-hidden
          >
            {ring.R.map((deg) => (
              <span
                key={`${ri}-${deg}`}
                className={ring.cls}
                style={{ transform: `rotate(${deg}deg) translateY(-${ring.r}px)` }}
              />
            ))}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

export default memo(ChamberAmbientNodeComponent);
