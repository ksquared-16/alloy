"use client";

import "@/app/adminV2/components/bos/identity/bosIdentity.css";

import { BosHorizon } from "@/app/adminV2/components/bos/identity/BosHorizon";
import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import { BosSmoke } from "@/app/adminV2/components/bos/identity/BosSmoke";
import type { BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

type Props = {
    message?: string;
    markSize?: BosIdentitySize;
    /** When false, message is omitted (caller shows title beside the stack). */
    showMessage?: boolean;
    className?: string;
    "data-testid"?: string;
};

/**
 * Canonical Alloy loading identity — mark above horizon, smoke rising behind the mark.
 * Use for drawers, routes, execution, and workspace transitions. No blur blobs or spinners.
 */
export function AlloyIdentityLoader({
    message = "Loading…",
    markSize = "md",
    showMessage = true,
    className = "",
    "data-testid": dataTestId = "alloy-identity-loader",
}: Props) {
    return (
        <div
            className={`alloy-identity-loader flex flex-col items-center text-center ${className}`.trim()}
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label={showMessage ? message : "Loading"}
            data-alloy-identity-loader="true"
            data-testid={dataTestId}
        >
            <div className="alloy-identity-loader__stack relative flex w-full max-w-[9.5rem] flex-col items-center">
                <div className="relative z-[2] -mb-0.5">
                    <BosMark size={markSize} />
                </div>
                <div className="alloy-identity-loader__smoke pointer-events-none absolute inset-x-[-18%] bottom-[0.35rem] top-[-0.5rem] z-[1]">
                    <BosSmoke state="thinking" className="h-full w-full" />
                </div>
                <BosHorizon size={markSize} showWave={false} className="relative z-[2] mt-0.5" />
            </div>
            {showMessage && message ?
                <p className="alloy-identity-loader__message mt-4 text-sm font-medium text-alloy-midnight/65">
                    {message}
                </p>
            :   null}
        </div>
    );
}
