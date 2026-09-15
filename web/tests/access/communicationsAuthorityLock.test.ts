/**
 * RL-11 — THE COMMUNICATIONS SURFACE NAMES ITS AUTHORITY.
 *
 * Communications had two capability keys and five materially different powers. The census that
 * opened this work found the gap between those numbers filled by `requireAdminOrOps()`, a function
 * whose name promises a role check and whose body resolves portal admission and nothing else. A
 * principal holding only `portal.access` reached provider configuration, template authoring,
 * announcement creation and channel bindings.
 *
 * That is closed handler by handler. What this file exists for is the NEXT handler — the one added
 * six months from now by someone who copies the file next to it. A migration cannot hold this: it
 * runs once, and the tree keeps growing. Only a repo lock holds an invariant against new code.
 *
 * So: every request handler on the Communications surface either names one of the five capabilities,
 * or appears below by path with a classification AND the evidence for it. The exception list is
 * shrink-only, and the lock refuses to pass if it stops finding anything to check.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(__dirname, "..", "..");

/** Every tree that serves a Communications HTTP surface. */
const SURFACE_ROOTS = [
    "app/api/admin/communications",
    "app/api/admin/communication-scheduled-sends",
    "app/api/admin/inbox",
    "app/api/communications",
    "app/api/webhooks/resend",
    "app/api/webhooks/twilio",
];

const CAPABILITY_SYMBOLS = [
    "COMMUNICATIONS_READ",
    "COMMUNICATIONS_SEND",
    "COMMUNICATIONS_TEMPLATES_MANAGE",
    "COMMUNICATIONS_PROVIDER_CONFIGURE",
    "COMMUNICATIONS_BULK_SEND",
] as const;
type CapabilitySymbol = (typeof CAPABILITY_SYMBOLS)[number];

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

/**
 * THE EXCEPTIONS, EACH WITH THE EVIDENCE FOR ITSELF.
 *
 * A classification alone would be a label — "internal", "reviewed" — and labels are exactly how an
 * ungoverned route survives review. Each entry therefore carries `evidence`: a marker that must be
 * present in the file for the exemption to hold. Delete the signature verification from a webhook
 * and its exemption stops applying, so the lock fails rather than continuing to excuse it.
 *
 * SHRINK-ONLY. `ALLOWED_EXEMPT_COUNT` below is asserted exactly, so adding an entry fails until the
 * number is lowered deliberately — which is a decision someone has to make in the open.
 */
const EXEMPT: Record<string, { classification: string; evidence: RegExp[] }> = {
    /*
     * Assignment is not a Communications authority. It decides who owns a piece of work, and the
     * same unresolved question governs work items, cases and jobs — see
     * docs/platform/governance/assignments-authority-model-debt.md. What bounds it meanwhile is
     * that it is dark, and that it can neither send nor alter a message.
     */
    "app/api/admin/communications/conversations/[id]/assign/route.ts": {
        classification: "BLOCKED_DECISION — ASSIGNMENTS_AUTHORITY_MODEL_DEBT",
        evidence: [/ASSIGNMENTS_AUTHORITY_MODEL_DEBT/, /isCommsV2FlagEnabled\("comms_v2_assignment"\)/],
    },
    /*
     * The four token bearers. These have no session to resolve a capability from — the caller is
     * Twilio, Resend, or a family clicking a link in an email — so their authority is cryptographic
     * rather than granted. The evidence is the verification itself.
     */
    "app/api/communications/unsubscribe/route.ts": {
        classification: "TOKEN_BEARER — signed unsubscribe token, scope-limited",
        evidence: [/verifyUnsubscribeToken|applyUnsubscribeToken/],
    },
    "app/api/webhooks/resend/route.ts": {
        classification: "TOKEN_BEARER — Svix signature over RESEND_WEBHOOK_SECRET",
        evidence: [/new Webhook\(secret\)\.verify\(/],
    },
    /*
     * Both Twilio routes are two lines that delegate, so the verification is not IN them. Matching
     * the word "signature" in a doc comment would have passed while proving nothing — which is what
     * the first draft of this lock did. The evidence is therefore the delegation itself, and the
     * handler it delegates to is checked separately below.
     */
    "app/api/webhooks/twilio/sms-status/route.ts": {
        classification: "TOKEN_BEARER — Twilio signature, global auth token",
        evidence: [/handleTwilioSmsStatus\(request, \{ bindingId: null \}\)/],
    },
    "app/api/webhooks/twilio/sms-status/[binding_id]/route.ts": {
        classification: "TOKEN_BEARER — Twilio signature, per-binding auth token",
        evidence: [/handleTwilioSmsStatus\(request, \{ bindingId: binding_id \}\)/],
    },
};

/** Asserted exactly, so the exception list cannot grow without a deliberate edit here. */
const ALLOWED_EXEMPT_COUNT = 5;

/**
 * NON-VACUITY FLOOR. A classifier that silently stops matching passes every assertion below it
 * while checking nothing — the failure mode that makes a green lock worse than no lock. The real
 * surface carries 49 admin handlers plus 6 token-bearer ones; this floor is set below that so
 * ordinary deletion does not trip it, and far above zero so a broken parser does.
 */
const MINIMUM_HANDLERS = 45;

type Handler = { file: string; method: string; body: string };

function routeFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        const abs = path.join(WEB, dir);
        if (!fs.existsSync(abs)) return;
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            const rel = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(rel);
            else if (entry.name === "route.ts") out.push(rel);
        }
    };
    for (const root of SURFACE_ROOTS) walk(root);
    return out.sort();
}

