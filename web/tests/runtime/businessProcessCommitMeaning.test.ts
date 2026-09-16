/**
 * POST-DEPLOYMENT REPAIR SLICE 2 — P0-2 / P0-6.
 *
 * Measured on deployed staging: the Business Process card was ABSENT from the DOM until 20.7 s from
 * cold entry — 5.9 s after every sibling card was already meaningful — because it rendered only from
 * `operationalProjection.businessProcess.evidence`, the settlement-only projection the drawer VM
 * fills, and fell back to evidence derived over an EMPTY context, which renders as nothing.
 *
 * The committed context already answers the question the card exists to answer: which stage this
 * subject is in. So the fallback now runs the SAME canonical builder over the context we have. These
 * tests hold the contract that makes that safe: meaningful at commit, enriched at settlement, and
 * never the reverse.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    buildBusinessProcessCardEvidence,
    EMPTY_BUSINESS_PROCESS_EVIDENCE,
} from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const CARD = join(process.cwd(), "components/admin/focusPanel/cards/BusinessProcessCard.tsx");
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** What `buildCommitCriticalOperationalContext` actually produces: stage identity, no rail. */
const commitFrame = {
    grain: "case",
    subject: { type: "opportunity", id: "opp-1", label: "Certopp Family" },
    businessProcess: { key: "waitlist", label: "Waitlist", stageKey: "waitlist", stages: [] },
    perspective: null,
    truth: { id: "opp-1" },
    signals: {
        work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
        attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
        tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
        communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
        billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
    },
    capabilities: { canMutate: false, maskedChannels: false },
    status: "ready",
} as unknown as OperationalContext;

/** The settled context — the drawer VM has landed, so the configured rail is present. */
const settledFrame = {
    ...commitFrame,
    businessProcess: {
        key: "waitlist",
        label: "Waitlist",
        name: "Enrollment",
        stageKey: "waitlist",
        stages: [
            { key: "lead", label: "Lead" },
            { key: "tour", label: "Tour" },
            { key: "waitlist", label: "Waitlist" },
            { key: "enrolling", label: "Enrolling" },
        ],
    },
} as unknown as OperationalContext;

describe("P0-2 — the card is meaningful at commit", () => {
    it("the commit frame yields stage identity, where the empty fallback yielded none", () => {
        const atCommit = buildBusinessProcessCardEvidence(commitFrame);
        expect(atCommit.caseStageKey, "which stage the subject is in").toBe("waitlist");
        expect(atCommit.caseStageLabel).toBe("Waitlist");
        // The regression this replaces: evidence derived over an empty context says nothing at all.
        expect(EMPTY_BUSINESS_PROCESS_EVIDENCE.caseStageKey).toBeNull();
        expect(EMPTY_BUSINESS_PROCESS_EVIDENCE.caseStageLabel).toBeNull();
    });

    it("claims no rail it has not been given — stages are honestly empty at commit", () => {
        const atCommit = buildBusinessProcessCardEvidence(commitFrame);
        expect(atCommit.stages).toEqual([]);
        expect(atCommit.participants).toEqual([]);
    });
});

describe("P0-2 — settlement enriches, it does not contradict", () => {
    const atCommit = buildBusinessProcessCardEvidence(commitFrame);
    const atSettled = buildBusinessProcessCardEvidence(settledFrame);

    it("stage identity survives settlement unchanged", () => {
        expect(atSettled.caseStageKey).toBe(atCommit.caseStageKey);
        expect(atSettled.caseStageLabel).toBe(atCommit.caseStageLabel);
    });

    it("settlement adds the configured rail", () => {
        expect(atCommit.stages).toHaveLength(0);
        expect(atSettled.stages.map((s) => s.key)).toEqual(["lead", "tour", "waitlist", "enrolling"]);
    });

    it("settlement adds the process name, which the commit frame does not carry", () => {
        expect(atCommit.processName ?? null).toBeNull();
        expect(atSettled.processName).toBe("Enrollment");
    });

    it("MONOTONIC: no field that was meaningful at commit becomes null at settlement", () => {
        for (const k of ["caseStageKey", "caseStageLabel"] as const) {
            if (atCommit[k] != null) {
                expect(atSettled[k], `${k} may not be erased by settlement`).not.toBeNull();
            }
        }
    });

    it("a settlement that disagreed about the stage would be visible, not silently merged", () => {
        const moved = buildBusinessProcessCardEvidence({
            ...settledFrame,
            businessProcess: { ...settledFrame.businessProcess, stageKey: "enrolling", label: "Enrolling" },
        } as unknown as OperationalContext);
        // Authoritative truth wins — and the difference is observable rather than blended.
        expect(moved.caseStageKey).toBe("enrolling");
        expect(moved.caseStageKey).not.toBe(atCommit.caseStageKey);
    });
});

describe("P0-2 — the card wiring", () => {
    it("falls back to the builder over the committed context, never to the empty evidence", () => {
        const code = strip(read(CARD));
        expect(code).toMatch(
            /\?\?\s*buildBusinessProcessCardEvidence\(context, \{ selectedParticipantId \}\)/,
        );
        expect(code, "the blank fallback is what produced the absent card").not.toMatch(
            /\?\?\s*EMPTY_BUSINESS_PROCESS_EVIDENCE/,
        );
    });

    it("settled behaviour is unchanged — the projection still wins when present", () => {
        const code = strip(read(CARD));
        expect(code).toMatch(/projected\?\.businessProcess\.evidence/);
    });

    it("no fetch, no cache, no second readiness source was added to the card", () => {
        const code = read(CARD);
        for (const forbidden of ["fetch(", "useState", "setTimeout", "new Map("]) {
            expect(code, `${forbidden} would be a second owner`).not.toContain(forbidden);
        }
    });

    it("slow settlement leaves a meaningful card — the pending case IS the commit case", () => {
        // There is no separate "slow" branch to test: when the projection has not arrived the card
        // renders commit-frame evidence, which this asserts is meaningful however long that lasts.
        const duringSettlement = buildBusinessProcessCardEvidence(commitFrame);
        expect(duringSettlement.caseStageLabel).toBe("Waitlist");
        expect(duringSettlement.caseStageKey).toBe("waitlist");
    });
});
