import { describe, expect, it } from "vitest";

import { containsSecret, redactSecrets, redactSecretsDeep } from "@/lib/security/redactSecrets";

/**
 * These fixtures are SHAPED like the real leak but contain no real credential:
 * the JWT segments are `ey` + filler, not a decodable token.
 */
const FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlLXN1YmplY3QifQ.ZmFrZS1zaWduYXR1cmUtdmFsdWU";
const FAKE_SESSION = `base64-${FAKE_JWT.replace(/\./g, "")}`;

describe("redactSecrets", () => {
    it("redacts a Supabase auth cookie value but keeps the cookie name", () => {
        const line = `  - cookie: sb-abcdefghijk-auth-token=${FAKE_SESSION}`;
        const out = redactSecrets(line);
        expect(out).not.toContain(FAKE_SESSION);
        // Diagnostics stay useful — you can still see WHICH header leaked.
        expect(out.toLowerCase()).toContain("cookie");
        expect(containsSecret(out)).toBe(false);
    });

    it("redacts a bare JWT anywhere in the text", () => {
        const out = redactSecrets(`token was ${FAKE_JWT} and then failed`);
        expect(out).toContain("[REDACTED jwt]");
        expect(out).toContain("and then failed");
        expect(out).not.toContain(FAKE_JWT);
    });

    it("redacts an Authorization header value but keeps the scheme", () => {
        const out = redactSecrets(`  - authorization: Bearer ${FAKE_JWT}`);
        expect(out).not.toContain(FAKE_JWT);
        expect(out).toContain("Bearer");
    });

    it("redacts service-role and anon keys", () => {
        const out = redactSecrets(`SERVICE_ROLE_KEY=${FAKE_JWT}\nANON_KEY=${FAKE_JWT}`);
        expect(out).not.toContain(FAKE_JWT);
        expect(out).toContain("SERVICE_ROLE_KEY=");
        expect(out).toContain("ANON_KEY=");
    });

    it("redacts access_token / refresh_token in JSON-ish text", () => {
        const out = redactSecrets('{"access_token":"abc123def","refresh_token":"u6jjrr4gaaj4"}');
        expect(out).not.toContain("abc123def");
        expect(out).not.toContain("u6jjrr4gaaj4");
        expect(out).toContain("access_token");
    });

    it("PRESERVES ordinary diagnostic content", () => {
        const log = [
            "Error: apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:3016",
            "  - → GET http://127.0.0.1:3016/api/admin/global-search?q=smith&limit=20",
            "    at tests/search-v2-discovery.spec.ts:17:35",
        ].join("\n");
        expect(redactSecrets(log)).toBe(log);
    });

    it("leaves a string with nothing to redact untouched", () => {
        expect(redactSecrets("nothing to see here")).toBe("nothing to see here");
        expect(redactSecrets("")).toBe("");
    });

    it("does not mistake a normal cookie for auth material", () => {
        const out = redactSecrets("theme=dark; locale=en-US");
        expect(out).toContain("theme=dark");
    });

    it("deep-redacts nested structures", () => {
        const out = redactSecretsDeep({
            url: "/api/admin/global-search",
            headers: { cookie: `sb-xyz-auth-token=${FAKE_SESSION}` },
            list: [`bearer ${FAKE_JWT}`],
        });
        expect(JSON.stringify(out)).not.toContain(FAKE_SESSION);
        expect(JSON.stringify(out)).not.toContain(FAKE_JWT);
        expect(out.url).toBe("/api/admin/global-search");
    });

    it("containsSecret detects the exact shape that leaked", () => {
        expect(containsSecret(`cookie: sb-ikaxilmwmrmbagoidedu-auth-token=${FAKE_SESSION}`)).toBe(true);
        expect(containsSecret("GET /api/admin/global-search?q=smith")).toBe(false);
    });
});
