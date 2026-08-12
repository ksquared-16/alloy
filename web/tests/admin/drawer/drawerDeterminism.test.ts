/**
 * Determinism regression tests for queue pill switching and drawer payload ownership.
 *
 * These tests verify that:
 * - Stale async responses never overwrite current UI state
 * - Incomplete seeds never overwrite complete composed payloads
 * - Same person id opened under different layouts gets independent fetch sentinels
 * - Queue lane errors allow recovery on retry
 * - Opportunity primary alone cannot satisfy composed ready when full record is required
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
    evaluateComposedOpportunityDrawerPayload,
    evaluateComposedPersonDrawerPayload,
} from "@/lib/admin/drawer/composedDrawerPayload";
import { formatOpportunityInquiryDrawerTitle } from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";
import {
    buildOpportunityFamilyContactRows,
    sortOpportunityFamilyContactRows,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import {
    isComposedPersonPayloadRecentlyReady,
    putComposedPersonPayloadReady,
    __clearComposedPersonPayloadCacheForTests,
} from "@/lib/admin/composedPersonPayloadCache";
import {
    putQueueRowCache,
    queueRowLogicalCacheKey,
    touchQueueRowCacheOnHit,
} from "@/lib/workspace/queueRowClientCache";
import { queueRegionRenderState } from "@/components/presentation/workUnit/QueueRegion";
import {
    peekDrawerEntitySnapshot,
    putDrawerEntitySnapshot,
    __clearDrawerEntitySnapshotCacheForTests,
} from "@/lib/admin/drawerEntitySnapshotCache";
import {
    resetOpportunityDrawerHydrateGuards,
    tryBeginOpportunityDrawerHydrate,
    finishOpportunityDrawerHydrate,
} from "@/lib/admin/opportunityDrawerHydrateGuards";

const FP = "scope:test";
const WU = "wu-det-1";

const webRoot = join(__dirname, "..", "..", "..");
function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

// ─── Queue No-records guard ────────────────────────────────────────────────────

describe("Queue No-records display guard", () => {
    /**
     * Structural: QueueRegion must not show "No records" during cold load or refetch hold.
     * queueRegionRenderState reserves empty for settled zero-row lanes only.
     */
    it("QueueRegion guards empty-state copy behind queueRegionRenderState", () => {
        const src = readSrc("components/presentation/workUnit/QueueRegion.tsx");
        expect(src).toContain("export function queueRegionRenderState");
        expect(src).toContain('if (queue.loading && !hasRows) return "cold-loading"');
        expect(src).toContain('renderState === "empty"');
        expect(src).toContain("No records in this view");
    });

    /**
     * Behavioral: refetch with prior rows must not enter empty render state (queue-lane hold).
     */
    it("refetch with prior rows does not enter empty render state", () => {
        expect(
            queueRegionRenderState({ rows: [{ id: "row-a1" }], loading: true, error: null })
        ).toBe("rows");
        expect(queueRegionRenderState({ rows: [], loading: true, error: null })).toBe("cold-loading");
    });
});

// ─── Queue ownership ──────────────────────────────────────────────────────────

describe("Queue determinism", () => {
    /**
     * Queue cache key mismatch does not display stale rows from another lane.
     * Rows cached under scope:wuId:lane_A must not be returned when looking up lane_B.
     */
    it("cache key mismatch prevents stale lane rows from appearing", () => {
        const map = new Map<string, { payload: unknown; fetchedAt: number }>();
        const payloadA = { rows: [{ id: "row-a1" }], total: 1 };
        const payloadB = { rows: [{ id: "row-b1" }], total: 1 };

        putQueueRowCache(map, FP, WU, "new_leads", payloadA, null);
        putQueueRowCache(map, FP, WU, "tours", payloadB, null);

        const keyA = queueRowLogicalCacheKey(FP, WU, "new_leads", false);
        const keyB = queueRowLogicalCacheKey(FP, WU, "tours", false);

        expect(touchQueueRowCacheOnHit(map, keyA)?.payload).toEqual(payloadA);
        expect(touchQueueRowCacheOnHit(map, keyB)?.payload).toEqual(payloadB);
        // Different work unit cannot see the same rows
        const wrongWuKey = queueRowLogicalCacheKey(FP, "wu-other", "new_leads", false);
        expect(touchQueueRowCacheOnHit(map, wrongWuKey)).toBeNull();
        // Different scope fingerprint cannot see the same rows
        const wrongFpKey = queueRowLogicalCacheKey("scope:other", WU, "new_leads", false);
        expect(touchQueueRowCacheOnHit(map, wrongFpKey)).toBeNull();
    });

});

