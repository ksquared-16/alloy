"use client";

import { memo } from "react";
import { type NodeProps } from "reactflow";
import { derived } from "@/styles/tokens/colors";
import {
  AMBIENT_FOCUS_MAX_DEPARTMENT,
  AMBIENT_FOCUS_MAX_MANAGER,
} from "./ambientTiers";

export type AmbientFocusData = {
  intensity: number;
  variant?: "company" | "focus";
  /** Company: hub = grid center large field; field = satellite for lateral/vertical spread */
  companyLayout?: "hub" | "field";
  /** Department vs manager focus — manager is strongest tier when wired. */
  focusTier?: "department" | "manager";
};

const R5 = [0, 72, 144, 216, 288];
const R5I = [36, 108, 180, 252, 324];
const R8 = [0, 45, 90, 135, 180, 225, 270, 315];
const R6 = [0, 60, 120, 180, 240, 300];
const R12 = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const R10 = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const R16 = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5];
const R20 = [0, 18, 36, 54, 72, 90, 108, 126, 144, 162, 180, 198, 216, 234, 252, 270, 288, 306, 324, 342];

const COMPANY_DRIFT: { l: number; t: number }[] = [
  { l: 8, t: 12 }, { l: 22, t: 6 }, { l: 38, t: 18 }, { l: 55, t: 8 }, { l: 72, t: 14 },
  { l: 88, t: 10 }, { l: 94, t: 28 }, { l: 12, t: 36 }, { l: 28, t: 48 }, { l: 48, t: 42 },
  { l: 68, t: 52 }, { l: 84, t: 44 }, { l: 6, t: 62 }, { l: 18, t: 78 }, { l: 35, t: 72 },
  { l: 52, t: 66 }, { l: 70, t: 74 }, { l: 88, t: 68 }, { l: 92, t: 86 }, { l: 42, t: 88 },
  { l: 58, t: 24 }, { l: 76, t: 32 }, { l: 14, t: 92 }, { l: 62, t: 12 },
  { l: 4, t: 22 }, { l: 96, t: 18 }, { l: 32, t: 8 }, { l: 66, t: 6 }, { l: 18, t: 52 },
  { l: 44, t: 58 }, { l: 78, t: 48 }, { l: 10, t: 44 }, { l: 90, t: 40 }, { l: 50, t: 16 },
  { l: 26, t: 28 }, { l: 74, t: 22 }, { l: 46, t: 76 }, { l: 60, t: 84 }, { l: 24, t: 64 },
  { l: 82, t: 58 }, { l: 98, t: 72 }, { l: 2, t: 48 }, { l: 54, t: 94 }, { l: 36, t: 38 },
  { l: 64, t: 34 }, { l: 16, t: 18 }, { l: 86, t: 26 },
];

/** Edge- and corner-weighted drift — de-centers company motion */
const COMPANY_DRIFT_EDGE: { l: number; t: number }[] = [
  { l: 1, t: 8 }, { l: 3, t: 45 }, { l: 2, t: 78 }, { l: 5, t: 92 }, { l: 12, t: 3 },
  { l: 8, t: 96 }, { l: 97, t: 6 }, { l: 99, t: 38 }, { l: 98, t: 72 }, { l: 94, t: 94 },
  { l: 48, t: 2 }, { l: 52, t: 4 }, { l: 22, t: 2 }, { l: 78, t: 3 }, { l: 50, t: 98 },
  { l: 30, t: 96 }, { l: 70, t: 97 }, { l: 0, t: 62 }, { l: 100, t: 55 }, { l: 15, t: 15 },
  { l: 85, t: 12 }, { l: 14, t: 88 }, { l: 88, t: 88 }, { l: 40, t: 6 }, { l: 60, t: 5 },
  { l: 6, t: 30 }, { l: 93, t: 28 }, { l: 25, t: 98 }, { l: 75, t: 99 }, { l: 50, t: 8 },
  { l: 33, t: 3 }, { l: 67, t: 2 }, { l: 1, t: 25 }, { l: 99, t: 18 },
];

