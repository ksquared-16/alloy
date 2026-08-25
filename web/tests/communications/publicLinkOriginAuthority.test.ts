/**
 * The public-link origin authority, and the outbound seam that enforces it.
 *
 * These tests exist because of a live defect: an operator on hosted staging sent a Tour
 * invitation whose booking link pointed at `localhost`. The hosted runtimes were
 * configured correctly the whole time — the link had been MINTED by a different runtime
 * (a managed agent slot at `http://localhost:301X`, writing into the same database
 * staging reads) and frozen into the draft as absolute text. So the assertions below are
 * about two separate things:
 *
 *   - the authority answers deterministically per environment, and refuses rather than
 *     guessing when a hosted runtime is misconfigured;
 *   - the outbound seam gets the FINAL word on a body it did not author.
 */

import { describe, expect, it } from "vitest";

import {
    classifyPublicRuntime,
    findLoopbackUrls,
    isLoopbackHost,
    rehostLoopbackUrls,
    resolvePublicAppOrigin,
} from "@/lib/publicAppUrl";
import { enforceOutboundPublicLinkOrigin } from "@/lib/communications/outboundPublicLinkOrigin";

const LOCAL_SLOT = { ALLOY_AGENT_ENV: "1", NEXT_PUBLIC_APP_URL: "http://localhost:3013" };
const CERTIFICATION = { NEXT_PUBLIC_APP_URL: "http://localhost:3911" };
const STAGING = { VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "https://staging.workwithalloy.com" };
const PRODUCTION = { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://workwithalloy.com" };

describe("runtime classification", () => {
    it("treats a Vercel preview as HOSTED, not as a half-deployed dev box", () => {
        // The observed defect happened on a preview deployment. Classifying preview as
        // "not really deployed" is exactly how a localhost link reaches a family.
        expect(classifyPublicRuntime(STAGING)).toBe("hosted_preview");
        expect(classifyPublicRuntime(PRODUCTION)).toBe("production");
        expect(classifyPublicRuntime(LOCAL_SLOT)).toBe("local_agent");
        expect(classifyPublicRuntime(CERTIFICATION)).toBe("local");
    });

    it("recognizes loopback by host, not by the literal string localhost", () => {
        for (const h of ["localhost", "LOCALHOST", "app.localhost", "127.0.0.1", "127.0.0.53", "::1", "[::1]", "0.0.0.0"]) {
            expect(isLoopbackHost(h), h).toBe(true);
        }
        for (const h of ["staging.workwithalloy.com", "workwithalloy.com", "127x0x0x1.example.com"]) {
            expect(isLoopbackHost(h), h).toBe(false);
        }
    });
});

describe("environment semantics", () => {
    it("local development resolves to the sanctioned local origin", () => {
        expect(resolvePublicAppOrigin(LOCAL_SLOT)).toEqual({
            ok: true,
            origin: "http://localhost:3013",
            runtime: "local_agent",
        });
    });

    it("certification resolves to the certification-safe origin", () => {
        expect(resolvePublicAppOrigin(CERTIFICATION)).toEqual({
            ok: true,
            origin: "http://localhost:3911",
            runtime: "local",
        });
    });

    it("hosted staging resolves to staging.workwithalloy.com", () => {
        expect(resolvePublicAppOrigin(STAGING)).toEqual({
            ok: true,
            origin: "https://staging.workwithalloy.com",
            runtime: "hosted_preview",
        });
    });

    it("production resolves to the canonical production origin", () => {
        expect(resolvePublicAppOrigin(PRODUCTION)).toEqual({
            ok: true,
            origin: "https://workwithalloy.com",
            runtime: "production",
        });
    });

    it("normalizes to a true origin so a stray path is not duplicated into every link", () => {
        const d = resolvePublicAppOrigin({ ...PRODUCTION, NEXT_PUBLIC_APP_URL: "https://workwithalloy.com/app/" });
        expect(d.ok && d.origin).toBe("https://workwithalloy.com");
    });
});

describe("a hosted runtime fails closed", () => {
    it("refuses a loopback origin", () => {
        const d = resolvePublicAppOrigin({ VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "http://localhost:3013" });
        expect(d.ok).toBe(false);
        expect(!d.ok && d.code).toBe("loopback_in_hosted_runtime");
    });

    it("refuses a missing origin instead of degrading to a relative link", () => {
        const d = resolvePublicAppOrigin({ VERCEL_ENV: "preview" });
        expect(!d.ok && d.code).toBe("missing");
    });

    it("refuses a malformed origin", () => {
        const d = resolvePublicAppOrigin({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "not a url" });
        expect(!d.ok && d.code).toBe("malformed");
    });

    it("refuses an insecure hosted origin", () => {
        const d = resolvePublicAppOrigin({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "http://workwithalloy.com" });
        expect(!d.ok && d.code).toBe("insecure_hosted_origin");
    });

    it("still resolves from VERCEL_PROJECT_PRODUCTION_URL when the public var is unset", () => {
        const d = resolvePublicAppOrigin({
            VERCEL_ENV: "production",
            VERCEL_PROJECT_PRODUCTION_URL: "workwithalloy.com",
        });
        expect(d.ok && d.origin).toBe("https://workwithalloy.com");
    });
});

describe("re-anchoring", () => {
    it("preserves path, query and fragment", () => {
        expect(
            rehostLoopbackUrls(
                "Pick a time: http://localhost:3013/a/AbCdEf12?option=x#top",
                "https://staging.workwithalloy.com",
            ),
        ).toBe("Pick a time: https://staging.workwithalloy.com/a/AbCdEf12?option=x#top");
    });

    it("leaves a genuine third-party URL alone", () => {
        // Re-hosting someone else's domain onto ours would be a worse defect than the one
        // being fixed, so only LOOPBACK origins are rewritten.
        const text = "Map: https://maps.google.com/?q=1 and link http://127.0.0.1:3014/tour-booking/tok";
        expect(rehostLoopbackUrls(text, "https://workwithalloy.com")).toBe(
            "Map: https://maps.google.com/?q=1 and link https://workwithalloy.com/tour-booking/tok",
        );
    });

    it("finds every loopback URL in a body", () => {
        expect(findLoopbackUrls("a http://localhost:3013/a/x b http://127.0.0.1:1/y c https://ok.com/z")).toEqual([
            "http://localhost:3013/a/x",
            "http://127.0.0.1:1/y",
        ]);
    });
});

describe("the outbound seam gets the final word", () => {
    const SLOT_AUTHORED_BODY = "Hi Dana, choose a tour time: http://localhost:3013/a/AbCdEf12";
    const SLOT_AUTHORED_SNAPSHOT = {
        html: '<p>Choose a time: <a href="http://localhost:3013/a/AbCdEf12">Choose a time</a></p>',
        text: SLOT_AUTHORED_BODY,
    };

    it("repairs a body authored by a DIFFERENT runtime — this is the observed defect", () => {
        const r = enforceOutboundPublicLinkOrigin({
            body: SLOT_AUTHORED_BODY,
            subject: "Your tour at http://localhost:3013",
            renderedSnapshot: SLOT_AUTHORED_SNAPSHOT,
            env: STAGING,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.body).toBe("Hi Dana, choose a tour time: https://staging.workwithalloy.com/a/AbCdEf12");
        expect(r.subject).toBe("Your tour at https://staging.workwithalloy.com/");
        expect(r.rehostedCount).toBe(4); // body + subject + snapshot html + snapshot text
        expect(r.origin).toBe("https://staging.workwithalloy.com");
    });

    it("repairs the RENDERED SNAPSHOT too, because that is what the email is built from", () => {
        // `deliverQueuedEmailHtml` sends `rendered_snapshot.html`, never `body`. Fixing
        // only `body` would repair the record and still deliver the broken link.
        const r = enforceOutboundPublicLinkOrigin({
            body: SLOT_AUTHORED_BODY,
            renderedSnapshot: SLOT_AUTHORED_SNAPSHOT,
            env: STAGING,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const snap = r.renderedSnapshot as { html: string; text: string };
        expect(snap.html).toBe(
            '<p>Choose a time: <a href="https://staging.workwithalloy.com/a/AbCdEf12">Choose a time</a></p>',
        );
        expect(snap.text).not.toMatch(/localhost/);
        expect(findLoopbackUrls(snap.html)).toEqual([]);
    });

    it("no loopback link can escape a hosted runtime", () => {
        const r = enforceOutboundPublicLinkOrigin({
            body: SLOT_AUTHORED_BODY,
            renderedSnapshot: SLOT_AUTHORED_SNAPSHOT,
            env: PRODUCTION,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const surfaces = [r.body, JSON.stringify(r.renderedSnapshot)];
        for (const s of surfaces) expect(findLoopbackUrls(s)).toEqual([]);
    });

    it("refuses BEFORE send when the hosted origin is missing", () => {
        const r = enforceOutboundPublicLinkOrigin({
            body: SLOT_AUTHORED_BODY,
            env: { VERCEL_ENV: "preview" },
        });
        expect(r.ok).toBe(false);
        expect(!r.ok && r.code).toBe("missing");
    });

    it("refuses when the hosted origin is itself loopback, rather than rewriting nothing", () => {
        const r = enforceOutboundPublicLinkOrigin({
            body: SLOT_AUTHORED_BODY,
            env: { VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "http://localhost:3013" },
        });
        expect(!r.ok && r.code).toBe("loopback_in_hosted_runtime");
    });

    it("refuses a linkless message too, because the configuration is broken either way", () => {
        // Discovering the misconfiguration on the first message that HAPPENS to carry a
        // link is too late; the environment is wrong now.
        const r = enforceOutboundPublicLinkOrigin({ body: "No links here.", env: { VERCEL_ENV: "preview" } });
        expect(!r.ok && r.code).toBe("missing");
    });

    it("leaves local development alone — localhost is the CORRECT link there", () => {
        const r = enforceOutboundPublicLinkOrigin({
            body: SLOT_AUTHORED_BODY,
            renderedSnapshot: SLOT_AUTHORED_SNAPSHOT,
            env: LOCAL_SLOT,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.body).toBe(SLOT_AUTHORED_BODY);
        expect(r.rehostedCount).toBe(0);
        expect(r.origin).toBeNull();
    });

    it("leaves certification alone", () => {
        const body = "Choose a time: http://localhost:3911/a/AbCdEf12";
        const r = enforceOutboundPublicLinkOrigin({ body, env: CERTIFICATION });
        expect(r.ok && r.body).toBe(body);
    });

    it("is idempotent — a retry cannot move an already-authorized destination", () => {
        const once = enforceOutboundPublicLinkOrigin({ body: SLOT_AUTHORED_BODY, env: STAGING });
        expect(once.ok).toBe(true);
        if (!once.ok) return;
        const twice = enforceOutboundPublicLinkOrigin({ body: once.body, env: STAGING });
        expect(twice.ok).toBe(true);
        if (!twice.ok) return;
        expect(twice.body).toBe(once.body);
        expect(twice.rehostedCount).toBe(0);
    });

    it("takes no request, so a spoofed Host header has nothing to influence", () => {
        // Structural, not behavioural: the seam has no request parameter at all. A header
        // cannot reach a recipient's link because there is no path from one to the other.
        expect(enforceOutboundPublicLinkOrigin.length).toBe(1);
        const keys = Object.keys({ body: "", subject: null, renderedSnapshot: null, env: {} });
        expect(keys).not.toContain("request");
        expect(keys).not.toContain("headers");
    });
});
