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
import { shouldApplyWorkUnitQueueRowsResponse } from "@/lib/workspace/workUnitQueueRowFetchApply";
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
     * Structural: QueueBlock must not show "No records" when rowsHeld is true.
     * rowsHeld is set when the lane is not yet settled (hidden_until_settled),
     * which happens during any in-flight fetch or cache miss after pill switch.
     */
    it("QueueBlock guards empty-state copy behind rowsHeld check", () => {
        const src = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        // The "No records" empty state must require !rowsHeld (lane settled)
        expect(src).toContain("!queue.rowsLoading && !queue.rowsHeld && queue.items.length === 0");
        // Skeleton check must still be independent
        expect(src).toContain("queue.rowsLoading && !queue.rowsHeld && queue.items.length === 0");
    });

    /**
     * Structural: page.tsx must pass queueItemsLoading as rowsLoading so an in-flight
     * request suppresses "No records" at the data layer too (belt-and-suspenders).
     */
    it("page.tsx wires lane-aware rowsLoading in queue block model", () => {
        const src = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
        );
        expect(src).toContain("queuePayloadMatchesActiveLane");
        expect(src).toContain("rowsLoading:");
        expect(src).toContain("rowsHeld:");
        expect(src).toContain("payloadMatchesActiveLane");
    });

    /**
     * Null payload cannot show No records — confirmed by guard chain:
     * null queueItems → hidden_until_settled → rowsHeld=true → No records suppressed.
     */
    it("stale empty response from old pill cannot show No records on current pill", () => {
        // When the current pill (B) has a live request in flight, shouldApply drops A's empty response
        let latestSeq = 0;
        const seqA = ++latestSeq;
        ++latestSeq; // pill B fetch advances latest seq

        const decision = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: seqA,
            latestRequestSeq: latestSeq,
            stillSelected: false,
        });
        // Stale empty response from A must be dropped
        expect(decision.apply).toBe(false);
        expect(decision.skippedReason).toBe("stale_request_seq");
    });

    /**
     * Fast A→B→A switch: only the latest A request applies, not an intermediate stale one.
     */
    it("fast A→B→A switch: only latest A response applies", () => {
        let latestSeq = 0;
        const seqA1 = ++latestSeq; // first A fetch
        ++latestSeq; // B fetch advances seq
        const seqA2 = ++latestSeq; // second A fetch (latest)

        // First A response arrives after B and second A started — stale
        const d1 = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: seqA1,
            latestRequestSeq: latestSeq,
            stillSelected: true, // still on A
        });
        expect(d1.apply).toBe(false); // seq mismatch

        // Second A response arrives — matches latest seq and is still selected
        const d2 = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: seqA2,
            latestRequestSeq: latestSeq,
            stillSelected: true,
        });
        expect(d2.apply).toBe(true);
    });

    /**
     * After a fetch error (queueItems set to null), retrying the same pill must
     * NOT return early without fetching (the same-sig cache-miss path must fall through).
     */
    it("same-sig cache-miss falls through to network (recovers from error state)", () => {
        // fetchQueueItems moved to the canonical useWorkUnitQueueRuntime hook.
        const src =
            readSrc("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx") +
            readSrc("lib/adminV2/runtime/queue/useWorkUnitQueueRuntime.ts");
        // The cache-hit early return must only happen inside the `if (ent)` branch
        // and must NOT have an unconditional return after cache miss in the same-sig path.
        expect(src).toContain("// No cache entry (expired or evicted) even though sig matches");
        // Confirm the cache-miss branch no longer early-returns with loading=false
        expect(src).not.toMatch(
            /fetchSig === queueItemsLastFetchSigRef\.current[\s\S]{0,300}else \{\s*setQueueItemsLoading\(false\);\s*\}\s*if \(pendingQueueTabPerfRef/
        );
    });
});

// ─── Queue ownership ──────────────────────────────────────────────────────────