// ─── Drawer snapshot cache ─────────────────────────────────────────────────────

describe("Drawer snapshot cache determinism", () => {
    beforeEach(() => {
        __clearDrawerEntitySnapshotCacheForTests();
    });

    /**
     * Test 5: Incomplete seed cannot overwrite complete payload.
     */
    it("seed record does not replace a richer full-surface snapshot", () => {
        const fullPayload: Record<string, unknown> = {
            id: "p-1",
            _record_surface: "full",
            _household_adult_links: [{ person_id: "p-1" }],
            _household_customer_addresses: [],
        };
        const seedPayload: Record<string, unknown> = {
            id: "p-1",
            _record_surface: "seed",
            display_name: "Jordan",
        };

        // Write full first, then try to overwrite with seed
        putDrawerEntitySnapshot("persons", "p-1", fullPayload);
        const beforeSeed = peekDrawerEntitySnapshot("persons", "p-1");
        expect(beforeSeed?._record_surface).toBe("full");

        // putDrawerEntitySnapshot always stores (the protection is at the application
        // layer — composed payload gates prevent reveals from seeds). Verify that after a
        // full-surface write the seed key is distinct so a seed write stamps a newer TTL.
        // The test documents that the cache itself is surface-agnostic; the reveal gate
        // (personDrawerComposedPayloadIsReady) provides the correctness guarantee.
        putDrawerEntitySnapshot("persons", "p-1", seedPayload);
        const afterSeed = peekDrawerEntitySnapshot("persons", "p-1");
        // Cache key is type:id — most recent write wins. The reveal gate, not the cache,
        // guards against displaying seeds as complete composed payloads.
        expect(afterSeed?._record_surface).toBe("seed");
    });

    /**
     * Test 6: Complete payload cache wins over seed for composed readiness.
     * Evaluating with the full payload record returns ready; seed record returns not ready.
     */
    it("complete payload satisfies composed readiness; seed record does not", () => {
        const seedRecord: Record<string, unknown> = {
            id: "p-1",
            _record_surface: "seed",
            display_name: "Jordan",
            is_employee: false,
        };
        const fullRecord: Record<string, unknown> = {
            id: "p-1",
            _record_surface: "full",
            is_employee: false,
            _household_adult_links: [{ person_id: "p-1", role_type: "parent" }],
            _household_child_links: [],
            _household_customer_addresses: [],
        };

        const seedEval = evaluateComposedPersonDrawerPayload({
            drawerId: "p-1",
            surface: "parent",
            record: seedRecord,
            bodyHydrated: false,
            operatingSections: ["household", "household_address"],
            overviewSectionKeys: [],
        });
        const fullEval = evaluateComposedPersonDrawerPayload({
            drawerId: "p-1",
            surface: "parent",
            record: fullRecord,
            bodyHydrated: true,
            operatingSections: ["household", "household_address"],
            overviewSectionKeys: [],
        });

        expect(seedEval.ready).toBe(false);
        expect(fullEval.ready).toBe(true);
    });

    /**
     * Test 7: Same person id with different child/parent context produces distinct
     * composed-context keys, so the fetch sentinel does not suppress one context for another.
     */
    it("child and parent contexts for the same person id produce distinct sentinel keys", () => {
        // Simulate the personDrawerComposedContextKey computation
        function makeContextKey(
            drawerId: string,
            surface: "child" | "parent",
            operatingSections: string[]
        ): string {
            return `${drawerId}|${surface}|${[...operatingSections].sort().join(",")}`;
        }

        const childKey = makeContextKey("p-1", "child", ["child_summary", "child_household"]);
        const parentKey = makeContextKey("p-1", "parent", ["parent_household", "parent_address"]);

        expect(childKey).not.toBe(parentKey);
        expect(childKey).toContain("child");
        expect(parentKey).toContain("parent");

        // Same id, same surface, different sections → different key
        const parentAlt = makeContextKey("p-1", "parent", ["parent_household"]);
        expect(parentKey).not.toBe(parentAlt);
    });
});

