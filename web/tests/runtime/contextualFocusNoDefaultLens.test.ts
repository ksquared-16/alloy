import { describe, expect, it } from "vitest";

import {
    ATTENTION_SCOPE,
    AttentionOwner,
    attentionFromUrl,
    urlFromAttention,
} from "@/lib/runtime/kernel/attention";
import { destinationIdFromAnswer } from "@/lib/runtime/provisioning/provisioningAnswerDestination";
import { workUnitSurfaceModelFromSnapshot } from "@/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot";
import { queueRegionRenderState } from "@/components/presentation/workUnit/QueueRegion";
import {
    hasOperatorSelectedWorkView,
    selectedWorkViewId,
    type ContextualFocusAnswer,
} from "@/lib/runtime/provisioning/contextualFocusAnswer";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/**
 * THE ONE REGRESSION GUARD: an absent Work View may never become a default one.
 *
 * The defect this sprint removes is a single line — `findWorkViewById(...) ?? firstVisibleWorkView(...)`
 * — but the shape of it can reappear anywhere the absence of a lens is handled: encoding, decoding,
 * history restore, cold entry, provisioning, rendering, operator focus. Each of those is a place where
 * `null` could be quietly "helpfully" replaced, and every replacement looks locally reasonable.
 *
 * So this file asserts the absence SURVIVES each hop, rather than asserting any one implementation.
 *
 * The distinction it is protecting, stated once:
 *
 *   lens: null       "no lens was NAMED" — resolve the configured default. What nearly every entry
 *                    href, cold URL and Search click has always sent, and what must keep working.
 *   cohort: "none"   "no cohort was SELECTED" — the operator named a record. Contextual.
 *
 * Collapsing those two is not a hypothetical: `Lennon → Waitlist` has never named its lens either, so
 * a runtime that inferred contextual focus from `lens == null` would make that destination lens-free
 * too, and the pill an operator relies on would go dark for reasons no one could see.
 */

const IDENT = { tenant: "org-1", principal: "user-1" };

const contextualAnswer: ContextualFocusAnswer = {
    terminal: "contextual",
    orgId: "org-1",
    workUnit: {
        id: "wu-1",
        key: "lifecycle_wu_lead",
        name: "Lead",
        departmentId: "dept-1",
    },
    businessProcess: { key: "enrollment", name: "Enrollment" },
    activeWorkView: null,
    lensSet: [
        { id: "wv-new", label: "New", displayOrder: 0 },
        { id: "wv-all", label: "All", displayOrder: 1 },
    ],
    recordOfTruth: { entityType: "opportunity", id: "opp-kurzman" },
    subject: { id: "opp-kurzman", grain: "case", subjectType: "opportunity" },
    aspect: { cardKey: "household", itemId: "person-kelly" },
    timings: { total_ms: 4 },
};

describe("attention keeps the absence of a cohort distinct from the absence of a named lens", () => {
    it("hydration carries a STATED absence of cohort", () => {
        const o = new AttentionOwner();
        const ref = o.hydrate({
            ...IDENT,
            target: "lifecycle-wu-lead",
            lens: null,
            cohort: "none",
            subject: "opp-kurzman",
            source: "direct_url",
        });
        expect(ref.cohort).toBe("none");
        expect(ref.lens).toBeNull();
        // The finest field present decides the scope — a subject with no lens is SUBJECT scope, and
        // that is a legitimate committed state, not a half-built LENS one.
        expect(ref.scope).toBe(ATTENTION_SCOPE.SUBJECT);
    });

    it("an ordinary link that merely omits its lens is NOT contextual", () => {
        const o = new AttentionOwner();
        // Exactly what `Lennon → Waitlist` sends: a host slug and a subject, no `work_view_id`.
        const ref = o.hydrate({
            ...IDENT,
            target: "waitlist",
            lens: null,
            subject: "pi-lennon",
            source: "direct_url",
        });
        expect(ref.cohort).toBeNull();
    });

    it("a SUBJECT movement inherits the cohort answer", () => {
        const o = new AttentionOwner();
        o.hydrate({ ...IDENT, target: "lifecycle-wu-lead", cohort: "none", source: "direct_url" });
        const ref = o.move({
            scope: ATTENTION_SCOPE.SUBJECT,
            subject: "opp-kurzman",
            source: "subject_selection",
        });
        expect(ref.cohort).toBe("none");
    });

    it("an ASPECT movement inherits it too — a card focus is not a cohort choice", () => {
        const o = new AttentionOwner();
        o.hydrate({
            ...IDENT,
            target: "lifecycle-wu-lead",
            cohort: "none",
            subject: "opp-kurzman",
            source: "direct_url",
        });
        const ref = o.move({
            scope: ATTENTION_SCOPE.ASPECT,
            aspect: "card:household|item:person-kelly",
            source: "search",
        });
        expect(ref.cohort).toBe("none");
        expect(ref.lens).toBeNull();
    });

    it("SELECTING a lens is what ends contextual focus", () => {
        const o = new AttentionOwner();
        o.hydrate({
            ...IDENT,
            target: "lifecycle-wu-lead",
            cohort: "none",
            subject: "opp-kurzman",
            source: "direct_url",
        });
        const ref = o.move({ scope: ATTENTION_SCOPE.LENS, lens: "wv-all", source: "work_view_selection" });
        expect(ref.cohort).toBeNull();
        expect(ref.lens).toBe("wv-all");
    });

    it("leaving for another surface does not carry the answer along", () => {
        const o = new AttentionOwner();
        o.hydrate({ ...IDENT, target: "lifecycle-wu-lead", cohort: "none", source: "direct_url" });
        const ref = o.move({ scope: ATTENTION_SCOPE.SURFACE, target: "waitlist", source: "pointer" });
        expect(ref.cohort).toBeNull();
    });
});

