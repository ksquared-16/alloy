import { createHash, timingSafeEqual } from "crypto";

/** SHA-256 hex digest of UTF-8 token (matches stored `form_public_links.token_hash`). */
export function hashFormLinkToken(plaintext: string): string {
    return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** Constant-time compare of two hex strings of equal length (64 for SHA-256). */
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
