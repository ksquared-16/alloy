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
    /**
     * Did this press ever become a drag?
     *
     * The recorder used to start inside `startMove`, so a press that activated
     * NOTHING recorded nothing — and "the gesture never began" is exactly the case
     * it was built to tell apart from "the gesture went somewhere wrong". A press
     * on a card is now recorded whether or not it picks the card up.
     */
    activated: boolean;
    activatedAt: number | null;
    grab: Record<string, unknown> | null;
    frames: RecordedPointerFrame[];
    /** Layout before the gesture and after the drop, as the canvas reported them. */
    layoutBefore: unknown;
    layoutAfter: unknown;
    /** The dragged card's rendered rect, sampled after the drop until things settle. */
    settle?: Array<{ at: number; rect: { x: number; y: number; w: number; h: number } | null }>;
};

type RecorderWindow = typeof globalThis & {
    __ALLOY_DRAG_RECORDER__?: {
        armed: boolean;
        label: string;
        current: DragRecording | null;
        last: DragRecording | null;
        count: number;
    };
};

function store(): RecorderWindow["__ALLOY_DRAG_RECORDER__"] {
    if (typeof window === "undefined") return undefined;
    const w = window as RecorderWindow;
    w.__ALLOY_DRAG_RECORDER__ ??= { armed: false, label: "drag", current: null, last: null, count: 0 };
    return w.__ALLOY_DRAG_RECORDER__;
}

/**
 * Arm the recorder. Kept for the explicit control, but recording is AUTOMATIC in
 * development now: asking the operator to press a button before reproducing a
 * failure means the first reproduction is always the one that got away.
 */
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

/** Every gesture records itself where this is on — local development only. */
export function recordingIsAutomatic(): boolean {
    return process.env.NODE_ENV !== "production";
}

export function beginRecording(args: {
    card: string | null;
    activator: string | null;
    grab: Record<string, unknown> | null;
    layoutBefore: unknown;
}): void {
    const s = store();
    if (!s) return;
    // Automatic in dev: a press that never becomes a drag is evidence too, and it
    // is the difference between "did not activate" and "went to the wrong place".
    if (!s.armed && !recordingIsAutomatic()) return;
    if (!s.armed) s.label = "auto";
    // One recording per gesture: a press starts it, activation only annotates it.
    if (s.current) return;
    s.current = {
        label: s.label,
        startedAt: Date.now(),
        card: args.card,
        activator: args.activator,
        activated: false,
        activatedAt: null,
        grab: args.grab,
        frames: [],
        layoutBefore: args.layoutBefore,
        layoutAfter: null,
    };
}

/** The press became a drag. Called by the drag runtime, not by the press listener. */
export function markActivated(args: { activator: string; grab: Record<string, unknown> }): void {
    const s = store();
    if (!s?.current) return;
    s.current.activated = true;
    s.current.activatedAt = Math.round(performance.now());
    s.current.activator = args.activator;
    s.current.grab = args.grab;
}

/** True while a gesture is being recorded — the press listener owns the lifecycle. */
export function recordingInFlight(): boolean {
    return Boolean(store()?.current);
}

/** How many gestures this page has recorded — shown so a stale tab is obvious. */
export function recordedGestureCount(): number {
    const s = store();
    return s?.count ?? 0;
}

/** True once the press became a drag; the drag runtime then owns the frames. */
export function recordingActivated(): boolean {
    return Boolean(store()?.current?.activated);
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

/**
 * Close the recording — but not before watching what happens NEXT.
 *
 * "Preview equals commit" has been checked against the authored model, which
 * cannot see a later effect moving the card: a normalization, a reconciliation,
 * a ResizeObserver pass. So the dragged card's rendered rectangle is sampled for
 * half a second after the drop, and the real invariant is
 *
 *     preview == immediate commit == final rendered position
 *
 * If the card lands correctly and is moved afterwards, this is where it shows.
 */
export function finishRecording(layoutAfter: unknown): void {
    const s = store();
    if (!s?.current) return;
    s.current.layoutAfter = layoutAfter;
    const recording = s.current;
    const card = recording.card;
    const rectOf = () => {
        if (!card) return null;
        const el = document.querySelector(`[data-fp-grid-area="${card}"]`);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const canvas = document.querySelector(".alloy-os-fp-canvas--grid")?.getBoundingClientRect();
        return {
            x: Math.round(b.x - (canvas?.x ?? 0)),
            y: Math.round(b.y - (canvas?.y ?? 0)),
            w: Math.round(b.width),
            h: Math.round(b.height),
        };
    };
    recording.settle = [{ at: 0, rect: rectOf() }];
    for (const delay of [50, 100, 200, 350, 500]) {
        window.setTimeout(() => {
            recording.settle?.push({ at: delay, rect: rectOf() });
            if (delay === 500) post(recording);
        }, delay);
    }
    s.last = recording;
    s.count = (s.count ?? 0) + 1;
    s.current = null;
    s.armed = false;
}

function post(payload: DragRecording): void {
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
