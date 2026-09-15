/**
 * TRANSPORT FRAMES MAY DIFFER IN FRESHNESS. THEY MAY NOT DIFFER IN SUBJECT.
 *
 * The settled Drawer frame projects child-scoped operational truth. Until now it could not be told
 * WHICH child: the route accepted `department_id` and `work_unit_id` and nothing else, so the
 * composer built its operational context from the FAMILY record with `selectedParticipationId: null`
 * and the canonical fallback answered `sole_participant` — which, measured on a multi-child family,
 * resolved a different member than the surface was scoped to.
 *
 * These tests cover the two halves of carrying the subject: the REQUEST must name it, and the CACHE
 * must key on it. The second is the quiet one — a correct request whose answer is filed under the
 * record alone is served back for the next child, and the identity is lost after the fetch that got
 * it right.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { buildOpportunityDrawerViewModelUrl } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";
import {
    buildDrawerViewModelCacheKey,
    clearDrawerViewModelSessionCacheForTests,
    invalidateDrawerViewModelCacheForEntity,
    peekDrawerViewModelCacheEntry,
    putDrawerViewModelCacheEntry,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import {
    resolveOpportunityDrawerVmCacheContext,
    resolveOpportunityDrawerVmCacheKey,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmCacheScope";

const FAMILY = "7b2f1c60-0000-4000-8000-00000000fam1";
const CHILD_A = "1054ae3e-cc6d-4ae5-8797-92c331bb360a";
const CHILD_B = "50b19065-51fd-41e4-83c9-07ba787759f0";

const entry = (id: string) =>
    ({
        entityType: "opportunities",
        entityId: id,
        surface: "opportunity",
        preload: { marker: id } as never,
        generation: "g1",
        cachedAt: Date.now(),
    }) as const;

describe("the Drawer request names the subject of attention", () => {
    it("carries it as a query parameter the route can read", () => {
        const url = buildOpportunityDrawerViewModelUrl(FAMILY, {
            work_unit_id: "wu-1",
            department_id: "dept-1",
            attention_subject_id: CHILD_A,
        });
        expect(url).toContain(`attention_subject_id=${CHILD_A}`);
    });

    it("omits it when no child is selected — family grain is a real answer, not a missing one", () => {
        const url = buildOpportunityDrawerViewModelUrl(FAMILY, {
            work_unit_id: "wu-1",
            department_id: "dept-1",
        });
        expect(url).not.toContain("attention_subject_id");
    });

    it("names it even when the transport owner knows no department or work unit", () => {
        // The Focus Panel's record-work runtime never reads the drawer store, so attention is the
        // only scope it can assert. An empty department must not suppress the subject.
        const url = buildOpportunityDrawerViewModelUrl(FAMILY, {
            work_unit_id: "",
            department_id: "",
            attention_subject_id: CHILD_B,
        });
        expect(url).toContain(`attention_subject_id=${CHILD_B}`);
        expect(url).not.toContain("department_id");
    });
});

describe("cache identity distinguishes one record under different children", () => {
    beforeEach(() => clearDrawerViewModelSessionCacheForTests());

    it("keys the same record differently under Child A and Child B", () => {
        const base = { entityType: "opportunities", entityId: FAMILY, surface: "opportunity" } as const;
        const a = buildDrawerViewModelCacheKey({ ...base, context: { attentionSubjectId: CHILD_A } });
        const b = buildDrawerViewModelCacheKey({ ...base, context: { attentionSubjectId: CHILD_B } });
        expect(a).not.toEqual(b);
    });

    it("DOES NOT serve Child A's view model to Child B", () => {
        const a = resolveOpportunityDrawerVmCacheKey({
            opportunityId: FAMILY,
            workspaceContext: { work_unit_id: "wu-1", department_id: "d-1", attention_subject_id: CHILD_A },
        });
        putDrawerViewModelCacheEntry(entry(FAMILY), a.context);

        const b = resolveOpportunityDrawerVmCacheKey({
            opportunityId: FAMILY,
            workspaceContext: { work_unit_id: "wu-1", department_id: "d-1", attention_subject_id: CHILD_B },
        });
        // Same record, same department, same work unit — a DIFFERENT operational answer.
        expect(
            peekDrawerViewModelCacheEntry({
                entityType: "opportunities",
                entityId: FAMILY,
                surface: "opportunity",
                context: b.context,
            }),
        ).toBeNull();

        // And the entry that WAS written is still reachable under the child it was fetched for.
        expect(
            peekDrawerViewModelCacheEntry({
                entityType: "opportunities",
                entityId: FAMILY,
                surface: "opportunity",
                context: a.context,
            }),
        ).not.toBeNull();
    });

    it("treats attention alone as a scope, so an unscoped transport cannot collapse two children", () => {
        // This returned null before — and a null context keys every child of a record to ONE entry.
        const a = resolveOpportunityDrawerVmCacheContext({
            workspaceContext: { work_unit_id: "", department_id: "", attention_subject_id: CHILD_A },
        });
        const b = resolveOpportunityDrawerVmCacheContext({
            workspaceContext: { work_unit_id: "", department_id: "", attention_subject_id: CHILD_B },
        });
        expect(a?.attentionSubjectId).toBe(CHILD_A);
        expect(b?.attentionSubjectId).toBe(CHILD_B);
    });

    it("still returns no scope when nothing is named at all", () => {
        expect(
            resolveOpportunityDrawerVmCacheContext({
                workspaceContext: { work_unit_id: "", department_id: "" },
            }),
        ).toBeNull();
    });

    it("invalidates EVERY child's entry for a record, because the record is what changed", () => {
        const ctx = (child: string | null) => ({
            departmentId: "d-1",
            workUnitId: "wu-1",
            attentionSubjectId: child,
        });
        putDrawerViewModelCacheEntry(entry(FAMILY), ctx(CHILD_A));
        putDrawerViewModelCacheEntry(entry(FAMILY), ctx(CHILD_B));
        putDrawerViewModelCacheEntry(entry(FAMILY), ctx(null));

        invalidateDrawerViewModelCacheForEntity("opportunities", FAMILY, {
            departmentId: "d-1",
            workUnitId: "wu-1",
        });

        for (const child of [CHILD_A, CHILD_B, null]) {
            expect(
                peekDrawerViewModelCacheEntry({
                    entityType: "opportunities",
                    entityId: FAMILY,
                    surface: "opportunity",
                    context: ctx(child),
                }),
                `a mutation to the record is equally true under ${child ?? "no child"}`,
            ).toBeNull();
        }
    });

    it("does not invalidate a different work unit whose id merely starts the same", () => {
        // The scope prefix keeps its trailing separator, so "wu-1" cannot sweep "wu-12".
        const keep = { departmentId: "d-1", workUnitId: "wu-12", attentionSubjectId: CHILD_A };
        putDrawerViewModelCacheEntry(entry(FAMILY), keep);
        invalidateDrawerViewModelCacheForEntity("opportunities", FAMILY, {
            departmentId: "d-1",
            workUnitId: "wu-1",
        });
        expect(
            peekDrawerViewModelCacheEntry({
                entityType: "opportunities",
                entityId: FAMILY,
                surface: "opportunity",
                context: keep,
            }),
        ).not.toBeNull();
    });
});
