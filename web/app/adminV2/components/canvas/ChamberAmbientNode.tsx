"use client";

import { memo, useMemo } from "react";
import { type NodeProps } from "reactflow";
export type ChamberAmbientData = {
  intensity: number;
  width: number;
  height: number;
};

const R8 = [0, 45, 90, 135, 180, 225, 270, 315];
const R10 = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const R12 = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const R16 = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5];

const DRIFT: { l: number; t: number }[] = (() => {
  const d: { l: number; t: number }[] = [];
  for (let l = 0; l <= 100; l += 4) {
    d.push({ l, t: 1 + (l % 7) * 0.1 }, { l, t: 99 - (l % 5) * 0.1 });
  }
  for (let t = 2; t < 98; t += 3.5) {
    d.push({ l: 0.8 + (t % 4) * 0.15, t }, { l: 99.1 - (t % 4) * 0.15, t });
  }
  for (let i = 0; i < 40; i++) {
    d.push({ l: 8 + (i * 84) / 39, t: 6 + (i % 11) * 8 });
    d.push({ l: 5 + (i % 17) * 5.5, t: 88 + (i % 7) });
  }
  return d;
})();

function ChamberAmbientNodeComponent({ data }: NodeProps<ChamberAmbientData>) {
  const { width: W, height: H, intensity } = data;
  const rm = useMemo(() => Math.min(W, H) * 0.42, [W, H]);
  const rings = useMemo(
    () => [
      { r: rm * 0.12, R: R8, cls: "adminv2-chamber-spec-a", rev: false, dur: "adminv2-chamber-ring-slow" },
      { r: rm * 0.22, R: R10, cls: "adminv2-chamber-spec-b", rev: true, dur: "adminv2-chamber-ring-mid" },
      { r: rm * 0.34, R: R8, cls: "adminv2-chamber-spec-c", rev: false, dur: "adminv2-chamber-ring-fast" },
      { r: rm * 0.46, R: R12, cls: "adminv2-chamber-spec-d", rev: true, dur: "adminv2-chamber-ring-slow" },
      { r: rm * 0.58, R: R10, cls: "adminv2-chamber-spec-e", rev: false, dur: "adminv2-chamber-ring-mid" },
      { r: rm * 0.72, R: R12, cls: "adminv2-chamber-spec-f", rev: true, dur: "adminv2-chamber-ring-outer" },
      { r: rm * 0.86, R: R16, cls: "adminv2-chamber-spec-g", rev: false, dur: "adminv2-chamber-ring-horizon" },
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
        opacity: Math.max(0.82, Math.min(1, intensity)),
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
      <div className="adminv2-chamber-ambient-masked">
        <div
          className="adminv2-chamber-bloom adminv2-chamber-bloom-1"
          style={{
            background:
              "radial-gradient(ellipse 58% 52% at 42% 44%, rgba(0, 162, 131, 0.34) 0%, rgba(0, 162, 131, 0.2) 28%, rgba(0, 162, 131, 0.08) 52%, transparent 72%)",
          }}
        />
        <div
          className="adminv2-chamber-bloom adminv2-chamber-bloom-2"
          style={{
            background:
              "radial-gradient(ellipse 52% 58% at 68% 58%, rgba(0, 162, 131, 0.16) 0%, rgba(0, 162, 131, 0.06) 40%, transparent 62%)",
          }}
        />
        <div
          className="adminv2-chamber-bloom adminv2-chamber-bloom-3"
          style={{
            background:
              "radial-gradient(ellipse 44% 46% at 52% 22%, rgba(0, 162, 131, 0.14) 0%, rgba(0, 120, 100, 0.06) 45%, transparent 58%)",
          }}
        />
        <div
          className="adminv2-chamber-bloom adminv2-chamber-bloom-4"
          style={{
            background:
              "radial-gradient(ellipse 54% 42% at 28% 78%, rgba(0, 162, 131, 0.22) 0%, rgba(0, 162, 131, 0.07) 42%, transparent 58%)",
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
        {rings.map((ring, ri) => (
          <div
            key={`ring-${ri}`}
            className={`adminv2-chamber-ring ${ring.rev ? "adminv2-chamber-ring-rev" : ""} ${ring.dur}`}
            aria-hidden
          >
            {ring.R.map((deg) => (
              <span
                key={deg}
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
