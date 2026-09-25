/**
 * LATEST RESPONSE WINS.
 *
 * The account list no longer waits for both reads, so subjects and position are in flight
 * independently and either can return out of order. Changing the site filter from A to B — or
 * simply a slow A followed by a fast B — otherwise lets A's households and A's money land on top
 * of B's, and the screen shows one site's figures under another site's name.
 *
 * Extracted from the hook so the rule can be checked directly rather than inferred from a source
 * scan: a superseded request must write NOTHING — not data, not an error, and not the loading flag
 * the newer request is still holding.
 */
export type GenerationGate = {
    /** Starts a request and returns a predicate that is true only while it is still the newest. */
    begin: () => () => boolean;
    /** How many requests have been started. Diagnostic only. */
    started: () => number;
};

export function createGenerationGate(): GenerationGate {
    let generation = 0;
    return {
        begin: () => {
            const mine = ++generation;
            return () => mine === generation;
        },
        started: () => generation,
    };
}
