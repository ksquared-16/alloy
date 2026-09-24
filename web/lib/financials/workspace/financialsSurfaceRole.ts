/**
 * IS THIS FINANCIALS LAYER A COMMAND, OR THE HOST'S RESTING SURFACE?
 *
 * ── THE DEFECT THIS EXISTS TO END ──
 *
 * The Accounts workspace presents a COMMAND as a focused layer: a fixed, centred shell over a
 * full-viewport scrim, with the account list inert beneath it. It decided which layers those were
 * by asking whether any `data-financials-overlay` was in the tree — correct while Details was
 * something the operator pushed on top of the account.
 *
 * Convergence made Details the FLOOR of that host, and the question silently inverted. The floor is
 * always present, so the scrim was always up. Measured on deployed staging: twelve account rows
 * under a full-viewport backdrop, every ordinary click refused, the selected account unchanged
 * after clicking another family, and the ledger floating over the list belonging to a household
 * whose row had scrolled out of view. Two operator paths into the account experience, both dead.
 *
 * The rule lives here, once, because two places asking it in different words is how it broke: the
 * card knew about the floor and the stylesheet did not.
 */

/** What a rendered Financials surface IS, for hosts that treat the two differently. */
export type FinancialsSurfaceRole = "floor" | "command";

/**
 * The resting surface of a host is its FLOOR — the thing the operator returns to, not a layer over
 * it. Only the workspace declares one (`detailsAreTheSurface`), and only while nothing is pushed
 * above it: open Add Charge over the account and THAT is a command, floor or no floor.
 *
 * The Focus Panel declares no floor, so Details there is an ordinary pushed layer and answers
 * `"command"` — which is what it has always been treated as.
 */
export function financialsSurfaceRole(args: {
    /** Whether this host seeds its stack with Details rather than pushing it. */
    detailsAreTheSurface: boolean;
    /** How many surfaces are on the stack, the floor included. */
    stackDepth: number;
}): FinancialsSurfaceRole {
    return args.detailsAreTheSurface && args.stackDepth <= 1 ? "floor" : "command";
}
