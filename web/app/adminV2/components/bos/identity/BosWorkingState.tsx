"use client";

import type { BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import { BosSmoke, type BosSmokeState } from "@/app/adminV2/components/bos/identity/BosSmoke";

type Props = {
    message: string;
    state?: BosSmokeState;
    markSize?: BosIdentitySize;
    className?: string;
    "data-testid"?: string;
};

/**
 * BOS working state — smoke above mark + horizon, with operational copy.
 */
export function BosWorkingState({
    message,
    state = "thinking",
    markSize = "md",
    className = "",
    "data-testid": dataTestId = "bos-working-state",
}: Props) {
    return (
        <div
            className={`flex flex-col items-center justify-center px-4 py-6 text-center ${className}`.trim()}
            role="status"
            aria-live="polite"
            aria-busy="true"
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
