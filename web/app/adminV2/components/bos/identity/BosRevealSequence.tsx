"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { BosIdentitySize } from "@/lib/bos/bosIdentityTokens";

import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import { BosSmoke, type BosSmokeState } from "@/app/adminV2/components/bos/identity/BosSmoke";

export type BosRevealMode = "working" | "workspace";

export type BosRevealPhase = "complexity" | "condensing" | "reveal" | "environment" | "complete";

const WORKING_LOOP_MS = { complexity: 2800, condensing: 2400 } as const;

const WORKING_FINISH_MS = { reveal: 550, complete: 850 } as const;

const WORKSPACE_SEQUENCE_MS = {
    complexity: 1800,
    condensing: 1600,
    reveal: 750,
    environment: 950,
    complete: 350,
} as const;

type Props = {
    mode: BosRevealMode;
    message?: string;
    onComplete?: () => void;
    /** Run the full reveal once on mount (gallery / workspace open). */
    autoPlay?: boolean;
    /** Working mode: loop while true; false triggers reveal → complete. */
    active?: boolean;
    markSize?: BosIdentitySize;
    className?: string;
    children?: ReactNode;
    fill?: boolean;
    "data-testid"?: string;
};

function smokeStateForPhase(phase: BosRevealPhase): BosSmokeState {
    if (phase === "complexity") return "thinking";
    if (phase === "condensing" || phase === "reveal") return "converging";
    return "complete";
}

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * BOS reveal motion — cloud condenses into mark; workspace mode expands into perimeter shell.
 */
export function BosRevealSequence({
    mode,
    message,
    onComplete,
    autoPlay = false,
    active = true,
    markSize = "md",
    className = "",
    children,
    fill = false,
    "data-testid": dataTestId = "bos-reveal-sequence",
}: Props) {
    const [phase, setPhase] = useState<BosRevealPhase>("complexity");
    const [revealed, setRevealed] = useState(false);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    const finish = () => {
        setPhase("complete");
        setRevealed(true);
        onCompleteRef.current?.();
    };

    useEffect(() => {
        if (prefersReducedMotion()) {
            finish();
            return;
        }

        if (autoPlay) {
            setPhase("complexity");
            setRevealed(false);

            if (mode === "working") {
                const t1 = window.setTimeout(() => setPhase("condensing"), WORKING_LOOP_MS.complexity);
                const t2 = window.setTimeout(() => setPhase("reveal"), WORKING_LOOP_MS.complexity + WORKING_LOOP_MS.condensing);
                const t3 = window.setTimeout(
                    () => setPhase("complete"),
                    WORKING_LOOP_MS.complexity + WORKING_LOOP_MS.condensing + WORKING_FINISH_MS.reveal,
                );
                const t4 = window.setTimeout(
                    finish,
                    WORKING_LOOP_MS.complexity +
                        WORKING_LOOP_MS.condensing +
                        WORKING_FINISH_MS.reveal +
                        WORKING_FINISH_MS.complete,
                );
                return () => {
                    window.clearTimeout(t1);
                    window.clearTimeout(t2);
                    window.clearTimeout(t3);
                    window.clearTimeout(t4);
                };
            }

            const t1 = window.setTimeout(() => setPhase("condensing"), WORKSPACE_SEQUENCE_MS.complexity);
            const t2 = window.setTimeout(
                () => setPhase("reveal"),
                WORKSPACE_SEQUENCE_MS.complexity + WORKSPACE_SEQUENCE_MS.condensing,
            );
            const t3 = window.setTimeout(
                () => setPhase("environment"),
                WORKSPACE_SEQUENCE_MS.complexity + WORKSPACE_SEQUENCE_MS.condensing + WORKSPACE_SEQUENCE_MS.reveal,
            );
            const t4 = window.setTimeout(
                () => setPhase("complete"),
                WORKSPACE_SEQUENCE_MS.complexity +
                    WORKSPACE_SEQUENCE_MS.condensing +
                    WORKSPACE_SEQUENCE_MS.reveal +
                    WORKSPACE_SEQUENCE_MS.environment,
            );
            const t5 = window.setTimeout(
                finish,
                WORKSPACE_SEQUENCE_MS.complexity +
                    WORKSPACE_SEQUENCE_MS.condensing +
                    WORKSPACE_SEQUENCE_MS.reveal +
                    WORKSPACE_SEQUENCE_MS.environment +
                    WORKSPACE_SEQUENCE_MS.complete,
            );
            return () => {
                window.clearTimeout(t1);
                window.clearTimeout(t2);
                window.clearTimeout(t3);
                window.clearTimeout(t4);
                window.clearTimeout(t5);
            };
        }

        if (mode !== "working") return;

        if (!active) {
            setPhase("reveal");
            const t1 = window.setTimeout(() => setPhase("complete"), WORKING_FINISH_MS.reveal);
            const t2 = window.setTimeout(finish, WORKING_FINISH_MS.reveal + WORKING_FINISH_MS.complete);
            return () => {
                window.clearTimeout(t1);
                window.clearTimeout(t2);
            };
        }

        setPhase("complexity");
        setRevealed(false);
        let cancelled = false;
        let onCondensing = false;
        let timeout = 0;

        const schedule = () => {
            if (cancelled) return;
            onCondensing = !onCondensing;
            setPhase(onCondensing ? "condensing" : "complexity");
            timeout = window.setTimeout(
                schedule,
                onCondensing ? WORKING_LOOP_MS.condensing : WORKING_LOOP_MS.complexity,
            );
        };

        timeout = window.setTimeout(schedule, WORKING_LOOP_MS.complexity);

        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [active, autoPlay, mode]);

    const smokeState = smokeStateForPhase(phase);
    const markVisible = phase === "reveal" || phase === "environment" || phase === "complete" || revealed;
    const showEnvironment = mode === "workspace" && (phase === "environment" || phase === "complete" || revealed);
    const showMessage = Boolean(message) && mode === "working";

    if (mode === "workspace" && revealed && children) {
        return (
            <div className={`bos-reveal bos-reveal--workspace bos-reveal--revealed ${className}`.trim()} data-testid={dataTestId}>
                {children}
            </div>
        );
    }

    return (
        <div
            className={`bos-reveal bos-reveal--${mode} bos-reveal--phase-${phase} ${fill ? "bos-reveal--fill" : ""} ${className}`.trim()}
            role="status"
            aria-live="polite"
            aria-busy={!revealed}
            data-bos-reveal-mode={mode}
            data-bos-reveal-phase={phase}
            data-testid={dataTestId}
        >
            <div className="bos-reveal__stage">
                {showEnvironment ?
                    <div className="bos-reveal__environment" aria-hidden>
                        <div className="bos-reveal__environment-perimeter" />
                        <div className="bos-reveal__environment-atmosphere" />
                    </div>
                :   null}

                <div className="bos-reveal__smoke-stack">
                    <div
                        className={`bos-reveal__smoke-veil ${phase === "reveal" || phase === "environment" ? "bos-reveal__smoke-veil--clearing" : ""}`}
                    >
                        <BosSmoke state={smokeState} />
                    </div>
                    <div
                        className={`bos-reveal__mark ${markVisible ? "bos-reveal__mark--visible" : ""}`.trim()}
                        aria-hidden={!markVisible}
                    >
                        <BosMark size={markSize} horizon />
                    </div>
                </div>

                {showMessage ?
                    <p className="bos-reveal__message">{message}</p>
                :   null}
            </div>

            {mode === "workspace" && revealed && children ?
                <div className="bos-reveal__content">{children}</div>
            :   null}
        </div>
    );
}
