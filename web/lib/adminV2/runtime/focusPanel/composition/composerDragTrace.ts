/**
 * Surface composer — interaction trace.
 *
 * Operator QA has now rejected three completions that were argued from static
 * reasoning: each fix was individually right and the authoring experience stayed
 * spotty. The gap is that a drag is a CHAIN — press target, activator, authored
 * span, pointer, rects, candidate cells, chosen destination, ghost, commit, final
 * DOM — and reasoning about any one link cannot show where intent is lost.
 *
 * So the chain records itself. Every step of a live drag appends here, in order,
 * and a failed gesture can be read back afterwards from the real browser instead
 * of guessed at from the card type.
 *
 * Diagnostic only: nothing here influences placement, and the buffer is capped so
 * a long authoring session cannot grow without bound.
 */

export type ComposerDragTraceEntry = {
    /** Milliseconds since page load — ordering, not wall-clock. */
    at: number;
    phase:
        | "map"
        | "pointerdown"
        | "activate"
        | "move"
        | "drop"
        | "settled"
        | "declined";
    card?: string;
    [key: string]: unknown;
};

const LIMIT = 4000;

type TraceWindow = typeof globalThis & {
    __ALLOY_COMPOSER_DRAG_TRACE__?: ComposerDragTraceEntry[];
};

/** Append one step of the current gesture. Never throws. PURE apart from the buffer. */
export function traceComposerDrag(
    phase: ComposerDragTraceEntry["phase"],
    data: Record<string, unknown> = {},
): void {
    if (typeof window === "undefined") return;
    try {
        const w = window as TraceWindow;
        const buffer = (w.__ALLOY_COMPOSER_DRAG_TRACE__ ??= []);
        buffer.push({
            at: Math.round(typeof performance !== "undefined" ? performance.now() : Date.now()),
            phase,
            ...data,
        });
        if (buffer.length > LIMIT) buffer.splice(0, buffer.length - LIMIT);
    } catch {
        /* a diagnostic must never break the interaction it is describing */
    }
}

/** Start a fresh gesture, so one drag reads as one trace. */
export function beginComposerDragTrace(): void {
    if (typeof window === "undefined") return;
    try {
        (window as TraceWindow).__ALLOY_COMPOSER_DRAG_TRACE__ = [];
    } catch {
        /* ignore */
    }
}

/** Describe an element for the trace: what it is, not a reference to it. */
export function describeTraceTarget(el: EventTarget | null): string {
    const node = el as HTMLElement | null;
    if (!node || !node.tagName) return "none";
    const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/)[0] : "";
    const card = node.closest?.("[data-fp-composer-cell]")?.getAttribute("data-fp-composer-cell");
    return `${node.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${card ? ` @${card}` : ""}`;
}
