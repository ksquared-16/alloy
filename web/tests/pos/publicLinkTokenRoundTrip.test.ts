import { describe, it, expect } from "vitest";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { generateSecureFormLinkPlaintext, buildPublicFormEmbedPath } from "@/lib/admin/forms/formPublicLinkToken";

/**
 * P0 regression lock for the packet/public-link token contract.
 *
 * "Invalid or unknown link" means the resolver hashed the URL token and found no row. This
 * suite proves the generate → store-hash → embed-URL → route-param → resolve-hash chain is
 * loss-less and the token is URL-safe, so a link minted and opened in the SAME environment
 * always resolves. (If a link is opened against a different DB/env, or a token_prefix/partial
 * token is opened, the row genuinely won't exist — that is operational, not this contract.)
 */

/** Mirrors how the token travels: embed path → route segment → Next decode → client encode → API decode. */
function tokenThroughUrl(plaintext: string): string {
    const path = buildPublicFormEmbedPath(plaintext); // /forms/embed/<encodeURIComponent(token)>
    const seg = path.slice("/forms/embed/".length); // dynamic route segment
    const nextParam = decodeURIComponent(seg); // Next decodes route params
    const clientEnc = encodeURIComponent(nextParam); // FormEmbedClient encToken
    return decodeURIComponent(clientEnc); // resolve route plaintextToken()
}

describe("public link token contract", () => {
    it("generates URL-safe base64url tokens (no chars that re-encode)", () => {
        for (let i = 0; i < 200; i++) {
            const t = generateSecureFormLinkPlaintext();
            expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
            expect(t.length).toBeGreaterThanOrEqual(40);
        }
    });

    it("hash is deterministic SHA-256 hex (64 chars)", () => {
        const t = generateSecureFormLinkPlaintext();
        const h1 = hashFormLinkToken(t);
        const h2 = hashFormLinkToken(t);
        expect(h1).toBe(h2);
        expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("survives the full embed-URL round-trip and the resolve hash matches the stored hash", () => {
        for (let i = 0; i < 1000; i++) {
            const plaintext = generateSecureFormLinkPlaintext();
            const storedHash = hashFormLinkToken(plaintext); // what mint persists
            const tokenAtResolve = tokenThroughUrl(plaintext); // what resolve receives
            expect(tokenAtResolve).toBe(plaintext);
            expect(hashFormLinkToken(tokenAtResolve.trim())).toBe(storedHash);
        }
    });

    it("a token_prefix (first 12 chars) does NOT match the full token hash", () => {
        const plaintext = generateSecureFormLinkPlaintext();
        const prefix = plaintext.slice(0, 12);
        expect(hashFormLinkToken(prefix)).not.toBe(hashFormLinkToken(plaintext));
    });
});
