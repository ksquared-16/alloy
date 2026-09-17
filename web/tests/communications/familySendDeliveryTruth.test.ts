import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    classifyFamilySendOutcome,
    familySendDelivered,
    familySendFailureMessage,
    familySendPartialMessage,
} from "@/lib/communications/v2/familyWorkspace/familySendOutcome";

/**
 * DELIVERY TRUTH.
 *
 * The canonical send route is truthful — it returns `{requested, ready, sent, blocked, failed}` and
 * gates its own side effects on `sent > 0`. The composer read none of it: its only failure branch was
 * `!res.ok`, so an HTTP 200 carrying `sent: 0, failed: 1` announced "Email sent to Tourb Tourb0913"
 * and then wrote a `mark_sent` audit event for a delivery that never happened.
 *
 * Measured live: the public-origin guard correctly refused a participant link pointing at localhost,
 * the route reported requested 1 / sent 0 / failed 1, and the UI reported success.
 */

const WEB = process.cwd();
const code = (rel: string) =>
    readFileSync(join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

const summary = (over: Partial<Record<string, number>> = {}) => ({
    requested: 1,
    ready: 0,
    sent: 0,
    blocked: 0,
    failed: 0,
    ...over,
}) as never;

describe("HTTP success is not delivery", () => {
    it("the exact live shape — 200 with sent 0 and failed 1 — is a total failure", () => {
        expect(classifyFamilySendOutcome(summary({ requested: 1, sent: 0, failed: 1 }))).toBe("total_failure");
        expect(familySendDelivered(summary({ requested: 1, sent: 0, failed: 1 }))).toBe(false);
    });

    it("everything asked for going out is a full success", () => {
        expect(classifyFamilySendOutcome(summary({ requested: 2, sent: 2 }))).toBe("full_success");
        expect(familySendDelivered(summary({ requested: 2, sent: 2 }))).toBe(true);
    });

    it("some out and some not is partial — never either extreme", () => {
        expect(classifyFamilySendOutcome(summary({ requested: 2, sent: 1, failed: 1 }))).toBe("partial_delivery");
        expect(familySendDelivered(summary({ requested: 2, sent: 1, failed: 1 }))).toBe(true);
    });

    it("a blocked recipient counts against completeness", () => {
        // A recipient the platform refused to contact did not get the message; calling that a full
        // success would hide a consent or reachability problem.
        expect(classifyFamilySendOutcome(summary({ requested: 2, sent: 1, blocked: 1 }))).toBe("partial_delivery");
    });

    it("nothing requested is not a failure", () => {
        expect(classifyFamilySendOutcome(summary({ requested: 0 }))).toBe("nothing_requested");
    });

    it("a missing summary is never read as success", () => {
        expect(classifyFamilySendOutcome(null)).toBe("nothing_requested");
        expect(familySendDelivered(undefined)).toBe(false);
    });
});

describe("the failure the operator sees is the one the send owner gave", () => {
    it("carries the canonical reason verbatim", () => {
        const reason =
            "This message cannot be sent: the configured public site address points at localhost, which no recipient can open.";
        expect(
            familySendFailureMessage([{ status: "failed", display_name: "Tourb Tourb0913", reason }]),
        ).toBe(reason);
    });

    it("says something rather than nothing when the owner gave no reason", () => {
        expect(familySendFailureMessage([{ status: "failed", reason: null }])).toBe(
            "This message could not be sent.",
        );
    });

    it("a partial says who it reached and that some did not", () => {
        expect(
            familySendPartialMessage({ channel: "email", summary: summary({ requested: 3, sent: 1, failed: 2 }) }),
        ).toContain("1 of 3");
    });
});

describe("the composer refuses false success and keeps the draft", () => {
    const runtime = code("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");

    it("classifies the send result instead of trusting the status code", () => {
        expect(runtime).toContain("classifyFamilySendOutcome(data.summary)");
        // The old behaviour: `!res.ok` as the only failure branch.
        expect(runtime).toContain('outcome === "total_failure"');
    });

    it("shows the canonical failure and returns before any success presentation", () => {
        expect(runtime).toContain("setSendError(familySendFailureMessage(data.results));");
        const failureAt = runtime.indexOf("setSendError(familySendFailureMessage(data.results));");
        const successAt = runtime.indexOf("buildContactFamilySendSuccessMessage({");
        expect(failureAt).toBeGreaterThan(-1);
        // Failure is decided BEFORE a success message can be built.
        expect(failureAt).toBeLessThan(successAt);
    });

    it("does not discard the operator's draft on a failed send", () => {
        // Every `setBodyDraft("")` in the confirm path lives AFTER the early return, so a failure
        // leaves the message intact to correct and retry. Measured from the failure point forward —
        // the same call appears earlier in unrelated handlers.
        const failureAt = runtime.indexOf("setSendError(familySendFailureMessage(data.results));");
        expect(failureAt).toBeGreaterThan(-1);
        const beforeFailure = runtime.slice(0, failureAt);
        const confirmBlockStart = beforeFailure.lastIndexOf("if (confirm) {");
        // Nothing between entering the confirm block and the failure return discards the draft.
        expect(runtime.slice(confirmBlockStart, failureAt)).not.toContain('setBodyDraft("")');
    });

    it("names the recipient from a row that actually sent", () => {
        expect(runtime).toContain("const recipientLabel = sentRows[0]?.display_name ?? rosterName ?? null;");
    });

    it("presents partial delivery as partial", () => {
        expect(runtime).toContain('outcome === "partial_delivery"');
        expect(runtime).toContain("familySendPartialMessage({");
    });
});

describe("an audit of delivery follows delivery", () => {
    const runtime = code("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");

    it("gates mark_sent on the send summary, not on the request completing", () => {
        expect(runtime).toContain("const delivered = familySendDelivered(data.summary);");
    });

    it("gates BOTH audit paths — the tour precedent and enrollment paperwork", () => {
        expect(runtime).toContain("if (tourInvitationId && opportunityId && delivered) {");
        expect(runtime).toContain("if (paperworkSessionId && paperworkChildId && delivered) {");
    });

    it("Enrollment and Tour share one rule, not two", () => {
        // One classifier, one `delivered`, both call sites — the whole point of fixing this in the
        // shared owner rather than in Enrollment.
        expect(runtime.match(/familySendDelivered\(/g) ?? []).toHaveLength(1);
    });
});

describe("the send route keeps its own truthful gating", () => {
    const route = code("app/api/admin/communications/family-send/route.ts");

    it("still keys its side effects on real delivery", () => {
        expect(route).toContain("result.summary.sent > 0");
    });

    it("a thread can exist without a delivery — the route never equates them", () => {
        // Thread creation is composing; delivery is a message leaving. Reading either as the other is
        // how an audit starts describing events that did not occur.
        expect(route).not.toMatch(/thread_id\s*\?\s*.*sent/);
    });
});

describe("the origin guard is untouched", () => {
    it("still refuses a loopback public origin", () => {
        const src = code("lib/publicAppUrl.ts");
        expect(src).toContain("loopback_in_hosted_runtime");
        expect(src).toContain("points at localhost, which no recipient can open");
    });
});