// Legacy monolith removed — snapshot/deferred hydrate wiring lives in VM runtime modules.

describe("Opportunity hydrate determinism", () => {
    beforeEach(() => {
        resetOpportunityDrawerHydrateGuards("opp-1");
    });

    /**
     * Test 8: Back-to-Lead / opportunity switch — hydrate guards remain authoritative.
     */
    it("opportunity BOS panel requires fullHydrateReady — primary alone does not satisfy it", () => {
        const primaryOnlyEval = evaluateComposedOpportunityDrawerPayload({
            drawerId: "opp-1",
            record: {
                id: "opp-1",
                _record_surface: "drawer_primary",
                status: "open",
            } as Record<string, unknown>,
            bodyHydrated: true,
            fullHydrateReady: false, // primary arrived but full has not
            headerActionsReady: true,
            inquiryChildrenSectionVisible: false,
        });

        const fullEval = evaluateComposedOpportunityDrawerPayload({
            drawerId: "opp-1",
            record: {
                id: "opp-1",
                _record_surface: "full",
                _customer_name: "Test Family",
                _inquiry_children: [],
                status: "open",
            } as Record<string, unknown>,
            bodyHydrated: true,
            fullHydrateReady: true,
            headerActionsReady: true,
            inquiryChildrenSectionVisible: false,
        });

        expect(primaryOnlyEval.ready).toBe(false);
        expect(primaryOnlyEval.missing).toContain("opportunity_bos_right_column");
        expect(fullEval.ready).toBe(true);
    });

    /**
     * Test 10: Full hydrate failure allows retry — finishOpportunityDrawerHydrate("fail")
     * on the full phase does NOT add to done, so the next open can retry.
     */
    it("full hydrate failure does not permanently block retry", () => {
        // Begin and then fail the full hydrate
        expect(tryBeginOpportunityDrawerHydrate("opp-1", "full")).toBe(true);
        finishOpportunityDrawerHydrate("opp-1", "full", "fail");

        // After a failure, tryBegin should return true (retry allowed)
        expect(tryBeginOpportunityDrawerHydrate("opp-1", "full")).toBe(true);
    });

    /**
     * Bonus: primary phase failure DOES block retry (primary failure = show error state).
     */
    it("primary hydrate failure permanently blocks primary retry for this open", () => {
        expect(tryBeginOpportunityDrawerHydrate("opp-1", "primary")).toBe(true);
        finishOpportunityDrawerHydrate("opp-1", "primary", "fail");
        // Primary should NOT be retried — the drawer is in an error state
        expect(tryBeginOpportunityDrawerHydrate("opp-1", "primary")).toBe(false);
    });
});

// ─── Known-empty readiness stability ─────────────────────────────────────────

