/**
 * THE DOCUMENT MUST ANSWER "HAVE I OPENED THIS?", NOT ASSERT AN ANSWER AND CORRECT IT.
 *
 * Measured on the canonical six-card baseline (n=11, SHA 786a96eb1): WU-05 owned completion in 11
 * of 11 samples, and the mutation that set FIRST_ORDER_VISIBLE_COMPLETE was the removal of an
 * unread dot -- `aria-label "Not yet opened by you" -> null`. The driver was a post-mount
 * stage-membership-ack round trip measuring 592ms (P50).
 *
 * The subtlety these gates exist for: with `personal_seen` ABSENT, `resolveRowUnseen` returns TRUE
 * for every row. So "not answered" and "answered: unseen" are indistinguishable at the dot, but
 * they are NOT the same claim -- one is a guess the network later corrects, the other is truth.
 * Collapsing them is how a failed read would silently become "you have seen this".
 */
import { describe, expect, it } from "vitest";

import {
    occurrenceKeyForAck,
    personalSeenFromOccurrence,
} from "@/lib/queues/operatorStageMembershipAck";
import { markOccurrenceSeenLocally, resolveRowUnseen } from "@/lib/queues/queuePersonalSeenSession";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

const ORG = "org-1";
const USER = "user-1";
const OTHER_USER = "user-2";

const ack = (over: Partial<Parameters<typeof occurrenceKeyForAck>[0]> = {}) =>
    occurrenceKeyForAck({
        orgId: ORG,
        userId: USER,
        subjectType: "case",
        subjectId: "subject-1",
        stageKey: "lead",
        stageEnteredAtIso: "2026-09-13T14:02:39.832Z",
        ...over,
    });

function ctxWith(personalSeen: QueueRowContext["personal_seen"]): QueueRowContext {
    return { personal_seen: personalSeen } as unknown as QueueRowContext;
}

describe("the occurrence key binds everything that can change the answer", () => {
    it("a DIFFERENT OPERATOR gets a different key", () => {
        // Personal state. One operator's acknowledgement must never clear another's dot.
        expect(ack({ userId: OTHER_USER })).not.toBe(ack());
    });

    it("a DIFFERENT SUBJECT gets a different key", () => {
        expect(ack({ subjectId: "subject-2" })).not.toBe(ack());
    });

    it("a DIFFERENT STAGE gets a different key", () => {
        expect(ack({ stageKey: "tour" })).not.toBe(ack());
    });

    it("RE-ENTERING THE SAME STAGE IS A NEW OCCURRENCE", () => {
        /*
         * This is what makes a carried verdict safe across time: acknowledging an earlier visit to
         * a stage must not silence the row when the subject enters that stage again.
         */
        expect(ack({ stageEnteredAtIso: "2026-09-20T09:00:00.000Z" })).not.toBe(ack());
    });

    it("a DIFFERENT ORG gets a different key", () => {
        expect(ack({ orgId: "org-2" })).not.toBe(ack());
    });

    it("the same occurrence is stable", () => {
        // Otherwise a key built during composition could never match one built at the endpoint.
        expect(ack()).toBe(ack());
    });
});

describe("the server verdict says what it means", () => {
    it("acknowledged -> seen", () => {
        const k = ack();
        expect(personalSeenFromOccurrence({ occurrenceKey: k, acknowledgedKeys: new Set([k]) })).toEqual({
            unseen: false,
            occurrence_key: k,
        });
    });

    it("not acknowledged -> UNSEEN, and it is a real answer", () => {
        const k = ack();
        expect(personalSeenFromOccurrence({ occurrenceKey: k, acknowledgedKeys: new Set() })).toEqual({
            unseen: true,
            occurrence_key: k,
        });
    });

    it("no stable occurrence -> NOT unseen (no false dot)", () => {
        expect(personalSeenFromOccurrence({ occurrenceKey: null, acknowledgedKeys: new Set() })).toEqual({
            unseen: false,
            occurrence_key: null,
        });
    });
});

