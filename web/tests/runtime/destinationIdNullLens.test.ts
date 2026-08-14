import { describe, expect, it } from "vitest";

import {
    destinationIdEquals,
    destinationIdKey,
    destinationNodeKey,
    nodeDestinationId,
    parseDestinationIdKey,
    type DestinationId,
} from "@/lib/runtime/graph/destinationId";

/**
 * A DESTINATION MAY HAVE NO WORK VIEW.
 *
 * `workViewId` was `string`, so the canonical destination identity could not represent "the operator
 * opened a record without choosing a cohort". Contextual focus was therefore unrestorable: Back would
 * have nothing to key on and would fall through to whatever the surface resolved — the host unit's
 * default lens, which is the original `Kelly → Household` shows `New` defect arriving by another road.
 *
 * The dimension is now optional, and `null` means **not selected** — never "use the default".
 */

const contextual: DestinationId = {
    workUnitId: "wu-lifecycle-lead",
    workViewId: null,
    subjectId: "person-kelly",
    focusMode: null,
};

const operational: DestinationId = {
    workUnitId: "wu-lifecycle-lead",
    workViewId: "new_leads",
    subjectId: "opp-kurzman",
    focusMode: null,
};

describe("a lens-free destination is a first-class identity", () => {
    it("ROUND-TRIPS through the key exactly", () => {
        // The whole reason Option 1 was chosen: history must be able to restore this state.
        const restored = parseDestinationIdKey(destinationIdKey(contextual));
        expect(restored).toEqual(contextual);
        expect(restored!.workViewId).toBeNull();
    });

    it("the absent lens NEVER decodes into a default", () => {
        // The single most important assertion here. A restore that substituted a lens would put the
        // operator in a cohort they never chose, and it would look like their own navigation.
        const restored = parseDestinationIdKey(destinationIdKey(contextual))!;
        expect(restored.workViewId).not.toBe("new_leads");
        expect(restored.workViewId).toBeNull();
    });

    it("is NOT equal to any cohort destination on the same host", () => {
        expect(destinationIdEquals(contextual, operational)).toBe(false);
        expect(destinationIdEquals(contextual, { ...contextual })).toBe(true);
    });

    it("occupies its OWN graph node, distinct from every cohort on that host", () => {
        // Sharing a node with `New` would let a contextual state be prepared, cached and restored as
        // that cohort.
        expect(destinationNodeKey(contextual)).not.toBe(destinationNodeKey(operational));
    });

    it("the host is still REQUIRED — a destination with no work unit is not a place", () => {
        expect(parseDestinationIdKey("wu:|wv:∅|s:∅|m:∅")).toBeNull();
    });

    it("operational destinations are untouched by the change", () => {
        // The migration must not alter the existing dimension's behaviour in any way.
        expect(parseDestinationIdKey(destinationIdKey(operational))).toEqual(operational);
        expect(nodeDestinationId("wu-1", "all_work")).toEqual({
            workUnitId: "wu-1",
            workViewId: "all_work",
            subjectId: null,
            focusMode: null,
        });
    });

    it("a node-level destination can be constructed with no lens", () => {
        expect(nodeDestinationId("wu-1", null).workViewId).toBeNull();
    });

    it("a lens literally named like the sentinel does not collide with absence", () => {
        // The sentinel is only meaningful unescaped; a real value is percent-encoded, so a tenant
        // cannot author a view id that impersonates "no view".
        const odd: DestinationId = { ...contextual, workViewId: "∅" };
        expect(destinationIdKey(odd)).not.toBe(destinationIdKey(contextual));
        expect(parseDestinationIdKey(destinationIdKey(odd))!.workViewId).toBe("∅");
    });
});