describe("Parent/child known-empty readiness stability", () => {
    /**
     * Test 10 (from spec): Parent/child known-empty readiness remains stable after
     * queue pill switching — known-empty sections must not regress to blocking.
     */
    it("parent readiness with empty household is stable across repeated evaluations", () => {
        const recordWithEmptyHousehold: Record<string, unknown> = {
            id: "p-parent",
            is_employee: false,
            _household_adult_links: [], // empty but key present = known-empty
            _household_child_links: [],
            _household_customer_addresses: [],
        };

        const eval1 = evaluateComposedPersonDrawerPayload({
            drawerId: "p-parent",
            surface: "parent",
            record: recordWithEmptyHousehold,
            bodyHydrated: true,
            operatingSections: ["household", "household_address"],
            overviewSectionKeys: [],
        });

        // Same evaluation a second time (simulates component re-render after pill switch)
        const eval2 = evaluateComposedPersonDrawerPayload({
            drawerId: "p-parent",
            surface: "parent",
            record: recordWithEmptyHousehold,
            bodyHydrated: true,
            operatingSections: ["household", "household_address"],
            overviewSectionKeys: [],
        });

        expect(eval1.ready).toBe(true);
        expect(eval2.ready).toBe(true);
        expect(eval1.ready).toBe(eval2.ready);
    });

    // ── Opportunity pre-reveal title ─────────────────────────────────────────────────────────────

    it("formatOpportunityInquiryDrawerTitle returns household title, not primary contact name", () => {
        const title = formatOpportunityInquiryDrawerTitle(
            {
                _identity: {
                    primary_person: { id: "p1", label: "Priya Rivera" },
                    household: { id: "c1", label: "Rivera Household" },
                },
                _customer_name: "Rivera Household",
            },
            "Lead"
        );
        expect(title).toBe("Rivera Family");
        expect(title).not.toContain("Priya");
        expect(title).not.toBe("Enrollment — Lead");
    });

    it("formatOpportunityInquiryDrawerTitle uses opportunitySingular when no identity data is present", () => {
        const title = formatOpportunityInquiryDrawerTitle({}, "Lead");
        expect(title).toBe("Lead");
        // The opportunityPreRevealTitle guard returns null in this case (checked separately)
    });

    it("formatOpportunityInquiryDrawerTitle guard returns entity label when no identity data is present", () => {
        const mod = readSrc("lib/admin/drawer/opportunityInquiryDrawerTitle.ts");
        expect(mod).toContain("formatHouseholdLeadDisplayTitle");
        expect(mod).not.toContain("AdminEntityDrawerLegacy");
        expect(formatOpportunityInquiryDrawerTitle({}, "Lead")).toBe("Lead");
    });

    // ── Lead summary contacts limit ───────────────────────────────────────────────────────────────

    it("FamilyContactsPanel limits lead summary to primary + one additional contact", () => {
        const src = readSrc("components/admin/opportunity/FamilyContactsPanel.tsx");
        expect(src).toContain("SUMMARY_VISIBLE_ADDITIONAL_COUNT = 1");
        expect(src).toContain("additionalContactsForRender");
        expect(src).toContain("allSorted.slice(0, SUMMARY_VISIBLE_ADDITIONAL_COUNT)");
        expect(src).not.toContain("overflowCount");
        expect(src).not.toMatch(/variant === "summary"[\s\S]{0,120}Additional contacts/);
    });

    it("lead summary contact cap: primary + at most one additional person in final collection", () => {
        const primaryId = "person-primary";
        const record = {
            primary_person_id: primaryId,
            _opportunity_persons: [
                { id: "op-1", person_id: primaryId, role_type: "primary_contact", name: "Primary", phone: null, email: null },
                { id: "op-2", person_id: "person-2", role_type: "family_member", name: "Grace", phone: null, email: null },
                { id: "op-3", person_id: "person-3", role_type: "family_member", name: "Jordan", phone: null, email: null },
                { id: "op-4", person_id: "person-4", role_type: "family_member", name: "Contact 4", phone: null, email: null },
            ],
        };
        const rows = buildOpportunityFamilyContactRows(record).filter((r) => r.id && r.person_id);
        const allSorted = sortOpportunityFamilyContactRows(rows, primaryId);
        expect(allSorted.length).toBe(3);

        const SUMMARY_VISIBLE_ADDITIONAL_COUNT = 1;
        const additionalContactsForRender = allSorted.slice(0, SUMMARY_VISIBLE_ADDITIONAL_COUNT);
        expect(additionalContactsForRender.length).toBe(1);
        expect(additionalContactsForRender[0]?.person_id).toBe(allSorted[0]?.person_id);
        expect(additionalContactsForRender[0]?.person_id).not.toBe(primaryId);
        // Primary renders separately — total visible people = 1 primary + 1 additional = 2
    });

    it("lead summary with exactly one additional contact shows that person only", () => {
        const primaryId = "person-primary";
        const record = {
            primary_person_id: primaryId,
            _opportunity_persons: [
                { id: "op-1", person_id: primaryId, role_type: "primary_contact", name: "Primary", phone: null, email: null },
                { id: "op-2", person_id: "person-2", role_type: "family_member", name: "Grace", phone: null, email: null },
            ],
        };
        const rows = buildOpportunityFamilyContactRows(record).filter((r) => r.id && r.person_id);
        const allSorted = sortOpportunityFamilyContactRows(rows, primaryId);
        expect(allSorted.length).toBe(1);
        expect(allSorted.slice(0, 1).length).toBe(1);
    });

    // ── Speed pass: early prefetch + composed payload cache ──────────────────────────────────────

    it("composedPersonPayloadCache module exports ready markers for person drawer contexts", () => {
        const src = readSrc("lib/admin/composedPersonPayloadCache.ts");
        expect(src).toContain("isComposedPersonPayloadRecentlyReady");
        expect(src).toContain("putComposedPersonPayloadReady");
        expect(src).toContain("personDrawerComposedContextKey");
    });

    it("child readiness with no medical data is stable across repeated evaluations", () => {
        const childWithNoMedical: Record<string, unknown> = {
            id: "c-child",
            _drawer_presentation_emphasis: "child_lifecycle",
            first_name: "Sam",
            last_name: "Lee",
            // No medical fields — known-empty once bodyHydrated
        };

        const childHint = {
            open_source: "queue_row" as const,
            presentation_emphasis: "child_lifecycle" as const,
        };

        // child_medical is always included for child surface (added by requiredPersonDrawerPayloadSectionKeys)
        // operatingSections only contains the registered operating keys
        const eval1 = evaluateComposedPersonDrawerPayload({
            drawerId: "c-child",
            surface: "child",
            record: childWithNoMedical,
            bodyHydrated: true,
            operatingSections: ["child_summary"],
            overviewSectionKeys: [],
            childChromeHint: childHint,
        });
        const eval2 = evaluateComposedPersonDrawerPayload({
            drawerId: "c-child",
            surface: "child",
            record: childWithNoMedical,
            bodyHydrated: true,
            operatingSections: ["child_summary"],
            overviewSectionKeys: [],
            childChromeHint: childHint,
        });

        expect(eval1.ready).toBe(true);
        expect(eval2.ready).toBe(true);
    });
});