describe("UNAVAILABLE is not ACKNOWLEDGED", () => {
    it("AN ABSENT VERDICT STILL SHOWS THE DOT — it is a guess, not an answer", () => {
        /*
         * The load-bearing distinction. A failed server read must leave `personal_seen` absent, and
         * absent must keep the existing "unseen until proven otherwise" behaviour so the network
         * still corrects it. If absence were ever treated as "seen", a read failure would silently
         * clear a dot the operator still needs.
         */
        const k = ack();
        expect(resolveRowUnseen({ context: ctxWith(undefined), occurrenceKey: k })).toBe(true);
        expect(resolveRowUnseen({ context: ctxWith(null), occurrenceKey: k })).toBe(true);
    });

    it("an explicit server verdict is USED, not re-guessed", () => {
        const k = ack();
        expect(resolveRowUnseen({ context: ctxWith({ unseen: false, occurrence_key: k }), occurrenceKey: k })).toBe(
            false,
        );
        expect(resolveRowUnseen({ context: ctxWith({ unseen: true, occurrence_key: k }), occurrenceKey: k })).toBe(
            true,
        );
    });

    it("a server 'seen' verdict never resurrects a dot the operator just cleared locally", () => {
        // Local optimistic clears outrank a payload composed before the operator opened the row.
        const k = ack({ subjectId: "subject-local" });
        markOccurrenceSeenLocally(k);
        expect(resolveRowUnseen({ context: ctxWith({ unseen: true, occurrence_key: k }), occurrenceKey: k })).toBe(
            false,
        );
    });
});

describe("one definition, two acquisition paths", () => {
    const SRC = (() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { join } = require("node:path") as typeof import("node:path");
        const raw = readFileSync(
            join(process.cwd(), "lib/runtime/provisioning/operationalProjectionEnrichment.ts"),
            "utf8",
        );
        return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    })();

    it("composition reuses the CANONICAL resolver and key builder", () => {
        // A second definition of "have I opened this" is the defect this repair must not create.
        expect(SRC).toContain("loadAcknowledgedOccurrenceKeys");
        expect(SRC).toContain("occurrenceKeyForAck");
        expect(SRC).toContain("personalSeenFromOccurrence");
    });

    it("it does NOT reimplement the predicate or query the ack table directly", () => {
        expect(SRC).not.toContain("operator_stage_membership_acks");
        expect(SRC).not.toMatch(/\.from\(\s*OPERATOR_STAGE_MEMBERSHIP_ACKS_TABLE/);
    });

    it("a failed resolution leaves the verdict ABSENT rather than writing one", () => {
        /*
         * Counted, not located. The first version of this gate read the 400 characters after the
         * file's FIRST `catch` -- but the CRM and children enrichments have their own catches
         * earlier, so it inspected an unrelated block and a planted "failure becomes acknowledged"
         * defect sailed through. There is exactly ONE place a verdict may be written: the success
         * path. Any second assignment -- in a catch or anywhere else -- is the defect.
         */
        expect((SRC.match(/personal_seen\s*=/g) ?? []).length).toBe(1);
    });

    it("carries DATA, not an authorization verdict", () => {
        for (const forbidden of ["canView", "canEdit", "allowedLocationIds", "role"]) {
            expect(SRC).not.toContain(forbidden);
        }
    });

    it("resolves THE WHOLE PAGE in one call, not per row", () => {
        /*
         * Counting call SITES is not enough -- a per-row query still has one site, just inside a
         * loop, and the first version of this gate passed a planted per-row defect for exactly
         * that reason. What actually matters is the ARGUMENT: the call must be handed every key on
         * the page at once. Trading 592ms of client wait for N server round trips would be worse
         * than the defect being repaired.
         */
        expect(SRC).toContain("occurrenceKeys: [...keyByRowId.values()]");
        expect((SRC.match(/loadAcknowledgedOccurrenceKeys\(/g) ?? []).length).toBe(1);
    });
});

describe("the client asks only when the document did not answer", () => {
    const SRC = (() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { join } = require("node:path") as typeof import("node:path");
        const raw = readFileSync(join(process.cwd(), "components/presentation/workUnit/QueueRegion.tsx"), "utf8");
        return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    })();

    it("skips the post-mount fetch when every row carries a verdict", () => {
        expect(SRC).toMatch(/if \(serverResolvedAllPersonalSeen\) return;/);
    });

    it("REQUIRES EVERY ROW, NOT ANY — a partial page must still hydrate", () => {
        // `some` here would leave unanswered rows stuck showing a dot no request will clear.
        expect(SRC).toContain("queue.rows.every((row) => row.context?.personal_seen != null)");
        expect(SRC).not.toMatch(/queue\.rows\.some\([^)]*personal_seen/);
    });

    it("keeps the canonical fallback fetch", () => {
        expect(SRC).toContain("stage-membership-ack?keys=");
        expect(SRC).toContain("hydrateOccurrencesSeenLocally");
    });
});