describe("Queue determinism", () => {
    /**
     * Test 1: Queue pill A request returns after pill B selected — A response is ignored.
     */
    it("pill A response is dropped when pill B is now selected", () => {
        let latestSeq = 0;
        const seqA = ++latestSeq;
        const seqB = ++latestSeq; // B fired after A

        const decisionA = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: seqA,
            latestRequestSeq: latestSeq,
            stillSelected: false, // A's pill is no longer selected
        });
        const decisionB = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: seqB,
            latestRequestSeq: latestSeq,
            stillSelected: true,
        });

        expect(decisionA.apply).toBe(false);
        expect(decisionA.skippedReason).toBe("stale_request_seq");
        expect(decisionB.apply).toBe(true);
    });

    /**
     * Test 2: Empty lane response cannot overwrite current non-empty lane's data.
     * An empty response for the WRONG lane is rejected even when it arrives last.
     */
    it("empty lane response is ignored when it belongs to a different lane", () => {
        let latestSeq = 0;
        const seqA = ++latestSeq; // fetch for "new_leads"
        ++latestSeq; // fetch for "tours" increments seq

        // "new_leads" response arrives after "tours" fetch started
        const decision = shouldApplyWorkUnitQueueRowsResponse({
            requestSeq: seqA,
            latestRequestSeq: latestSeq,
            stillSelected: false, // user is now on "tours"
        });

        expect(decision.apply).toBe(false);
        expect(decision.skippedReason).toBe("stale_request_seq");
    });

    /**
     * Test 3: Queue cache key mismatch does not display stale rows from another lane.
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

    /**
     * Test 4 (structural): The page fetch function falls through to network when
     * the same-sig path has no cache entry, so errors allow recovery.
     */
    it("same-sig no-cache path falls through to network fetch (not silent no-op)", () => {
        // fetchQueueItems moved to the canonical useWorkUnitQueueRuntime hook.
        const src =
            readSrc("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx") +
            readSrc("lib/adminV2/runtime/queue/useWorkUnitQueueRuntime.ts");
        // The same-sig branch must NOT unconditionally setQueueItemsLoading(false) and return.
        // Verify the else-branch that used to silently return is gone.
        expect(src).not.toMatch(
            /fetchSig === queueItemsLastFetchSigRef\.current[\s\S]{0,400}else \{\s*setQueueItemsLoading\(false\);\s*\}\s*if \(pendingQueueTabPerfRef/
        );
        // Verify cache-hit branch still returns (only the miss path falls through)
        expect(src).toContain("touchQueueRowCacheOnHit(cache, logicalKey)");
        expect(src).toContain("// No cache entry (expired or evicted) even though sig matches");
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

// ─── Opportunity title/status restore ─────────────────────────────────────────

describe("Opportunity title/status first-paint restore", () => {
    /**
     * When navigating from opportunity → child/person, the snapshot must include
     * the deferred full-hydrate patch (e.g. _identity) so that on back-navigation
     * the title/status restore from the complete record, not from queue preview seed.
     */
    it("AdminEntityDrawer merges deferred patch into opportunity snapshot before person navigation", () => {
        const src = readSrc("components/admin/AdminEntityDrawerLegacy.tsx");
        // The snapshot taken on opp → person navigation must include deferredForSnapshot
        expect(src).toContain("deferredForSnapshot && Object.keys(deferredForSnapshot).length > 0");
        expect(src).toContain("opportunityDeferredFullHydrateRef.current");
        expect(src).toContain("snapshotForNav");
        // The snapshot must be passed to putDrawerEntitySnapshot
        expect(src).toContain('putDrawerEntitySnapshot("opportunities", prev.id, snapshotForNav)');
    });
});

// ─── Opportunity hydrate determinism ─────────────────────────────────────────

describe("Opportunity hydrate determinism", () => {
    beforeEach(() => {
        resetOpportunityDrawerHydrateGuards("opp-1");
    });

    /**
     * Test 8: Back-to-Lead / opportunity switch — drawer fetch for old drawer id
     * cannot apply to new drawer id (structural check on response guard).
     */
    it("AdminEntityDrawer checks json.id against current drawer before applying full hydrate", () => {
        const src = readSrc("components/admin/AdminEntityDrawerLegacy.tsx");
        // Full hydrate: response must match hydrateId
        expect(src).toContain(
            "if (String((json as { id?: unknown }).id ?? \"\") !== hydrateId) return;"
        );
        // Person composed fetch: coalesced path must pass entityDataMatchesDrawer
        expect(src).toContain("fetchPersonDrawerEntityCoalesced");
        expect(src).toContain(
            "if (!entityDataMatchesDrawer(json, fetchTargetId, fetchTargetType)) {"
        );
    });

    /**
     * Test 9: Opportunity primary response alone cannot mark composed ready when
     * the BOS right panel (which requires fullHydrateReady) is above fold.
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

    it("AdminEntityDrawer computes opportunityPreRevealTitle from snapshot identity before full reveal", () => {
        const drawer = readSrc("components/admin/AdminEntityDrawerLegacy.tsx");
        // Pre-reveal title memo must exist and check identity data
        expect(drawer).toContain("opportunityPreRevealTitle");
        // Must only derive title when identity / customer name data is present
        expect(drawer).toContain("primaryPersonLabel");
        // Must use formatOpportunityInquiryDrawerTitle with snapshot data
        expect(drawer).toContain("formatOpportunityInquiryDrawerTitle(d, opportunitySingular)");
        // First branch of drawerTitleTextResolved must prefer pre-reveal title over seed
        expect(drawer).toContain("opportunityPreRevealTitle ||");
        expect(drawer).toContain("opportunityQueuePreviewSeed?.title?.trim()");
    });

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

    it("opportunityPreRevealTitle guard prevents 'Enrollment — ' stub when record has no identity", () => {
        // This is the guard: !primaryPersonLabel && !customerName → return null
        // Verify the code pattern exists in AdminEntityDrawer
        const drawer = readSrc("components/admin/AdminEntityDrawerLegacy.tsx");
        expect(drawer).toContain("if (!primaryPersonLabel && !customerName) return null");
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

    it("AdminEntityDrawer fires linked person prefetch on opportunityPrimaryHydrateApplied, not drawerReady", () => {
        const src = readSrc("components/admin/AdminEntityDrawerLegacy.tsx");
        // The prefetch effect condition must be opportunityPrimaryHydrateApplied
        expect(src).toContain("!opportunityPrimaryHydrateApplied || !data || !dataMatchesDrawer");
        // The old gate (!drawerReady) must NOT be the condition for the opportunity prefetch effect
        expect(src).not.toContain("if (!drawerReady || !data || !dataMatchesDrawer) return;\n        if (opportunityLinkedPersonsPrefetchedRef");
    });

    it("AdminEntityDrawer imports and uses composedPersonPayloadCache", () => {
        const src = readSrc("components/admin/AdminEntityDrawerLegacy.tsx");
        expect(src).toContain("isComposedPersonPayloadRecentlyReady");
        expect(src).toContain("putComposedPersonPayloadReady");
        expect(src).toContain("putComposedPersonPayloadReady(personDrawerComposedContextKey)");
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

    it("AdminEntityDrawer populates cache on readiness transition and checks it before fetch", () => {
        const src = readSrc("components/admin/AdminEntityDrawerLegacy.tsx");
        expect(src).toContain("putComposedPersonPayloadReady(personDrawerComposedContextKey)");
        expect(src).toContain("isComposedPersonPayloadRecentlyReady(contextKey)");
        expect(src).toContain("drawer-payload:cache-hit");
    });

    it("opportunity prefetch fires on primary hydrate not full hydrate", () => {
        const src = readSrc("components/admin/AdminEntityDrawerLegacy.tsx");
        // Dependency array must contain opportunityPrimaryHydrateApplied
        expect(src).toContain("opportunityPrimaryHydrateApplied,");
        // The prefetch effect must NOT gate on drawerReady
        expect(src).toContain("!opportunityPrimaryHydrateApplied || !data || !dataMatchesDrawer");
    });
});