const COMPANY_DRIFT_EDGE2: { l: number; t: number }[] = [
  { l: 0, t: 12 }, { l: 100, t: 8 }, { l: 4, t: 98 }, { l: 96, t: 96 }, { l: 18, t: 0 },
  { l: 82, t: 1 }, { l: 50, t: 0 }, { l: 0, t: 50 }, { l: 100, t: 42 }, { l: 11, t: 91 },
  { l: 91, t: 89 }, { l: 27, t: 7 }, { l: 73, t: 5 }, { l: 7, t: 73 }, { l: 95, t: 68 },
  { l: 45, t: 1 }, { l: 55, t: 99 }, { l: 1, t: 38 }, { l: 99, t: 28 }, { l: 38, t: 99 },
  { l: 62, t: 98 }, { l: 20, t: 95 }, { l: 80, t: 94 }, { l: 4, t: 68 }, { l: 98, t: 82 },
  { l: 15, t: 50 }, { l: 85, t: 52 }, { l: 50, t: 15 }, { l: 48, t: 86 },
];

const COMPANY_FIELD_DRIFT: { l: number; t: number }[] = [
  { l: 12, t: 18 }, { l: 88, t: 22 }, { l: 6, t: 52 }, { l: 94, t: 48 }, { l: 48, t: 8 },
  { l: 52, t: 92 }, { l: 22, t: 72 }, { l: 78, t: 68 }, { l: 35, t: 38 }, { l: 65, t: 42 },
  { l: 18, t: 88 }, { l: 82, t: 85 }, { l: 50, t: 50 }, { l: 8, t: 12 }, { l: 92, t: 14 },
  { l: 44, t: 62 }, { l: 56, t: 58 }, { l: 30, t: 28 }, { l: 70, t: 32 }, { l: 14, t: 44 },
  { l: 86, t: 40 }, { l: 40, t: 82 }, { l: 60, t: 78 },
  { l: 4, t: 24 }, { l: 96, t: 30 }, { l: 24, t: 8 }, { l: 76, t: 6 }, { l: 10, t: 62 },
  { l: 90, t: 58 }, { l: 42, t: 18 }, { l: 58, t: 14 }, { l: 16, t: 36 }, { l: 84, t: 34 },
  { l: 32, t: 88 }, { l: 68, t: 90 }, { l: 50, t: 68 }, { l: 28, t: 52 }, { l: 72, t: 48 },
  { l: 46, t: 42 }, { l: 54, t: 38 }, { l: 38, t: 72 }, { l: 62, t: 76 }, { l: 6, t: 78 },
  { l: 94, t: 74 }, { l: 20, t: 14 }, { l: 80, t: 12 }, { l: 2, t: 46 }, { l: 98, t: 52 },
  { l: 52, t: 28 }, { l: 48, t: 74 }, { l: 66, t: 22 }, { l: 34, t: 26 },
];

