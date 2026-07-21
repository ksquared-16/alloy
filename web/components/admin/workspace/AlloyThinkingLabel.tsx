"use client";

import { useEffect, useState } from "react";

/** Canonical cycling ellipsis for the shared Alloy “Thinking” loader. */
export type ThinkingEllipsis = "." | ".." | "...";

export const THINKING_ELLIPSIS_CYCLE: readonly ThinkingEllipsis[] = [".", "..", "..."] as const;

export const THINKING_ELLIPSIS_INTERVAL_MS = 450;

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Cycles `. → .. → ...` while mounted. Stable `...` when prefers-reduced-motion.
 * Cleans up the interval on unmount; does not restart on unrelated parent re-renders
 * unless `intervalMs` changes.
 */
export function useCyclingEllipsis(
    intervalMs: number = THINKING_ELLIPSIS_INTERVAL_MS,
): ThinkingEllipsis {
    const [step, setStep] = useState(0);
    const [reducedMotion, setReducedMotion] = useState(() => prefersReducedMotion());

    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReducedMotion(mq.matches);
        const onChange = () => setReducedMotion(mq.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    useEffect(() => {
        if (reducedMotion) return;
        const id = window.setInterval(() => {
            setStep((prev) => (prev + 1) % THINKING_ELLIPSIS_CYCLE.length);
        }, intervalMs);
        return () => window.clearInterval(id);
    }, [intervalMs, reducedMotion]);

    if (reducedMotion) return "...";
    return THINKING_ELLIPSIS_CYCLE[step] ?? "...";
}

type AlloyThinkingLabelProps = {
    /** Boot shell uses `lg`; Focus Panel cold fill uses `sm`. */
    size?: "lg" | "sm";
    className?: string;
};

/**
 * Shared “Thinking” copy for AlloyOperationalBootShell / Focus Panel cold load.
 * Quieter than primary UI copy; ellipsis cycles without layout shift.
 */
export function AlloyThinkingLabel({ size = "lg", className = "" }: AlloyThinkingLabelProps) {
    const dots = useCyclingEllipsis();
    const sizeClass =
        size === "lg" ? "text-lg font-normal text-alloy-midnight/55" : "text-sm font-normal text-alloy-midnight/55";

    return (
        <p
            className={`${sizeClass} ${className}`.trim()}
            data-alloy-thinking-label="true"
            data-alloy-thinking-size={size}
            aria-label="Thinking"
        >
            <span>Thinking</span>
            {/* Reserve three-dot width so the label never jitters as the cycle advances. */}
            <span
                className="inline-block w-[1.35em] text-left tabular-nums"
                data-alloy-thinking-ellipsis="true"
                aria-hidden="true"
            >
                {dots}
            </span>
        </p>
    );
}