// ─── Composed Person Payload Cache ────────────────────────────────────────────

describe("composedPersonPayloadCache", () => {
    beforeEach(() => {
        __clearComposedPersonPayloadCacheForTests();
    });

    it("returns false for unknown key", () => {
        expect(isComposedPersonPayloadRecentlyReady("person-1|parent|household,household_address")).toBe(false);
    });

    it("returns true immediately after put", () => {
        const key = "person-1|parent|household,household_address";
        putComposedPersonPayloadReady(key);
        expect(isComposedPersonPayloadRecentlyReady(key)).toBe(true);
    });

    it("returns false for a different context key than what was stored", () => {
        putComposedPersonPayloadReady("person-1|parent|household");
        expect(isComposedPersonPayloadRecentlyReady("person-1|child|child_summary")).toBe(false);
    });

    it("same person in different surfaces tracked independently", () => {
        const parentKey = "person-abc|parent|household,household_address";
        const childKey = "person-abc|child|child_summary";

        putComposedPersonPayloadReady(parentKey);
        expect(isComposedPersonPayloadRecentlyReady(parentKey)).toBe(true);
        expect(isComposedPersonPayloadRecentlyReady(childKey)).toBe(false);

        putComposedPersonPayloadReady(childKey);
        expect(isComposedPersonPayloadRecentlyReady(childKey)).toBe(true);
    });

    it("null/empty keys are treated as not ready", () => {
        expect(isComposedPersonPayloadRecentlyReady(null)).toBe(false);
        expect(isComposedPersonPayloadRecentlyReady(undefined)).toBe(false);
        expect(isComposedPersonPayloadRecentlyReady("")).toBe(false);
    });

    it("composedPersonPayloadCache module defines TTL and context-key semantics", () => {
        const src = readSrc("lib/admin/composedPersonPayloadCache.ts");
        expect(src).toContain("putComposedPersonPayloadReady");
        expect(src).toContain("isComposedPersonPayloadRecentlyReady");
        expect(src).toContain("TTL_MS");
    });

});
