"use client";

import "@/app/adminV2/components/bos/identity/bosIdentity.css";

export type BosSmokeState = "thinking" | "converging" | "complete";

type Props = {
    state?: BosSmokeState;
    className?: string;
};

/**
 * BOS smoke motion — directional information streams above the mark.
 * Thinking: intake → organize → structure. Converging: funnel to focal point. Complete: fade.
 */
export function BosSmoke({ state = "thinking", className = "" }: Props) {
    return (
        <div
            className={`bos-smoke bos-smoke--${state} ${className}`.trim()}
            aria-hidden
            data-bos-smoke={state}
        >
            <span className="bos-smoke__wisp bos-smoke__wisp--branch-left" />
            <span className="bos-smoke__wisp bos-smoke__wisp--branch-right" />
            <span className="bos-smoke__wisp bos-smoke__wisp--core" />
            <span className="bos-smoke__wisp bos-smoke__wisp--trail-a" />
            <span className="bos-smoke__wisp bos-smoke__wisp--trail-b" />
        </div>
    );
}
