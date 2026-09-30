/**
 * THE COMMUNICATIONS DOC SAYS WHAT THE CODE SAYS.
 *
 * Two claims here are the expensive ones. First, both provider webhooks are signature-verified — and the
 * verification lives in a HANDLER LIBRARY, not the route file, so a route-level scan reports them as
 * ungated and is wrong. Second, a message cannot exist without a thread. If either silently stops being
 * true, a benchmark consumer starts trusting an unauthenticated callback or inventing orphan messages.
 *
 * The doc also listed inbound email as out-of-scope/next-sprint while 32 inbound rows existed. That kind
 * of claim is why this file checks prose against implementation rather than trusting either alone.
 *
 * Filesystem-only so it runs in CI with no database.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const WEB = join(ROOT, "web");
const DOC = join(ROOT, "docs/platform/modules/communications-platform.md");

const doc = readFileSync(DOC, "utf8");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[] = [];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const e of entries) {
        if (e === "node_modules" || e.startsWith(".")) continue;
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(full)) out.push(full);
    }
    return out;
}

describe("Communications certification claims are bound to the implementation", () => {
    it("is not vacuous: the doc and both webhook entry points exist", () => {
        expect(doc).toContain("## Certification record");
        expect(read("app/api/webhooks/resend/route.ts").length).toBeGreaterThan(200);
        expect(read("app/api/webhooks/twilio/sms-status/route.ts").length).toBeGreaterThan(100);
    });

    it("the Resend webhook verifies a Svix signature against a configured secret", () => {
        const src = read("app/api/webhooks/resend/route.ts");
        expect(src).toMatch(/from\s+"svix"/);
        expect(src).toMatch(/RESEND_WEBHOOK_SECRET/);
        expect(
            /svix-signature/.test(src) && /\.verify\s*\(/.test(src),
            "the Resend webhook stopped verifying its signature. It writes delivery state and inbound "
                + "messages, so without verification anyone who knows the URL can author communication truth.",
        ).toBe(true);
    });

    it("the Twilio callback verifies its signature in the handler library, not the route", () => {
        // The route is a thin delegate on purpose; asserting on the route file alone would pass a gutted
        // library. This checks the place the authority actually lives.
        const lib = read("lib/communications/twilioSmsStatusWebhook.ts");
        expect(lib.toLowerCase()).toContain("x-twilio-signature");
        expect(
            /TWILIO_AUTH_TOKEN/.test(lib),
            "the Twilio status webhook lost its auth-token verification.",
        ).toBe(true);
    });

    it("a message cannot exist without a thread, and the doc says so", () => {
        const migrations = readdirSync(join(ROOT, "supabase/migrations"))
            .filter((f) => f.endsWith(".sql"))
            .map((f) => readFileSync(join(ROOT, "supabase/migrations", f), "utf8"))
            .join("\n");
        // The FK is the invariant; NOT NULL is what makes it mandatory rather than optional.
        expect(migrations).toMatch(/communication_messages[\s\S]{0,4000}?thread_id/);
        expect(doc).toMatch(/NOT NULL/);
        expect(doc).toMatch(/cannot exist without a thread/i);
    });

    it("inbound email is no longer described as out of scope", () => {
        /*
         * Assert the POSITIVE claim, not the absence of a phrase. The correction necessarily QUOTES the
         * old scope list in order to say what changed, so a proximity check on the words "out of scope"
         * and "inbound email" matches the fix itself — my first version of this test failed on its own
         * correction.
         */
        const ORIGINAL_WRONG_SENTENCE =
            "**Out of scope (next sprint):** attachments, rich editor, Configuration/provider onboarding, "
            + "compliance UX, inbound email, Test Email/SMS, Announcements/Templates expansion.";
        expect(
            doc.includes(ORIGINAL_WRONG_SENTENCE),
            "the original out-of-scope sentence is back. It listed inbound email as next-sprint work while "
                + "32 inbound rows existed and inboundEmailIngestion.ts was writing threads, messages and "
                + "ingress records.",
        ).toBe(false);
        // And the doc must say what inbound email actually is, or the correction is just a deletion.
        const inboundLine = doc
            .split("\n")
            .find((l) => /inbound email/i.test(l) && /IMPLEMENTED/i.test(l));
        expect(
            inboundLine,
            "the doc no longer states that inbound email is implemented.",
        ).toBeTruthy();
        expect(read("lib/communications/email/inboundEmailIngestion.ts")).toMatch(
            /communication_inbound_ingress/,
        );
    });

    it("consent has exactly one writer, and it is not a communications surface", () => {
        const codeOnly = (s: string) =>
            s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
                .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
        const writers: string[] = [];
        for (const root of ["lib", "app"]) {
            for (const file of walk(join(WEB, root))) {
                const code = codeOnly(readFileSync(file, "utf8"));
                if (
                    /from\(\s*["'`]communication_preferences["'`]\s*\)[\s\S]{0,400}?\.(insert|update|upsert|delete)\s*\(/.test(
                        code,
                    )
                ) {
                    writers.push(file.slice(WEB.length + 1));
                }
            }
        }
        expect(
            writers.sort(),
            "the set of consent writers changed. Consent is authored from the POS processing-identity "
                + "command path; a new writer needs classifying, and a communications surface writing it "
                + "would move consent authorship without anyone deciding to.",
        ).toEqual(["lib/pos/processingIdentity/commands/ports.ts"]);
    });
});