describe("the URL projects the absence, so a reload cannot restore a default", () => {
    it("round-trips `cohort=none`", () => {
        const o = new AttentionOwner();
        const ref = o.hydrate({
            ...IDENT,
            target: "lifecycle-wu-lead",
            cohort: "none",
            subject: "opp-kurzman",
            source: "direct_url",
        });
        const url = urlFromAttention(ref);
        expect(url).toContain("cohort=none");
        expect(url).not.toContain("work_view_id");

        const back = attentionFromUrl(new URL(url, "http://local"), IDENT, "reload");
        expect(back?.cohort).toBe("none");
        expect(back?.lens).toBeNull();
    });

    it("a URL with a lens never claims to be contextual as well", () => {
        const o = new AttentionOwner();
        const ref = o.hydrate({ ...IDENT, target: "waitlist", lens: "wv-all", source: "direct_url" });
        const url = urlFromAttention(ref);
        expect(url).toContain("work_view_id=wv-all");
        expect(url).not.toContain("cohort=");
    });

    it("an ordinary URL with no lens is NOT read as contextual", () => {
        const back = attentionFromUrl(
            new URL("http://local/workspace/work-unit/waitlist?subject_id=pi-lennon"),
            IDENT,
            "direct_url",
        );
        expect(back?.cohort).toBeNull();
    });

    it("only the exact token counts — stale or hostile query state cannot suppress a cohort", () => {
        for (const raw of ["", "None", "1", "true", "no-cohort", "none "]) {
            const back = attentionFromUrl(
                new URL(`http://local/workspace/work-unit/waitlist?cohort=${encodeURIComponent(raw)}`),
                IDENT,
                "direct_url",
            );
            expect(back?.cohort, `cohort=${JSON.stringify(raw)}`).toBeNull();
        }
    });
});

describe("the destination records the absence rather than filling it", () => {
    it("a contextual answer maps to a lens-free destination pinned to its subject", () => {
        const id = destinationIdFromAnswer(contextualAnswer);
        expect(id).toEqual({
            workUnitId: "wu-1",
            workViewId: null,
            subjectId: "opp-kurzman",
            focusMode: null,
        });
    });
});

describe("the committed surface renders no selected cohort", () => {
    const model = workUnitSurfaceModelFromSnapshot(contextualAnswer as ProvisioningAnswer);

    it("marks NO pill active, while still offering every cohort", () => {
        expect(model.workViews.map((v) => v.id)).toEqual(["wv-new", "wv-all"]);
        expect(model.workViews.some((v) => v.isActive)).toBe(false);
    });

    it("carries the absence on the model, not the host unit's first view", () => {
        expect(model.activeWorkViewId).toBeNull();
    });

    it("pages nothing and claims no total — there is no cohort to page", () => {
        expect(model.queue.rows).toEqual([]);
        expect(model.queue.totalCount).toBeNull();
        expect(model.queue.loading).toBe(false);
    });

    it("is NOT an error — nothing failed", () => {
        expect(model.queue.error).toBeNull();
    });

    it("says a cohort was not selected, so the queue can tell it apart from an empty one", () => {
        expect(model.queue.cohortSelected).toBe(false);
    });

    it("selects no queue ROW — the subject is not a row and has no rail to render", () => {
        expect(model.selectedRecordId).toBeNull();
        expect(model.selectedSubject).toEqual({ selectedRecordId: null, source: "no_cohort" });
    });

    it("keeps the host's identity, which was never the thing in doubt", () => {
        expect(model.workUnitId).toBe("wu-1");
        expect(model.departmentId).toBe("dept-1");
        expect(model.header.title).toBe("Lead");
    });

    it("reserves no KPI slots for values no cohort will ever settle", () => {
        expect(model.header.kpis).toEqual([]);
    });
});

describe("the queue region distinguishes an empty cohort from no cohort", () => {
    it("no cohort selected renders its own state, never the empty-view copy", () => {
        expect(
            queueRegionRenderState({ rows: [], loading: false, error: null, cohortSelected: false }),
        ).toBe("no-cohort");
    });

    it("a SELECTED cohort holding nothing is still empty", () => {
        expect(
            queueRegionRenderState({ rows: [], loading: false, error: null, cohortSelected: true }),
        ).toBe("empty");
    });

    it("an omitted flag leaves every existing surface exactly where it was", () => {
        expect(queueRegionRenderState({ rows: [], loading: false, error: null })).toBe("empty");
        expect(queueRegionRenderState({ rows: [], loading: true, error: null })).toBe("cold-loading");
        expect(queueRegionRenderState({ rows: [{}], loading: false, error: null })).toBe("rows");
    });

    it("a real failure still surfaces — absence never hides an error", () => {
        expect(
            queueRegionRenderState({ rows: [], loading: false, error: "boom", cohortSelected: false }),
        ).toBe("error");
    });
});

describe("one reading of whether a cohort was selected", () => {
    it("agrees across the predicate and the accessor for every terminal", () => {
        expect(hasOperatorSelectedWorkView(contextualAnswer)).toBe(false);
        expect(selectedWorkViewId(contextualAnswer)).toBeNull();

        const operational = { terminal: "operational", activeWorkView: { id: "wv-all", label: "All" } };
        expect(hasOperatorSelectedWorkView(operational)).toBe(true);
        expect(selectedWorkViewId(operational)).toBe("wv-all");

        // The error terminal carries no such field at all, and must not be guessed either way.
        expect(hasOperatorSelectedWorkView({ terminal: "error" })).toBe(false);
        expect(selectedWorkViewId({ terminal: "error" })).toBeNull();
    });
});
