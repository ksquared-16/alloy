"use client";

import "@/app/adminV2/components/bos/identity/bosIdentity.css";

export type BosSmokeState = "thinking" | "converging" | "complete";

type Props = {
    state?: BosSmokeState;
    className?: string;
};

/**
 * BOS smoke — soft cloud of possibility condensing toward clarity above the mark.
 * Emotional motion only; the mark carries structure.
 */
export function BosSmoke({ state = "thinking", className = "" }: Props) {
    return (
        <div
            className={`bos-smoke bos-smoke--${state} ${className}`.trim()}
            aria-hidden
            data-bos-smoke={state}
        >
            <span className="bos-smoke__cloud bos-smoke__cloud--upper" />
            <span className="bos-smoke__cloud bos-smoke__cloud--mid" />
            <span className="bos-smoke__cloud bos-smoke__cloud--lower" />
            <span className="bos-smoke__cloud bos-smoke__cloud--near" />
        </div>
    );
}
