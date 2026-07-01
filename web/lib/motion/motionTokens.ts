/**
 * Operational Motion System — the single source of motion for Alloy.
 *
 * Doctrine:      docs/platform/experience/operational-motion-doctrine.md
 * Architecture:  docs/platform/experience/experience-layer-architecture.md (Capability 1, Tier 1)
 *
 * Four durations, four easings, five choreographies. No component writes a raw
 * duration or easing — import these tokens, or apply the `.motion-*` classes
 * defined in `web/app/globals.css`. The CSS custom properties and these constants
 * are the same values, kept in sync (see MOTION_CSS_VARS).
 *
 * The asymmetry is the doctrine: arrivals decelerate (`enter`), departures
 * accelerate (`exit`), on-screen repositions are symmetric (`move`), and only
 * acknowledgement springs. That asymmetry is what makes motion read as physical.
 */

/** The only four interaction speeds in Alloy, in milliseconds. */
export const MOTION_DURATION = {
    /** Direct-manipulation feedback: selection, press, hover commit, focus. A physical response, not an animation. */
    instant: 80,
    /** In-place changes: crossfades, value settles, drawer→drawer body swap, small reveals. */
    micro: 160,
    /** Surface-level transitions: reveal, navigation swap, drawer open/close. The default. */
    standard: 240,
    /** Deliberate, attention-worthy moments only: first reveal of a major surface, celebratory confirm. Sparingly. */
    expressive: 360,
} as const;
export type MotionDurationToken = keyof typeof MOTION_DURATION;

/** Easing curves as CSS timing-function values. */
export const MOTION_EASING = {
    /** Departures accelerate: close, recede, dismiss. */
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    /** Arrivals decelerate: reveal, open, settle. */
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    /** On-screen repositioning is symmetric: reorder, swap, slide. */
    move: "cubic-bezier(0.4, 0, 0.2, 1)",
    /** Acknowledgement only — the one "alive" curve. Gentle overshoot. Never for layout. */
    spring: "cubic-bezier(0.34, 1.4, 0.64, 1)",
} as const;
export type MotionEasingToken = keyof typeof MOTION_EASING;

/** The five named choreographies — every interactional movement is exactly one of these. */
export type MotionChoreography =
    | "reveal" // a surface/region becomes present
    | "navigate" // context changes; the operator does not leave
    | "swap" // one record/content becomes another in place
    | "acknowledge" // the system confirms the operator's action
    | "recede"; // a transient surface departs

export type MotionChoreographySpec = {
    duration: MotionDurationToken;
    easing: MotionEasingToken;
    /** The utility class in globals.css that plays this choreography. */
    className: string;
};

/** Choreography → composition. These bindings ARE the doctrine's motion rules. */
export const MOTION_CHOREOGRAPHY: Record<MotionChoreography, MotionChoreographySpec> = {
    reveal: { duration: "standard", easing: "enter", className: "motion-reveal" },
    navigate: { duration: "standard", easing: "move", className: "motion-navigate" },
    swap: { duration: "micro", easing: "move", className: "motion-swap" },
    acknowledge: { duration: "micro", easing: "spring", className: "motion-acknowledge" },
    recede: { duration: "standard", easing: "exit", className: "motion-recede" },
};

/**
 * The `settle` sub-variant of `reveal`: imperceptible post-reveal refinement.
 * For values that were always going to be there (e.g. a deferred KPI) arriving into
 * already-reserved geometry. Opacity only — no translate, no scale, no flash.
 */
export const MOTION_SETTLE: MotionChoreographySpec = {
    duration: "micro",
    easing: "enter",
    className: "motion-settle",
};

/** Resolve a choreography to its utility class. */
export function motionChoreography(name: MotionChoreography): string {
    return MOTION_CHOREOGRAPHY[name].className;
}

/** Numeric duration in ms for a token (e.g. for `setTimeout` coordinating an exit window). */
export function motionDurationMs(token: MotionDurationToken): number {
    return MOTION_DURATION[token];
}

/**
 * Compose a CSS `transition` shorthand from tokens, for the rare case a class
 * cannot be used (prefer the `.motion-*` classes). Never inline a raw duration.
 */
export function motionTransition(
    property: string,
    duration: MotionDurationToken,
    easing: MotionEasingToken,
): string {
    return `${property} ${MOTION_DURATION[duration]}ms ${MOTION_EASING[easing]}`;
}

/** CSS custom-property names mirroring the `:root` block in globals.css (for runtime reads). */
export const MOTION_CSS_VARS = {
    instant: "--motion-instant",
    micro: "--motion-micro",
    standard: "--motion-standard",
    expressive: "--motion-expressive",
    easeExit: "--motion-ease-exit",
    easeEnter: "--motion-ease-enter",
    easeMove: "--motion-ease-move",
    easeSpring: "--motion-ease-spring",
} as const;
