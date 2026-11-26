/**
 * CERTIFICATION FIXTURE SAFETY — the refusal, and the absence.
 *
 * A Communications certification fixture is safe when the set of addresses it CAN reach excludes
 * every real person by construction. "Be careful" is not a property; a guard that fails closed is.
 *
 * The fixture this replaces, `createCommunicationsNeedsReplyQaFixture.ts`, had no such guard: it
 * picked a thread with `order by last_message_at desc limit 10` and wrote `attention_state` onto it
 * with a service-role client. On the certification tenant that selection was a real personal
 * mailbox, a real mobile number, and two real external senders. It was deleted during the
 * zero-debt hardening pass, and the last test here is what stops it — or anything shaped like it —
 * coming back unnoticed.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SAFE_SENDER_SUFFIXES, assertSafeSender, isSafeSender } from "../../scripts/lib/certificationSenderSafety.mjs";

const WEB_ROOT = path.join(__dirname, "..", "..");
const SAFE_FIXTURE = path.join(WEB_ROOT, "scripts", "h2WorkItemsCommunicationsCertFixture.mjs");
const DELETED_FIXTURE = path.join(WEB_ROOT, "scripts", "createCommunicationsNeedsReplyQaFixture.ts");

describe("certification sender guard — refuses anything that could be a real person", () => {
    it("accepts only reserved, undeliverable certification domains", () => {
        expect(assertSafeSender("guardian-a@enrollment-cert.alloy.invalid")).toBe(
            "guardian-a@enrollment-cert.alloy.invalid",
        );
        expect(assertSafeSender("QA+Guardian7@Example.com")).toBe("qa+guardian7@example.com");
        expect(isSafeSender("someone@test.invalid")).toBe(true);
        expect(isSafeSender("someone@fixtures.example")).toBe(true);
    });

    /*
     * These four are not arbitrary: they are the exact addresses the deleted fixture would have
     * selected on the certification tenant. If the guard ever admits one of them again, the failure
     * names a real mailbox rather than an abstraction.
     */
    it.each([
        "kelly.kurzman@gmail.com",
        "noreply@nohotwater.net",
        "forwarding-noreply@google.com",
        "+15412408863@sms.local",
    ])("refuses real correspondence: %s", (address) => {
        expect(() => assertSafeSender(address)).toThrow(/REFUSING to use sender/i);
        expect(isSafeSender(address)).toBe(false);
    });

    it("fails closed on an unresolved sender rather than defaulting to one", () => {
        for (const empty of ["", "   ", null, undefined]) {
            expect(() => assertSafeSender(empty as unknown as string)).toThrow(/no sender address resolved/i);
        }
    });

    /*
     * A near-miss must not pass. `alloy.invalid.com` is registrable and would be a real host; only a
     * genuine suffix match may be accepted, never a substring.
     */
    it("refuses look-alike domains that merely contain a reserved token", () => {
        for (const near of ["someone@alloy.invalid.com", "invalid@realdomain.com", "x@example.com.attacker.net"]) {
            expect(isSafeSender(near)).toBe(false);
        }
    });

    it("publishes a frozen suffix list, so the reachable set cannot be widened at runtime", () => {
        expect(Object.isFrozen(SAFE_SENDER_SUFFIXES)).toBe(true);
        expect([...SAFE_SENDER_SUFFIXES]).toEqual([".alloy.invalid", ".invalid", ".example", "@example.com"]);
    });
});

describe("the unsafe fixture is gone, and the safe one does not regrow its capabilities", () => {
    it("createCommunicationsNeedsReplyQaFixture.ts no longer exists", () => {
        expect(existsSync(DELETED_FIXTURE)).toBe(false);
    });

    it("the surviving fixture holds no service-role key and writes no attention_state", () => {
        const src = readFileSync(SAFE_FIXTURE, "utf8");
        const code = src.slice(src.indexOf("import "));
        expect(code).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
        expect(code).not.toMatch(/createClient\(/);
        // It may READ attention state for evidence; it must never assign one.
        expect(code).not.toMatch(/attention_state\s*:/);
        expect(code).not.toMatch(/\.from\(["']communication_threads["']\)/);
    });

    it("the surviving fixture creates no operational_tasks and selects no arbitrary thread", () => {
        const code = readFileSync(SAFE_FIXTURE, "utf8");
        expect(code).not.toMatch(/operational_tasks/);
        expect(code).not.toMatch(/order\(["']last_message_at["']/);
        expect(code).not.toMatch(/\.limit\(\s*10\s*\)/);
    });

    it("establishes actionable state through the canonical inbound path, and resolves through triage", () => {
        const code = readFileSync(SAFE_FIXTURE, "utf8");
        expect(code).toMatch(/api\/admin\/debug\/certification\/inbound-email/);
        expect(code).toMatch(/\/triage/);
        expect(code).toMatch(/assertSafeSender/);
    });
});
