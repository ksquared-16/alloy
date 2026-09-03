"use client";

/**
 * FAIL THE CARD, NOT THE WORK UNIT.
 *
 * A published Focus Panel Surface took `/workspace/work-unit/waitlist` down to Next's
 * "a client-side exception has occurred" screen — the whole Work Unit, header and queue
 * included, for one defect in one composition. Publication of an operator-authored
 * Surface must never be capable of that, whatever else is wrong with the payload.
 *
 * So the blast radius is bounded HERE, at two scopes:
 *
 *   - `card`    — one cell's renderer threw. The cell keeps its authored geometry and
 *                 says so; every other card on the surface renders normally.
 *   - `surface` — the composition itself could not be built (a malformed published
 *                 layout, a derivation that threw before any card rendered). The Focus
 *                 Panel reports that it could not compose; the Work Unit around it lives.
 *
 * THREE THINGS THIS BOUNDARY DELIBERATELY DOES NOT DO:
 *
 *   1. It does not fall back to a legacy runtime. A surface that silently renders some
 *      OTHER composition is worse than one that reports a failure, because the operator
 *      then trusts a layout they did not author and nobody learns the published one is
 *      broken.
 *   2. It does not touch stored configuration. Nothing here repairs, rewrites or drops
 *      the published Surface — the authored composition is still exactly what it was,
 *      and re-renders once the defect is fixed.
 *   3. It is not a substitute for fixing the defect. It is the floor under the runtime,
 *      not the ceiling on correctness: every catch is a bug that still needs a root cause.
 *
 * It also cannot catch everything, and should not be read as if it could — a React error
 * boundary sees render/lifecycle throws, not errors raised in an event handler, a timer,
 * or a promise that nothing awaits.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
    children: ReactNode;
    /** `card` bounds one cell; `surface` bounds the whole composition. */
    scope: "card" | "surface";
    /** The card key, or the surface's mode — used in the operator-facing message + logs. */
    label: string;
};

type State = { error: Error | null };

export default class FocusPanelRenderErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // A caught render failure is still a defect. Report it loudly enough that it shows
        // up in the console and in whatever collects console errors, with the component
        // stack that says WHICH card — the thing the generic Next error screen threw away.
        // eslint-disable-next-line no-console
        console.error(
            `[focus-panel] ${this.props.scope} "${this.props.label}" failed to render`,
            error,
            info.componentStack,
        );
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        const isCard = this.props.scope === "card";
        return (
            <div
                className={
                    isCard
                        ? "alloy-os-fp-render-failure alloy-os-fp-render-failure--card"
                        : "alloy-os-fp-render-failure alloy-os-fp-render-failure--surface"
                }
                data-fp-render-failure={this.props.scope}
                data-fp-render-failure-label={this.props.label}
                role="status"
            >
                <p className="alloy-os-fp-render-failure__headline">
                    {isCard ? "This card could not be displayed." : "This surface could not be composed."}
                </p>
                <p className="alloy-os-fp-render-failure__detail">
                    {isCard
                        ? "The rest of the panel is unaffected, and the published configuration is unchanged."
                        : "The published configuration is unchanged. The rest of the Work Unit is unaffected."}
                </p>
            </div>
        );
    }
}
