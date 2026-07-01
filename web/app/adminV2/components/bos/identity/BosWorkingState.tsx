"use client";

import type { BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

import { AlloyIdentityLoader } from "@/app/adminV2/components/bos/identity/AlloyIdentityLoader";
import type { AlloyIdentityAtmospherePhase } from "@/app/adminV2/components/bos/identity/AlloyIdentityAtmosphere";
import { BosRevealSequence } from "@/app/adminV2/components/bos/identity/BosRevealSequence";
import type { BosSmokeState } from "@/app/adminV2/components/bos/identity/BosSmoke";

function loaderPhaseFromSmokeState(state: BosSmokeState): AlloyIdentityAtmospherePhase {
    if (state === "converging") return "tightening";
    if (state === "complete") return "revealing";
    return "drifting";
}

type Props = {
    message: string;
    /** Static smoke phase for gallery/docs. Omit for live working reveal loop. */
    state?: BosSmokeState;
    active?: boolean;
    markSize?: BosIdentitySize;
    className?: string;
    "data-testid"?: string;
};

/**
 * BOS working state — static smoke lockup, or live reveal sequence when `state` is omitted.
 */
export function BosWorkingState({
    message,
    state,
    active = true,
    markSize = "md",
    className = "",
    "data-testid": dataTestId = "bos-working-state",
}: Props) {
    if (state) {
        return (
            <div data-bos-working-state={state} className={className}>
                <AlloyIdentityLoader
                    message={message}
                    markSize={markSize}
                    phase={loaderPhaseFromSmokeState(state)}
                    data-testid={dataTestId}
                />
            </div>
        );
    }

    return (
        <BosRevealSequence
            mode="working"
            message={message}
            markSize={markSize}
            className={className}
            active={active}
            data-testid={dataTestId}
        />
    );
}
