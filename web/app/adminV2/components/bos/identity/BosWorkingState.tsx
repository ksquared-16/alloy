"use client";

import type { BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import { BosRevealSequence } from "@/app/adminV2/components/bos/identity/BosRevealSequence";
import { BosSmoke, type BosSmokeState } from "@/app/adminV2/components/bos/identity/BosSmoke";

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
            <div
                className={`flex flex-col items-center justify-center px-4 py-6 text-center ${className}`.trim()}
                role="status"
                aria-live="polite"
                aria-busy={state !== "complete"}
                data-bos-working-state={state}
                data-testid={dataTestId}
            >
                <div className="relative flex w-full max-w-[12rem] flex-col items-center">
                    <BosSmoke state={state} className="mb-1 w-full" />
                    <BosMark size={markSize} horizon />
                    <p className="mt-5 text-sm font-medium text-alloy-midnight/85">{message}</p>
                </div>
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
