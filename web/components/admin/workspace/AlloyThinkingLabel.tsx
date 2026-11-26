"use client";

/**
 * Shared "Thinking" copy for AlloyOperationalBootShell / Focus Panel cold load.
 *
 * The motion is a calm, continuous breath (three dots on a slow, staggered sine — see
 * `.motion-thinking-dot` / `@keyframes motion-thinking-breath` in globals.css), not a stepping
 * `. → .. → ...` ellipsis. Stepping reads as a discrete loading counter ("waiting"); a soft light
 * travelling across settled dots reads as a thought forming ("Alloy is thinking"). Opacity-only, so
 * it stays low-weight; CSS-driven, so there is no per-frame JS timer. Reduced motion holds the dots
 * at a steady quiet opacity.
 */

/** Number of breathing dots, and the stagger between each dot's breath. */
const THINKING_DOT_COUNT = 3;
export const THINKING_DOT_STAGGER_S = 0.2;

type AlloyThinkingLabelProps = {
    /** Boot shell uses `lg`; Focus Panel cold fill uses `sm`. */
    size?: "lg" | "sm";
    className?: string;
};

/**
 * Quieter than primary UI copy; the reserved ellipsis slot keeps the label from reflowing as the
 * dots breathe (they never change width — only opacity — so there is no jitter by construction).
 */
export function AlloyThinkingLabel({ size = "lg", className = "" }: AlloyThinkingLabelProps) {
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
            {/* Reserve a fixed slot so the label never shifts as the dots breathe. */}
            <span
                className="ml-[0.2em] inline-flex w-[1.35em] items-center gap-[0.22em] align-baseline"
                data-alloy-thinking-ellipsis="true"
                aria-hidden="true"
            >
                {Array.from({ length: THINKING_DOT_COUNT }, (_, i) => (
                    <span
                        key={`thinking-dot-${i}`}
                        className="motion-thinking-dot inline-block h-[0.3em] w-[0.3em] shrink-0 rounded-full bg-current"
                        style={{ animationDelay: `${i * THINKING_DOT_STAGGER_S}s` }}
                    />
                ))}
            </span>
        </p>
    );
}