const FOCUS_DRIFT: { l: number; t: number; sz?: 0 | 1 | 2 }[] = [
  { l: 15, t: 72 }, { l: 85, t: 68 }, { l: 8, t: 55 }, { l: 92, t: 58 }, { l: 50, t: 82 },
  { l: 28, t: 78 }, { l: 72, t: 76 }, { l: 12, t: 88 }, { l: 88, t: 85 }, { l: 48, t: 92 },
  { l: 6, t: 38, sz: 1 }, { l: 94, t: 42, sz: 2 }, { l: 22, t: 22, sz: 0 }, { l: 78, t: 18, sz: 1 },
  { l: 38, t: 12, sz: 2 }, { l: 62, t: 10, sz: 0 }, { l: 10, t: 68, sz: 1 }, { l: 90, t: 72, sz: 2 },
  { l: 32, t: 62, sz: 0 }, { l: 68, t: 64, sz: 1 }, { l: 48, t: 58, sz: 2 }, { l: 18, t: 48, sz: 1 },
  { l: 82, t: 52, sz: 0 }, { l: 52, t: 48, sz: 1 }, { l: 26, t: 54, sz: 2 }, { l: 74, t: 50, sz: 0 },
  { l: 4, t: 82, sz: 1 }, { l: 96, t: 88, sz: 2 }, { l: 44, t: 86, sz: 0 }, { l: 58, t: 90, sz: 1 },
  { l: 34, t: 72, sz: 2 }, { l: 66, t: 78, sz: 0 }, { l: 14, t: 62, sz: 1 }, { l: 86, t: 60, sz: 2 },
  { l: 40, t: 32, sz: 0 }, { l: 60, t: 28, sz: 1 }, { l: 50, t: 38, sz: 2 }, { l: 30, t: 40, sz: 1 },
  { l: 70, t: 36, sz: 0 }, { l: 8, t: 28, sz: 2 }, { l: 92, t: 24, sz: 1 }, { l: 20, t: 8, sz: 0 },
  { l: 80, t: 6, sz: 2 }, { l: 46, t: 70, sz: 1 }, { l: 54, t: 66, sz: 0 }, { l: 2, t: 58, sz: 2 },
  { l: 98, t: 52, sz: 1 },
  { l: 11, t: 42, sz: 0 }, { l: 89, t: 46, sz: 1 }, { l: 24, t: 34, sz: 2 }, { l: 76, t: 30, sz: 0 },
  { l: 42, t: 22, sz: 1 }, { l: 58, t: 20, sz: 2 }, { l: 16, t: 74, sz: 0 }, { l: 84, t: 78, sz: 1 },
  { l: 36, t: 66, sz: 2 }, { l: 64, t: 70, sz: 0 }, { l: 50, t: 44, sz: 1 }, { l: 26, t: 50, sz: 2 },
  { l: 74, t: 46, sz: 0 }, { l: 6, t: 64, sz: 1 }, { l: 94, t: 66, sz: 2 }, { l: 38, t: 76, sz: 0 },
  { l: 62, t: 74, sz: 1 }, { l: 18, t: 56, sz: 2 }, { l: 82, t: 58, sz: 0 }, { l: 46, t: 36, sz: 1 },
  { l: 54, t: 34, sz: 2 }, { l: 32, t: 14, sz: 0 }, { l: 68, t: 12, sz: 1 }, { l: 12, t: 94, sz: 2 },
  { l: 88, t: 92, sz: 0 }, { l: 44, t: 52, sz: 1 }, { l: 56, t: 54, sz: 2 }, { l: 3, t: 48, sz: 0 },
  { l: 97, t: 44, sz: 1 },
  { l: 5, t: 22, sz: 2 }, { l: 95, t: 18, sz: 0 }, { l: 13, t: 32, sz: 1 }, { l: 87, t: 36, sz: 2 },
  { l: 23, t: 84, sz: 0 }, { l: 77, t: 88, sz: 1 }, { l: 41, t: 92, sz: 2 }, { l: 59, t: 90, sz: 0 },
  { l: 33, t: 18, sz: 1 }, { l: 67, t: 16, sz: 2 }, { l: 19, t: 52, sz: 0 }, { l: 81, t: 48, sz: 1 },
  { l: 47, t: 24, sz: 2 }, { l: 53, t: 22, sz: 0 }, { l: 29, t: 64, sz: 1 }, { l: 71, t: 68, sz: 2 },
  { l: 39, t: 80, sz: 0 }, { l: 61, t: 82, sz: 1 }, { l: 9, t: 38, sz: 2 }, { l: 91, t: 34, sz: 0 },
  { l: 51, t: 56, sz: 1 }, { l: 49, t: 60, sz: 2 }, { l: 1, t: 72, sz: 0 }, { l: 99, t: 76, sz: 1 },
  { l: 25, t: 12, sz: 2 }, { l: 75, t: 8, sz: 0 }, { l: 55, t: 72, sz: 1 }, { l: 45, t: 76, sz: 2 },
];

const FOCUS_MICRO: { l: number; t: number }[] = [
  { l: 19, t: 61 }, { l: 81, t: 63 }, { l: 13, t: 49 }, { l: 87, t: 51 }, { l: 47, t: 71 },
  { l: 53, t: 69 }, { l: 29, t: 57 }, { l: 71, t: 59 }, { l: 41, t: 45 }, { l: 59, t: 47 },
  { l: 23, t: 81 }, { l: 77, t: 83 }, { l: 9, t: 71 }, { l: 91, t: 73 }, { l: 51, t: 61 },
  { l: 35, t: 73 }, { l: 65, t: 75 }, { l: 17, t: 39 }, { l: 83, t: 41 }, { l: 49, t: 35 },
  { l: 27, t: 27 }, { l: 73, t: 25 }, { l: 55, t: 27 }, { l: 21, t: 65 }, { l: 79, t: 67 },
  { l: 7, t: 51 }, { l: 93, t: 53 }, { l: 39, t: 59 }, { l: 61, t: 57 }, { l: 45, t: 79 },
  { l: 55, t: 77 }, { l: 31, t: 87 }, { l: 69, t: 89 }, { l: 14, t: 76 }, { l: 86, t: 74 },
  { l: 52, t: 41 }, { l: 48, t: 63 }, { l: 66, t: 44 }, { l: 34, t: 46 }, { l: 58, t: 86 },
  { l: 42, t: 84 }, { l: 24, t: 54 }, { l: 76, t: 56 },
  { l: 11, t: 11 }, { l: 89, t: 9 }, { l: 7, t: 93 }, { l: 93, t: 91 }, { l: 31, t: 7 },
  { l: 69, t: 5 }, { l: 5, t: 41 }, { l: 95, t: 39 }, { l: 21, t: 19 }, { l: 79, t: 21 },
  { l: 37, t: 91 }, { l: 63, t: 93 }, { l: 15, t: 67 }, { l: 85, t: 65 }, { l: 49, t: 13 },
  { l: 51, t: 87 }, { l: 27, t: 45 }, { l: 73, t: 43 }, { l: 43, t: 29 }, { l: 57, t: 31 },
  { l: 17, t: 83 }, { l: 83, t: 81 }, { l: 35, t: 55 }, { l: 65, t: 53 }, { l: 53, t: 69 },
  { l: 47, t: 71 }, { l: 13, t: 25 }, { l: 87, t: 23 }, { l: 23, t: 39 }, { l: 77, t: 37 },
];

