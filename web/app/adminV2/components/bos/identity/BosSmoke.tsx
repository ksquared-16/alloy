"use client";

import "@/app/adminV2/components/bos/identity/bosIdentity.css";

export type BosSmokeState = "thinking" | "converging";

type Props = {
    state?: BosSmokeState;
    className?: string;
};

/**
 * BOS smoke motion — subtle opacity drift above the mark.
 * Smoke never originates from the Alloy mark; it converges toward clarity when `state="converging"`.
 */
export function BosSmoke({ state = "thinking", className = "" }: Props) {
    return (
        <div
            className={`bos-smoke bos-smoke--${state} ${className}`.trim()}
            aria-hidden
            data-bos-smoke={state}
        >
            <span className="bos-smoke__layer bos-smoke__layer--1" />
            <span className="bos-smoke__layer bos-smoke__layer--2" />
            <span className="bos-smoke__layer bos-smoke__layer--3" />
        </div>
    );
}
