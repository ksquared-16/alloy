/**
 * W-40 / `T-14` residual — what defends this path, stated, because the code implies otherwise.
 *
 * `01…§14` recorded that `timingSafeEqualHex` is *"defined and used nowhere on this path"*, and
 * that therefore *"a reader may conclude a constant-time compare is in force when the actual
 * defence is the lookup shape."* That is still true, and the honest resolution is to say so here
 * rather than to wire a call that would not add anything.
 *
 * **The actual defence is the lookup shape.** No comparison happens in this process at all. The
 * caller's plaintext token is hashed and the hash is used as a PostgREST equality selector —
 * `resolvePublicFormLink:35` and `resolveTourPublicBookingLink:39` both `.eq("token_hash", …)`.
 * The comparison is Postgres's, on an indexed column, against a 256-bit digest. An attacker
 * learns "some row matched" or "none did"; there is no per-byte early exit to time, because
 * there is no per-byte compare in the application.
 *
 * **`timingSafeEqualHex` is kept, not deleted, and this is the reason.** It is the correct
 * primitive the moment any caller compares two digests IN PROCESS — a token re-check after a row
 * is loaded, an HMAC digest, a signature. Deleting it would mean the next such caller reaches for
 * `===`, which is the failure this function exists to prevent. It is exported and unused ON
 * PURPOSE; that is a declared position, not residue.
 *
 * It is also a recognised sender-authentication terminal in
 * `scripts/checkUnauthenticatedSideEffects.mjs` (`RL-30`). Calling it decoratively would therefore
 * satisfy a security check without authenticating anyone — so call it only where two secrets are
 * genuinely being compared.
 */

import { createHash, timingSafeEqual } from "crypto";

/** SHA-256 hex digest of UTF-8 token (matches stored `form_public_links.token_hash`). */
export function hashFormLinkToken(plaintext: string): string {
    return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/**
 * Constant-time compare of two hex strings of equal length (64 for SHA-256).
 *
 * Deliberately has no caller today — see the module header. Use it for any IN-PROCESS comparison
 * of two secrets or digests; the token-resolution paths do not compare in process at all.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
    try {
        const ba = Buffer.from(a, "hex");
        const bb = Buffer.from(b, "hex");
        if (ba.length !== bb.length) return false;
        return timingSafeEqual(ba, bb);
    } catch {
        return false;
    }
}
