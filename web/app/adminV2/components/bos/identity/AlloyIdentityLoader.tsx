"use client";

import "@/app/adminV2/components/bos/identity/bosIdentity.css";

import {
    AlloyIdentityAtmosphere,
    type AlloyIdentityAtmospherePhase,
} from "@/app/adminV2/components/bos/identity/AlloyIdentityAtmosphere";
import { BosHorizon } from "@/app/adminV2/components/bos/identity/BosHorizon";
import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import type { BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

type Props = {
    message?: string;
    markSize?: BosIdentitySize;
    /** When false, message is omitted (caller shows title beside the stack). */
    showMessage?: boolean;
    /** Drifting (default), tighten (~200ms readiness), or reveal handoff to drawer. */
    phase?: AlloyIdentityAtmospherePhase;
    className?: string;
    "data-testid"?: string;
};

/**
 * Canonical Alloy loading identity — atmosphere above mark, horizon beneath.
 * Intelligence condenses into form; no funnel, beam, or spotlight toward the mark.
 */
export function AlloyIdentityLoader({
    message = "Loading…",
    markSize = "md",
    showMessage = true,
    phase = "drifting",
    className = "",
    "data-testid": dataTestId = "alloy-identity-loader",
}: Props) {
    return (
        <div
            className={`alloy-identity-loader alloy-identity-loader--${phase} flex flex-col items-center text-center ${className}`.trim()}
            role="status"
            aria-live="polite"
            aria-busy={phase === "revealing" ? undefined : true}
            aria-label={showMessage ? message : "Loading"}
            data-alloy-identity-loader="true"
            data-alloy-identity-loader-phase={phase}
            data-testid={dataTestId}
        >
            <div className="alloy-identity-loader__stack flex w-full max-w-[9.5rem] flex-col items-center">
                <AlloyIdentityAtmosphere phase={phase} className="mb-1" />
                <div className="alloy-identity-loader__mark">
                    <BosMark size={markSize} />
                </div>
                <BosHorizon size={markSize} showWave={false} className="mt-0.5" />
            </div>
            {showMessage && message ?
                <p className="alloy-identity-loader__message mt-4 text-sm font-medium text-alloy-midnight/65">
                    {message}
                </p>
            :   null}
        </div>
    );
}
