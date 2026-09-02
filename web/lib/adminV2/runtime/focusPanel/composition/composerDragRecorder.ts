/**
 * Surface Builder — real pointer recorder.
 *
 * The lane's scripted drags pass and the operator's real drags fail, so the
 * difference between the two IS the defect. This records the raw event stream of
 * whichever gesture is happening — human or automated — in one schema, and ships
 * it somewhere both can be compared.
 *
 * Armed from a control in the builder chrome, so reproducing a failure needs no
 * DevTools and no console call: press the button, do the thing that fails, let
 * go. The trace posts itself.
 */

export type RecordedPointerFrame = {
    at: number;
    type: "down" | "move" | "up" | "cancel";
    pointerId: number;
    pointerType: string;
    buttons: number;
    clientX: number;
    clientY: number;
    movementX: number;
    movementY: number;
    /** Did the browser hand us several moves at once? */
    coalesced: number;
    target: string;
    /** Where the canvas is, this frame — scroll moves it under the pointer. */
    canvasRect: { x: number; y: number; w: number; h: number } | null;
    scroll: { x: number; y: number };
    /** What the drag decided from this exact frame. */
    decision?: Record<string, unknown>;
};

export type DragRecording = {
    label: string;
    startedAt: number;
    card: string | null;
    activator: string | null;
    grab: Record<string, unknown> | null;
    frames: RecordedPointerFrame[];
    /** Layout before the gesture and after the drop, as the canvas reported them. */
    layoutBefore: unknown;
    layoutAfter: unknown;
};

type RecorderWindow = typeof globalThis & {
    __ALLOY_DRAG_RECORDER__?: {
        armed: boolean;
        label: string;
        current: DragRecording | null;
        last: DragRecording | null;
    };
};

function store(): RecorderWindow["__ALLOY_DRAG_RECORDER__"] {
    if (typeof window === "undefined") return undefined;
    const w = window as RecorderWindow;
    w.__ALLOY_DRAG_RECORDER__ ??= { armed: false, label: "drag", current: null, last: null };
    return w.__ALLOY_DRAG_RECORDER__;
}

/** Arm the recorder for the NEXT gesture. Called by the builder's control. */
export function armDragRecorder(label = "operator"): void {
    const s = store();
    if (!s) return;
    s.armed = true;
    s.label = label;
    s.current = null;
}

export function dragRecorderArmed(): boolean {
    return Boolean(store()?.armed);
}

export function beginRecording(args: {
    card: string | null;
    activator: string | null;
    grab: Record<string, unknown> | null;
    layoutBefore: unknown;
}): void {
    const s = store();
    if (!s?.armed) return;
    s.current = {
        label: s.label,
        startedAt: Date.now(),
        card: args.card,
        activator: args.activator,
        grab: args.grab,
        frames: [],
        layoutBefore: args.layoutBefore,
        layoutAfter: null,
    };
}

function describe(target: EventTarget | null): string {
    const el = target as HTMLElement | null;
    if (!el?.tagName) return "none";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : "";
    const card = el.closest?.("[data-fp-composer-cell]")?.getAttribute("data-fp-composer-cell");
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${card ? ` @${card}` : ""}`;
}

export function recordFrame(
    type: RecordedPointerFrame["type"],
    event: PointerEvent,
    decision?: Record<string, unknown>,
): void {
    const s = store();
    if (!s?.current) return;
    const canvas = document.querySelector(".alloy-os-fp-canvas--grid");
    const rect = canvas?.getBoundingClientRect();
    const coalesced =
        typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents().length : 1;
    s.current.frames.push({
        at: Math.round(performance.now()),
        type,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        buttons: event.buttons,
        clientX: Math.round(event.clientX),
        clientY: Math.round(event.clientY),
        movementX: Math.round(event.movementX ?? 0),
        movementY: Math.round(event.movementY ?? 0),
        coalesced,
        target: describe(event.target),
        canvasRect: rect
            ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
            : null,
        scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
        ...(decision ? { decision } : {}),
    });
}

/** Close the recording, keep it on the window, and post it where the lane can read it. */
export function finishRecording(layoutAfter: unknown): void {
    const s = store();
    if (!s?.current) return;
    s.current.layoutAfter = layoutAfter;
    s.last = s.current;
    const payload = s.current;
    s.current = null;
    s.armed = false;
    try {
        void fetch("/api/dev/surface-drag-trace", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
        });
    } catch {
        /* the recording still lives on the window */
    }
}