/**
 * Split a route file into its handlers.
 *
 * Handler-grained, not file-grained, because the two are genuinely different authorities in the
 * same file more than once here: `preferences/route.ts` reads under `communications.read` and
 * writes under `communications.send`, and `ingress-routes/route.ts` reads under
 * `communications.read` and configures under `communications.provider.configure`. A file-grained
 * check would call both files gated while one of the two handlers was wrong.
 */
function handlers(): Handler[] {
    const found: Handler[] = [];
    for (const file of routeFiles()) {
        const source = fs.readFileSync(path.join(WEB, file), "utf8");
        const marks: { at: number; method: string }[] = [];
        const re = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(source))) marks.push({ at: m.index, method: m[1] });
        for (let i = 0; i < marks.length; i += 1) {
            const end = i + 1 < marks.length ? marks[i + 1].at : source.length;
            found.push({ file, method: marks[i].method, body: source.slice(marks[i].at, end) });
        }
    }
    return found;
}

function capabilitiesIn(body: string): CapabilitySymbol[] {
    return CAPABILITY_SYMBOLS.filter((sym) =>
        new RegExp(`requireCommunicationsAuthority\\(\\s*${sym}\\s*\\)`).test(body)
    );
}

describe("RL-11 — the Communications surface names its authority", () => {
    const all = handlers();

    it("finds the surface it claims to be checking", () => {
        // The assertion that makes every other assertion in this file mean something.
        expect(routeFiles().length).toBeGreaterThan(0);
        expect(all.length).toBeGreaterThanOrEqual(MINIMUM_HANDLERS);
        expect(METHODS.some((mm) => all.some((h) => h.method === mm))).toBe(true);
    });

    it("gates every handler that is not a declared exception", () => {
        const ungated = all
            .filter((h) => !(h.file in EXEMPT))
            .filter((h) => capabilitiesIn(h.body).length === 0)
            .map((h) => `${h.file} ${h.method}`);
        expect(ungated, "each of these must name a Communications capability, or be classified in EXEMPT").toEqual([]);
    });

    it("gives each gated handler exactly one capability", () => {
        // Two capabilities in one handler is an ambiguity, not a belt-and-braces.
        const ambiguous = all
            .filter((h) => !(h.file in EXEMPT))
            .filter((h) => capabilitiesIn(h.body).length > 1)
            .map((h) => `${h.file} ${h.method} -> ${capabilitiesIn(h.body).join(", ")}`);
        expect(ambiguous).toEqual([]);
    });

    it("uses all five capabilities, so none is seeded but dormant", () => {
        /*
         * A key that exists in `permission_definitions`, appears in the role editor and gates
         * nothing is worse than no key: it tells an administrator they have withheld an authority
         * they have not withheld. `communications.read` was exactly that before this lock.
         */
        const used = new Set(all.flatMap((h) => capabilitiesIn(h.body)));
        for (const sym of CAPABILITY_SYMBOLS) {
            expect(Array.from(used), `${sym} gates no handler — a dormant key`).toContain(sym);
        }
    });

    it("keeps the exception list shrink-only, and each exception carries its evidence", () => {
        expect(Object.keys(EXEMPT).length, "lower this deliberately; never raise it").toBe(ALLOWED_EXEMPT_COUNT);
        for (const [file, { classification, evidence }] of Object.entries(EXEMPT)) {
            const abs = path.join(WEB, file);
            expect(fs.existsSync(abs), `${file} is exempt but does not exist — stale exemption`).toBe(true);
            const source = fs.readFileSync(abs, "utf8");
            expect(classification).not.toBe("");
            for (const marker of evidence) {
                expect(marker.test(source), `${file}: exemption claims "${classification}" but ${marker} is gone`).toBe(true);
            }
        }
    });

    it("verifies the signature in the handler both Twilio routes delegate to", () => {
        /*
         * The exemption for those two routes is only as good as this. They carry no session and no
         * capability; if `handleTwilioSmsStatus` stopped checking `x-twilio-signature`, two
         * unauthenticated public endpoints would be writing delivery state for every tenant.
         */
        const source = fs.readFileSync(path.join(WEB, "lib/communications/twilioSmsStatusWebhook.ts"), "utf8");
        expect(source).toMatch(/verifyTwilioRequestSignature\(/);
        expect(source, "an invalid signature must be refused, not logged and accepted").toMatch(/respond\(403,/);
    });

    it("leaves requireAdminOrOps nowhere on the surface but the blocked decision", () => {
        /*
         * The name is the danger. A reader sees `requireAdminOrOps()` and reads a role check; the
         * body resolves portal admission. Wherever it survives here it must be somewhere this file
         * has classified, so the misreading cannot happen silently.
         */
        const stragglers = routeFiles().filter((file) => {
            if (file in EXEMPT) return false;
            return /await requireAdminOrOps\(\)/.test(fs.readFileSync(path.join(WEB, file), "utf8"));
        });
        expect(stragglers).toEqual([]);
    });

    it("admits no role title as a Communications authority", () => {
        /*
         * W-13 removed role-title authority from the rest of the platform; `hasCommunicationsSendPermission`
         * kept it, opening with `roleKeys.some(r => r === "admin" || r === "ops")`. A title recorded
         * in no grant table satisfying a capability check makes the role editor a fiction in both
         * directions — a custom role with the administrator's exact package still could not send.
         */
        const libDir = path.join(WEB, "lib", "communications");
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(abs);
                else if (entry.name.endsWith(".ts")) {
                    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
                        // Prose about the removal is expected; an expression that acts on a title is not.
                        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
                        if (/roleKeys[\s\S]{0,40}===\s*["'](admin|ops)["']/.test(line)) {
                            offenders.push(`${path.relative(WEB, abs)}: ${line.trim()}`);
                        }
                    }
                }
            }
        };
        walk(libDir);
        expect(offenders).toEqual([]);
    });
});
