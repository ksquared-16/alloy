"use client";

/**
 * Workspace shell ambient — renders the same company-field system as SystemCanvas
 * (AmbientFocusNode companyLayout: "field"): shared drift positions from companyFieldAmbient.ts,
 * adminv2-company-field-drift + orbital rings + bloom from adminV2.css.
 * Specs stay z-0 under workspace UI (shell z-10); pointer-events none.
 */
import { memo } from "react";
import { derived } from "@/styles/tokens/colors";
import {
  COMPANY_FIELD_DRIFT_FULL,
  COMPANY_FIELD_DRIFT_PERIMETER_START,
} from "./canvas/companyFieldAmbient";

const R8 = [0, 45, 90, 135, 180, 225, 270, 315];
const R10 = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const R12 = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

/** Slightly higher than canvas field cap (0.78) so the same system reads on the light workspace shell */
const WORKSPACE_COMPANY_FIELD_OPACITY = 0.9;

function WorkspaceAmbientLayerComponent() {
  return (
    <div className="adminv2-workspace-ambient-field" aria-hidden>
      <div
        className="adminv2-ambient-root-company-field"
        style={{ opacity: WORKSPACE_COMPANY_FIELD_OPACITY }}
      >
        <div
          className="adminv2-ambient-bloom adminv2-ambient-bloom-company-field"
          style={{
            background: `radial-gradient(ellipse 108% 102% at 48% 46%, ${derived.ambientCompanyBloomLift} 0%, ${derived.ambientLifeBloomCore} 18%, transparent 58%)`,
          }}
        />
        {COMPANY_FIELD_DRIFT_FULL.map((p, idx) => (
          <span
            key={`ws-cf-${idx}`}
            className={
              idx >= COMPANY_FIELD_DRIFT_PERIMETER_START
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
              key={`ws-cfa-${deg}`}
              className="adminv2-ambient-spec-company-field"
              style={{ transform: `rotate(${deg}deg) translateY(-118px)` }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-field-b" aria-hidden>
          {R10.map((deg) => (
            <span
              key={`ws-cfb-${deg}`}
              className="adminv2-ambient-spec-company-field-soft"
              style={{ transform: `rotate(${deg}deg) translateY(-198px)` }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-field-c" aria-hidden>
          {R12.map((deg) => (
            <span
              key={`ws-cfc-${deg}`}
              className="adminv2-ambient-spec-company-field-outer"
              style={{ transform: `rotate(${deg}deg) translateY(-292px)` }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-reverse adminv2-ambient-ring-company-field-d" aria-hidden>
          {R10.map((deg) => (
            <span
              key={`ws-cfd-${deg}`}
              className="adminv2-ambient-spec-company-field-dim"
              style={{ transform: `rotate(${deg}deg) translateY(-368px)` }}
            />
          ))}
        </div>
        <div className="adminv2-ambient-ring adminv2-ambient-ring-company-field-e" aria-hidden>
          {R12.map((deg) => (
            <span
              key={`ws-cfe-${deg}`}
              className="adminv2-ambient-spec-company-field-proof"
              style={{ transform: `rotate(${deg}deg) translateY(-402px)` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(WorkspaceAmbientLayerComponent);
