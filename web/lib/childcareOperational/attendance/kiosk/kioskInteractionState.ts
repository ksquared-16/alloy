/**
 * The kiosk's transient state, and the one function that ends it.
 *
 * ── WHY RESET IS A MODULE AND NOT A HANDFUL OF setState CALLS ──
 *
 * A shared device in a lobby leaks by ACCUMULATION: one field left behind on one
 * path, and the next family sees the last family's children. Every path that ends
 * an interaction — success, denial, timeout, Start Over, error, re-entry — has to
 * clear exactly the same things, and "exactly the same" is not a property a
 * scattered set of handlers can hold. So there is one initial state and one
 * `resetInteraction`, and every ending goes through it.
 *
 * The device credential is deliberately NOT part of this. The tablet stays
 * authenticated as the kiosk producer; it is the ADULT who is forgotten. That
 * separation is the whole reason a kiosk can be safe: the device identity is
 * long-lived and the human identity does not outlive the transaction.
 */

export type KioskStep = "idle" | "code" | "operation" | "children" | "working" | "done";

export type KioskChild = {
    child_id: string;
    display_name: string;
    eligible: boolean;
    message: string | null;
};

export type KioskResult = { child_id: string; display_name: string; recorded: boolean; message: string | null };

/** Everything about the human in front of the device. All of it is transient. */
export type KioskInteraction = {
    step: KioskStep;
    /** The typed code. Held only long enough to send it. */
    code: string;
    operation: "check_in" | "check_out" | null;
    children: KioskChild[];
    selected: string[];
    results: KioskResult[];
    notice: string | null;
    /** Retry identity for the confirm, so a double tap converges on one fact. */
    operationToken: string | null;
    /**
     * The instant the adult confirmed, resent with every retry. Part of the retry
     * identity: the server fingerprints the payload, so a moving timestamp turns a
     * replay into a conflict.
     */
    operationEventAt: string | null;
};

export const IDLE_INTERACTION: KioskInteraction = {
    step: "idle",
    code: "",
    operation: null,
    children: [],
    selected: [],
    results: [],
    notice: null,
    operationToken: null,
    operationEventAt: null,
};

/**
 * Return to idle, forgetting the family entirely.
 *
 * Deliberately returns a fresh object built from the constant rather than mutating
 * or spreading the previous one: a spread is how a field survives a reset that
 * everybody believed was total.
 */
export function resetInteraction(): KioskInteraction {
    return { ...IDLE_INTERACTION };
}

/** Milliseconds of inactivity before the device forgets on its own. */
export const KIOSK_IDLE_TIMEOUT_MS = 45_000;
/** How long a success stays on screen before it clears itself. */
export const KIOSK_SUCCESS_TIMEOUT_MS = 6_000;

/**
 * Is any family information currently held?
 *
 * Exported so a test can assert the property directly rather than inspecting
 * fields one at a time and missing the one that was added last.
 */
export function holdsFamilyState(state: KioskInteraction): boolean {
    return (
        state.code !== "" ||
        state.children.length > 0 ||
        state.selected.length > 0 ||
        state.results.length > 0 ||
        state.operation !== null ||
        state.operationToken !== null ||
        state.operationEventAt !== null ||
        state.notice !== null
    );
}