const FOCUS_DRIFT_CLASS = ["adminv2-focus-drift-sm", "adminv2-focus-drift-md", "adminv2-focus-drift-lg"] as const;

/** Top/bottom edges + left/right — chamber perimeter life (not center-clustered) */
const COMPANY_HUB_PERIMETER: { l: number; t: number }[] = (() => {
  const pts: { l: number; t: number }[] = [];
  for (let l = 0; l <= 100; l += 5) {
    pts.push({ l, t: 0.6 }, { l, t: 99.4 });
  }
  for (let t = 4; t <= 96; t += 4.2) {
    pts.push({ l: 0.6, t }, { l: 99.4, t });
  }
  return pts;
})();

const COMPANY_HUB_CORRIDOR: { l: number; t: number }[] = [
  ...Array.from({ length: 22 }, (_, i) => ({ l: 4 + (i * 92) / 21, t: 11 + (i % 5) * 0.4 })),
  ...Array.from({ length: 22 }, (_, i) => ({ l: 4 + (i * 92) / 21, t: 86 + (i % 5) * 0.4 })),
  ...Array.from({ length: 16 }, (_, i) => ({ l: 2.5 + (i % 8) * 0.3, t: 18 + i * 4.2 })),
  ...Array.from({ length: 16 }, (_, i) => ({ l: 97.2 + (i % 8) * 0.3, t: 18 + i * 4.2 })),
];

const COMPANY_HUB_DRIFT = [
  ...COMPANY_DRIFT,
  ...COMPANY_DRIFT_EDGE,
  ...COMPANY_DRIFT_EDGE2,
  ...COMPANY_HUB_PERIMETER,
  ...COMPANY_HUB_CORRIDOR,
  ...COMPANY_DRIFT.map((p, i) => ({ l: (p.l + 13 + (i % 6)) % 100, t: (p.t + 17 + i) % 100 })),
  ...COMPANY_DRIFT_EDGE.map((p, i) => ({ l: (p.l + 8 + i) % 100, t: (p.t + 21) % 100 })),
  ...COMPANY_DRIFT.map((p, i) => ({ l: Math.min(100, p.l + (i % 3) * 2), t: Math.max(0, p.t - (i % 5)) })),
];

const HUB_AMBIENT_PERIM_START =
  COMPANY_DRIFT.length + COMPANY_DRIFT_EDGE.length + COMPANY_DRIFT_EDGE2.length;
const HUB_AMBIENT_PERIM_END =
  HUB_AMBIENT_PERIM_START + COMPANY_HUB_PERIMETER.length + COMPANY_HUB_CORRIDOR.length;

const COMPANY_FIELD_EDGE: { l: number; t: number }[] = [
  ...Array.from({ length: 14 }, (_, i) => ({ l: (i * 100) / 13, t: 1.2 })),
  ...Array.from({ length: 14 }, (_, i) => ({ l: (i * 100) / 13, t: 98.8 })),
  ...Array.from({ length: 12 }, (_, i) => ({ l: 1.2, t: 8 + (i * 84) / 11 })),
  ...Array.from({ length: 12 }, (_, i) => ({ l: 98.8, t: 8 + (i * 84) / 11 })),
];

const COMPANY_FIELD_DRIFT_FULL = [
  ...COMPANY_FIELD_DRIFT,
  ...COMPANY_FIELD_DRIFT.map((p, i) => ({ l: (p.l + 19) % 100, t: (p.t + 23 + i) % 100 })),
  ...COMPANY_FIELD_DRIFT.map((p, i) => ({ l: (p.l * 0.7 + 15) % 100, t: (p.t * 0.8 + 10) % 100 })),
  ...COMPANY_FIELD_EDGE,
];

