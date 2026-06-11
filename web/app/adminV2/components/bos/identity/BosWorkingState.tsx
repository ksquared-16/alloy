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
 * Use for analysis, drafting, and assembly — not generic page navigation.
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
            <div className="relative flex w-full max-w-xs flex-col items-center">
                <BosSmoke state={state} className="mb-1 w-full max-w-[9rem]" />
                <BosMark size={markSize} horizon />
                <p className="mt-4 text-sm font-medium text-alloy-midnight">{message}</p>
            </div>
        </div>
    );
}