const FOCUS_PERIMETER_MICRO: { l: number; t: number }[] = (() => {
  const o: { l: number; t: number }[] = [];
  for (let i = 0; i < 28; i++) {
    o.push({ l: 1.2 + (i % 7) * 0.25, t: 5 + i * 3.2 });
    o.push({ l: 98.5 - (i % 7) * 0.25, t: 8 + i * 3.1 });
  }
  for (let i = 0; i < 20; i++) {
    o.push({ l: 6 + i * 4.4, t: 2.5 + (i % 3) * 0.2 });
    o.push({ l: 5 + i * 4.5, t: 97.2 + (i % 3) * 0.2 });
  }
  return o;
})();

function AmbientFocusNodeComponent({ data }: NodeProps<AmbientFocusData>) {
  const variant = data.variant ?? "focus";
  const isCompany = variant === "company";
  const companyLayout = data.companyLayout ?? "hub";
  const focusTier = data.focusTier ?? "department";
  const focusCap =
    focusTier === "manager" ? AMBIENT_FOCUS_MAX_MANAGER : AMBIENT_FOCUS_MAX_DEPARTMENT;
  const i = isCompany
    ? Math.max(0.5, Math.min(0.92, data.intensity ?? 0.8))
    : Math.max(0.52, Math.min(focusCap, data.intensity ?? 0.78));

  if (isCompany && companyLayout === "field") {
    const fi = Math.min(0.78, i);
    return (
      <div className="adminv2-ambient-root-company-field" style={{ opacity: fi }}>
        <div
          className="adminv2-ambient-bloom adminv2-ambient-bloom-company-field"
          style={{
            background: `radial-gradient(ellipse 108% 102% at 48% 46%, ${derived.ambientCompanyBloomLift} 0%, ${derived.ambientLifeBloomCore} 18%, transparent 58%)`,
          }}
        />
        {COMPANY_FIELD_DRIFT_FULL.map((p, idx) => (
          <span
            key={`cf-${idx}`}
            className={
              idx >= COMPANY_FIELD_DRIFT_FULL.length - COMPANY_FIELD_EDGE.length
                ? "adminv2-company-field-drift adminv2-company-field-drift-perimeter"
                : "adminv2-company-field-drift"
            }
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              backgroundColor: idx % 2 === 0 ? derived.ambientCompanySpecMid : derived.ambientCompanyParticleCore,
              animationDelay: `${idx * 0.22}s`,
            }}
          />
        ))}
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-field-a" aria-hidden>
          {R8.map((deg) => (
            <span
              key={`cfa-${deg}`}
              className="adminv2-ambient-spec-company-field"
              style={{ transform: `rotate(${deg}deg) translateY(-118px)` }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-field-b" aria-hidden>
          {R10.map((deg) => (
            <span
              key={`cfb-${deg}`}
              className="adminv2-ambient-spec-company-field-soft"
              style={{ transform: `rotate(${deg}deg) translateY(-198px)` }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-field-c" aria-hidden>
          {R12.map((deg) => (
            <span
              key={`cfc-${deg}`}
              className="adminv2-ambient-spec-company-field-outer"
              style={{ transform: `rotate(${deg}deg) translateY(-292px)` }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-field-d" aria-hidden>
          {R10.map((deg) => (
            <span
              key={`cfd-${deg}`}
              className="adminv2-ambient-spec-company-field-dim"
              style={{ transform: `rotate(${deg}deg) translateY(-368px)` }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-field-e" aria-hidden>
          {R12.map((deg) => (
            <span
              key={`cfe-${deg}`}
              className="adminv2-ambient-spec-company-field-proof"
              style={{ transform: `rotate(${deg}deg) translateY(-402px)` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isCompany) {
    return (
      <div className="adminv2-ambient-root-company-hub adminv2-ambient-proof-root" style={{ opacity: i }}>
        <div
          className="adminv2-ambient-bloom adminv2-ambient-bloom-company-hub"
          style={{
            background: `radial-gradient(ellipse 132% 100% at 36% 38%, ${derived.ambientCompanyBloomLift} 0%, ${derived.ambientLifeBloomCore} 14%, transparent 58%)`,
          }}
        />
        <div
          className="adminv2-ambient-bloom adminv2-ambient-bloom-company-hub-mid"
          style={{
            background: `radial-gradient(ellipse 88% 92% at 52% 48%, ${derived.ambientLifeBloomMid} 0%, transparent 50%)`,
          }}
        />
        <div
          className="adminv2-ambient-bloom adminv2-ambient-bloom-company-hub-soft"
          style={{
            background: `radial-gradient(ellipse 95% 78% at 68% 64%, ${derived.canvasChamberPineDrift} 0%, transparent 52%)`,
          }}
        />
        {COMPANY_HUB_DRIFT.map((p, idx) => (
          <span
            key={`d-${idx}`}
            className={`adminv2-company-drift-dot adminv2-company-drift-vivid adminv2-ambient-proof ${
              idx >= HUB_AMBIENT_PERIM_START && idx < HUB_AMBIENT_PERIM_END
                ? "adminv2-company-drift-perimeter-slow"
                : ""
            } ${idx % 3 === 0 ? "adminv2-company-drift-jumbo" : ""}`}
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              backgroundColor: idx % 3 === 0 ? derived.ambientCompanyParticleBright : derived.ambientCompanyParticleCore,
              animationDelay: `${idx * 0.14}s`,
            }}
          />
        ))}
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-hub-inner" aria-hidden>
          {R8.map((deg) => (
            <span
              key={`hi-${deg}`}
              className="adminv2-ambient-spec-company-bold"
              style={{
                transform: `rotate(${deg}deg) translateY(-128px)`,
                backgroundColor: derived.ambientCompanySpecVivid,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-hub-a" aria-hidden>
          {R10.map((deg) => (
            <span
              key={`ha-${deg}`}
              className="adminv2-ambient-spec-company-bold"
              style={{
                transform: `rotate(${deg}deg) translateY(-198px)`,
                backgroundColor: derived.ambientCompanySpecVivid,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-fast" aria-hidden>
          {R8.map((deg) => (
            <span
              key={`f-${deg}`}
              className="adminv2-ambient-spec-company-bold"
              style={{
                transform: `rotate(${deg}deg) translateY(-278px)`,
                backgroundColor: derived.ambientCompanySpecVivid,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-mid" aria-hidden>
          {R6.map((deg) => (
            <span
              key={`m-${deg}`}
              className="adminv2-ambient-spec-company-hero"
              style={{
                transform: `rotate(${deg}deg) translateY(-362px)`,
                backgroundColor: derived.ambientCompanySpecVivid,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company" aria-hidden>
          {R5.map((deg) => (
            <span
              key={deg}
              className="adminv2-ambient-spec-company-hero"
              style={{
                transform: `rotate(${deg}deg) translateY(-448px)`,
                backgroundColor: derived.ambientCompanySpecMid,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-slow" aria-hidden>
          {R5I.map((deg) => (
            <span
              key={deg}
              className="adminv2-ambient-spec-company-ring-outer"
              style={{
                transform: `rotate(${deg}deg) translateY(-532px)`,
                backgroundColor: derived.ambientCompanySpecVivid,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-outer2" aria-hidden>
          {R12.map((deg) => (
            <span
              key={`o-${deg}`}
              className="adminv2-ambient-spec-company-outer-dot"
              style={{
                transform: `rotate(${deg}deg) translateY(-618px)`,
                backgroundColor: derived.ambientCompanySpecMid,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-hub-outer" aria-hidden>
          {R16.map((deg) => (
            <span
              key={`ho-${deg}`}
              className="adminv2-ambient-spec-company-outer-wide"
              style={{
                transform: `rotate(${deg}deg) translateY(-702px)`,
                backgroundColor: derived.ambientCompanySpecMid,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-hub-rim" aria-hidden>
          {R12.map((deg) => (
            <span
              key={`hr-${deg}`}
              className="adminv2-ambient-spec-company-rim"
              style={{
                transform: `rotate(${deg}deg) translateY(-738px)`,
                backgroundColor: derived.ambientCompanyParticleBright,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-hub-mega" aria-hidden>
          {R20.map((deg) => (
            <span
              key={`hm-${deg}`}
              className="adminv2-ambient-spec-company-mega"
              style={{
                transform: `rotate(${deg}deg) translateY(-668px)`,
                backgroundColor: derived.ambientCompanyParticleBright,
              }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-horizon" aria-hidden>
          {R16.map((deg) => (
            <span
              key={`hz-${deg}`}
              className="adminv2-ambient-spec-company-horizon"
              style={{ transform: `rotate(${deg}deg) translateY(-812px)` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const FOCUS_DRIFT_PROOF = Array.from({ length: 52 }, (_, i) => ({
    l: (i * 23 + 11) % 100,
    t: (i * 31 + 7) % 100,
    sz: (i % 3) as 0 | 1 | 2,
  }));

  const FOCUS_MICRO_PROOF = FOCUS_MICRO.map((p, i) => ({
    l: (p.l + 17 + (i % 5)) % 100,
    t: (p.t + 13 + (i % 7)) % 100,
  }));

  const FOCUS_DEPT_DENSITY = Array.from({ length: 36 }, (_, k) => ({
    l: (k * 17 + 9) % 100,
    t: (k * 23 + 11) % 100,
  }));

  const FOCUS_MANAGER_EXTRA = Array.from({ length: 44 }, (_, k) => ({
    l: (k * 19 + 5 + (k % 7)) % 100,
    t: (k * 29 + 3 + (k % 5)) % 100,
  }));

  const tierClass =
    focusTier === "manager"
      ? "adminv2-ambient-tier-manager"
      : "adminv2-ambient-tier-department";

  const innerFilter =
    i > 1.008
      ? `brightness(${1 + (i - 1) * 0.62}) saturate(${1 + (i - 1) * 0.22})`
      : undefined;

  return (
    <div className={`adminv2-ambient-root-focus adminv2-ambient-proof-focus ${tierClass}`}>
      <div
        className="adminv2-ambient-focus-inner"
        style={{
          position: "absolute",
          inset: 0,
          opacity: Math.min(1, i),
          filter: innerFilter,
        }}
      >
      <div
        className="adminv2-ambient-bloom"
        style={{
          background: `radial-gradient(circle at 50% 55%, ${derived.ambientFocusLifeCore} 0%, ${derived.ambientFocusLifeMid} 32%, ${derived.ambientFocusLifeEdge} 52%, transparent 72%)`,
        }}
      />
      <div
        className="adminv2-ambient-bloom adminv2-ambient-bloom-focus-veil"
        style={{
          background: `radial-gradient(circle at 48% 62%, ${derived.canvasChamberBlueDepth} 0%, transparent 55%)`,
        }}
      />
      {FOCUS_MICRO.map((p, idx) => (
        <span
          key={`fm-${idx}`}
          className="adminv2-focus-micro-spec adminv2-focus-micro-proof"
          style={{
            left: `${p.l}%`,
            top: `${p.t}%`,
            animationDelay: `${idx * 0.07}s`,
          }}
        />
      ))}
      {FOCUS_MICRO_PROOF.map((p, idx) => (
        <span
          key={`fmp-${idx}`}
          className="adminv2-focus-micro-spec adminv2-focus-micro-proof"
          style={{
            left: `${p.l}%`,
            top: `${p.t}%`,
            animationDelay: `${idx * 0.09 + 0.4}s`,
          }}
        />
      ))}
      {FOCUS_PERIMETER_MICRO.map((p, idx) => (
        <span
          key={`fpm-${idx}`}
          className="adminv2-focus-micro-spec adminv2-focus-micro-proof adminv2-focus-micro-edge"
          style={{
            left: `${p.l}%`,
            top: `${p.t}%`,
            animationDelay: `${idx * 0.05}s`,
          }}
        />
      ))}
      {FOCUS_DRIFT.map((p, idx) => {
        const sz = p.sz ?? idx % 3;
        return (
          <span
            key={`fd-${idx}`}
            className={`adminv2-focus-drift-dot adminv2-focus-drift-perimeter adminv2-focus-drift-proof ${FOCUS_DRIFT_CLASS[sz]}`}
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              backgroundColor: idx % 4 === 0 ? derived.ambientFocusDriftBright : derived.ambientFocusLifeSpecAlt,
              animationDelay: `${idx * 0.08}s`,
            }}
          />
        );
      })}
      {FOCUS_DRIFT_PROOF.map((p, idx) => {
        const sz = p.sz;
        return (
          <span
            key={`fdp-${idx}`}
            className={`adminv2-focus-drift-dot adminv2-focus-drift-perimeter adminv2-focus-drift-proof ${FOCUS_DRIFT_CLASS[sz]}`}
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              backgroundColor: idx % 3 === 0 ? derived.ambientFocusDriftBright : derived.ambientFocusLifeSpecAlt,
              animationDelay: `${idx * 0.06 + 0.2}s`,
            }}
          />
        );
      })}
      {FOCUS_DEPT_DENSITY.map((p, idx) => (
        <span
          key={`fdd-${idx}`}
          className="adminv2-focus-micro-spec adminv2-focus-micro-proof adminv2-focus-dept-density"
          style={{
            left: `${p.l}%`,
            top: `${p.t}%`,
            animationDelay: `${idx * 0.05 + 0.15}s`,
          }}
        />
      ))}
      {focusTier === "manager" &&
        FOCUS_MANAGER_EXTRA.map((p, idx) => (
          <span
            key={`fme-${idx}`}
            className="adminv2-focus-drift-dot adminv2-focus-drift-perimeter adminv2-focus-drift-proof adminv2-focus-drift-md adminv2-focus-manager-extra"
            style={{
              left: `${p.l}%`,
              top: `${p.t}%`,
              backgroundColor: idx % 2 === 0 ? derived.ambientFocusDriftBright : derived.ambientFocusLifeSpecAlt,
              animationDelay: `${idx * 0.04}s`,
            }}
          />
        ))}
      <div className="adminv2-ambient-ring adminv2-ambient-ring-focus-early" aria-hidden>
        {R8.map((deg) => (
          <span
            key={`pe-${deg}`}
            className="adminv2-ambient-spec-focus-early"
            style={{ transform: `rotate(${deg}deg) translateY(-202px)` }}
          />
        ))}
      </div>
      <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-inner" aria-hidden>
        {R12.map((deg, i) => (
          <span
            key={`pi-${deg}`}
            className="adminv2-ambient-spec-focus-micro-orbit"
            style={{
              transform: `rotate(${deg}deg) translateY(-252px)`,
              opacity: i % 2 ? 0.65 : 0.9,
            }}
          />
        ))}
      </div>
      <div className="adminv2-ambient-ring adminv2-ambient-ring-focus-mid" aria-hidden>
        {R12.map((deg, i) => (
          <span
            key={`pm-${deg}`}
            className={i % 2 === 0 ? "adminv2-ambient-spec-focus-mid" : "adminv2-ambient-spec-focus-mid-soft"}
            style={{
              transform: `rotate(${deg}deg) translateY(-298px)`,
              backgroundColor: i % 2 === 0 ? derived.ambientFocusRingPine : derived.ambientFocusDriftBright,
            }}
          />
        ))}
      </div>
      <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-mid2" aria-hidden>
        {R10.map((deg) => (
          <span
            key={`pm2-${deg}`}
            className="adminv2-ambient-spec-focus-mid2"
            style={{
              transform: `rotate(${deg}deg) translateY(-342px)`,
              backgroundColor: derived.ambientFocusLifeSpecAlt,
            }}
          />
        ))}
      </div>
      <div className="adminv2-ambient-ring adminv2-ambient-ring-focus-fill" aria-hidden>
        {R10.map((deg) => (
          <span
            key={`pf-${deg}`}
            className="adminv2-ambient-spec-focus-fill"
            style={{ transform: `rotate(${deg}deg) translateY(-378px)` }}
          />
        ))}
      </div>
      <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-perimeter-a" aria-hidden>
        {R10.map((deg) => (
          <span
            key={`pa-${deg}`}
            className="adminv2-ambient-spec-focus-perimeter"
            style={{
              transform: `rotate(${deg}deg) translateY(-418px)`,
              backgroundColor: derived.ambientFocusLifeSpecAlt,
            }}
          />
        ))}
      </div>
      <div className="adminv2-ambient-ring adminv2-ambient-ring-focus-perimeter-b" aria-hidden>
        {R8.map((deg) => (
          <span
            key={`pb-${deg}`}
            className="adminv2-ambient-spec-focus-perimeter-soft"
            style={{
              transform: `rotate(${deg}deg) translateY(-462px)`,
              backgroundColor: derived.ambientSpec,
            }}
          />
        ))}
      </div>
      <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-perimeter-c" aria-hidden>
        {R12.map((deg) => (
          <span
            key={`pc-${deg}`}
            className="adminv2-ambient-spec-focus-perimeter-pine"
            style={{
              transform: `rotate(${deg}deg) translateY(-508px)`,
              backgroundColor: derived.ambientLifeSpecSoft,
            }}
          />
        ))}
      </div>
      <div className="adminv2-ambient-ring adminv2-ambient-ring-focus-outer" aria-hidden>
        {R16.map((deg) => (
          <span
            key={`po-${deg}`}
            className="adminv2-ambient-spec-focus-outer-fine adminv2-focus-spec-proof"
            style={{
              transform: `rotate(${deg}deg) translateY(-548px)`,
            }}
          />
        ))}
      </div>
      <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-focus-mega" aria-hidden>
        {R20.map((deg) => (
          <span
            key={`fmg-${deg}`}
            className="adminv2-ambient-spec-focus-mega"
            style={{ transform: `rotate(${deg}deg) translateY(-520px)` }}
          />
        ))}
      </div>
      </div>
    </div>
  );
}

export default memo(AmbientFocusNodeComponent);
