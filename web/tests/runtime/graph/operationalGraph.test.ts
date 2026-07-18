import { describe, expect, it } from "vitest";

import {
    destinationIdEquals,
    destinationIdKey,
    destinationNodeKey,
    nodeDestinationId,
    parseDestinationIdKey,
    withFocusMode,
    withSubject,
} from "@/lib/runtime/graph/destinationId";
import {
    adjacentWorkViewDestinations,
    defaultWorkViewFor,
    graphRevisionEquals,
    graphRevisionIsSameOrNewer,
    hasDestination,
    siblingWorkViews,
    workUnitsInOrder,
    workViewsOf,
} from "@/lib/runtime/graph/operationalGraph";
import {
    type CompileOperationalGraphInput,
    compileOperationalGraph,
} from "@/lib/runtime/graph/compileOperationalGraph";
import {
    materializeOperationalGraph,
    workViewInputFromStored,
} from "@/lib/runtime/graph/materializeOperationalGraph";

// Two Work Units, one with two views, one with one view.
const BASE_INPUT: CompileOperationalGraphInput = {
    workUnits: [
        { id: "wu-intake", label: "Intake", departmentId: "dept-1", displayOrder: 1 },
        { id: "wu-billing", label: "Billing", departmentId: "dept-2", displayOrder: 2 },
    ],
    workViewsByWorkUnit: {
        "wu-intake": [
            { id: "wv-needs", label: "Needs Attention", lens: "lifecycle_new", displayOrder: 1 },
            { id: "wv-waiting", label: "Waiting", lens: "lifecycle_waiting", displayOrder: 2 },
        ],
        "wu-billing": [{ id: "wv-open", label: "Open", lens: "all", displayOrder: 1 }],
    },
};

describe("DestinationId", () => {
    it("serializes and round-trips through the store key", () => {
        const id = nodeDestinationId("wu-1", "wv-1");
        expect(parseDestinationIdKey(destinationIdKey(id))).toEqual(id);

        const full = withFocusMode(withSubject(id, "subj-9"), "activity");
        expect(parseDestinationIdKey(destinationIdKey(full))).toEqual(full);
    });

    it("keeps null subject/mode distinct from any encoded value", () => {
        const nullish = nodeDestinationId("wu-1", "wv-1");
        const named = withSubject(nullish, "∅-literal");
        expect(destinationIdKey(nullish)).not.toEqual(destinationIdKey(named));
        expect(parseDestinationIdKey(destinationIdKey(named))?.subjectId).toBe("∅-literal");
        expect(parseDestinationIdKey(destinationIdKey(nullish))?.subjectId).toBeNull();
    });

    it("survives delimiter-bearing ids without identity forgery", () => {
        const id = withSubject({ workUnitId: "wu|a", workViewId: "wv:b", subjectId: null, focusMode: null }, "s|x");
        const parsed = parseDestinationIdKey(destinationIdKey(id));
        expect(parsed).toEqual(id);
    });

    it("rejects malformed keys", () => {
        expect(parseDestinationIdKey("garbage")).toBeNull();
        expect(parseDestinationIdKey("wu:a|wv:b|s:∅")).toBeNull(); // too few segments
    });

    it("node key ignores subject and mode", () => {
        const a = withSubject(nodeDestinationId("wu-1", "wv-1"), "s1");
        const b = withFocusMode(nodeDestinationId("wu-1", "wv-1"), "activity");
        expect(destinationNodeKey(a)).toEqual(destinationNodeKey(b));
        expect(destinationIdEquals(a, b)).toBe(false);
    });
});

describe("compileOperationalGraph", () => {
    it("enumerates exactly the reachable (work unit × work view) destinations", () => {
        const graph = compileOperationalGraph(BASE_INPUT);
        expect(graph.destinations).toHaveLength(3);
        expect(graph.destinations.map((d) => [d.workUnitId, d.workViewId])).toEqual([
            ["wu-intake", "wv-needs"],
            ["wu-intake", "wv-waiting"],
            ["wu-billing", "wv-open"],
        ]);
        // every enumerated destination is node-level (subject + mode unresolved)
        expect(graph.destinations.every((d) => d.subjectId === null && d.focusMode === null)).toBe(true);
    });

    it("invents nothing: an unauthorized work unit is simply absent", () => {
        const graph = compileOperationalGraph(BASE_INPUT);
        expect(hasDestination(graph, { workUnitId: "wu-secret", workViewId: "wv-x" })).toBe(false);
        expect(graph.workUnits.has("wu-secret")).toBe(false);
    });

    it("is deterministic and content-addressed (identical input → identical token)", () => {
        expect(compileOperationalGraph(BASE_INPUT).revisionToken).toBe(
            compileOperationalGraph(BASE_INPUT).revisionToken,
        );
    });

    it("changes the revision token when structure changes", () => {
        const a = compileOperationalGraph(BASE_INPUT).revisionToken;
        const withExtra = compileOperationalGraph({
            ...BASE_INPUT,
            workViewsByWorkUnit: {
                ...BASE_INPUT.workViewsByWorkUnit,
                "wu-billing": [
                    { id: "wv-open", label: "Open", lens: "all" },
                    { id: "wv-closed", label: "Closed", lens: "closed" },
                ],
            },
        }).revisionToken;
        expect(withExtra).not.toBe(a);
    });

    it("embeds the explicit revision vector in the token", () => {
        const graph = compileOperationalGraph({
            ...BASE_INPUT,
            revision: { surfaceConfigRevision: 7, authorizationRevision: 3 },
        });
        expect(graph.revision.surfaceConfigRevision).toBe(7);
        expect(graph.revision.authorizationRevision).toBe(3);
        expect(graph.revision.navigationStructureRevision).toBe(0);
        expect(graph.revisionToken.startsWith("7.3.0:")).toBe(true);
    });

    it("drops blank and duplicate ids, keeping the first occurrence", () => {
        const graph = compileOperationalGraph({
            workUnits: [
                { id: "wu-1", departmentId: "d1" },
                { id: "wu-1", departmentId: "d-dup" }, // duplicate → ignored
                { id: "   ", departmentId: "d2" }, // blank → ignored
            ],
            workViewsByWorkUnit: {
                "wu-1": [
                    { id: "wv-a", label: "A" },
                    { id: "wv-a", label: "A-dup" }, // duplicate → ignored
                ],
            },
        });
        expect(graph.workUnits.size).toBe(1);
        expect(graph.workUnits.get("wu-1")?.departmentId).toBe("d1");
        expect(graph.workViews.size).toBe(1);
    });

    it("orders by displayOrder, breaking ties by input order", () => {
        const graph = compileOperationalGraph({
            workUnits: [
                { id: "wu-b", departmentId: "d", displayOrder: 2 },
                { id: "wu-a", departmentId: "d", displayOrder: 1 },
            ],
            workViewsByWorkUnit: {},
        });
        expect(graph.workspace.workUnitIds).toEqual(["wu-a", "wu-b"]);
    });

    it("keeps a work unit with zero views as a node with no destinations", () => {
        const graph = compileOperationalGraph({
            workUnits: [{ id: "wu-empty", departmentId: "d" }],
            workViewsByWorkUnit: {},
        });
        expect(graph.workUnits.has("wu-empty")).toBe(true);
        expect(graph.destinations).toHaveLength(0);
        expect(defaultWorkViewFor(graph, "wu-empty")).toBeNull();
    });
});

describe("adjacency accessors", () => {
    const graph = compileOperationalGraph(BASE_INPUT);

    it("returns work units and views in display order", () => {
        expect(workUnitsInOrder(graph).map((n) => n.id)).toEqual(["wu-intake", "wu-billing"]);
        expect(workViewsOf(graph, "wu-intake").map((n) => n.id)).toEqual(["wv-needs", "wv-waiting"]);
    });

    it("computes sibling views excluding self", () => {
        expect(siblingWorkViews(graph, "wv-needs").map((n) => n.id)).toEqual(["wv-waiting"]);
        expect(siblingWorkViews(graph, "wv-open")).toEqual([]); // only view under its unit
        expect(siblingWorkViews(graph, "unknown")).toEqual([]);
    });

    it("resolves default work view (explicit, else first)", () => {
        expect(defaultWorkViewFor(graph, "wu-intake")?.id).toBe("wv-needs");
        const explicit = compileOperationalGraph({
            ...BASE_INPUT,
            workUnits: [{ id: "wu-intake", departmentId: "dept-1", defaultWorkViewId: "wv-waiting" }],
            workViewsByWorkUnit: { "wu-intake": BASE_INPUT.workViewsByWorkUnit["wu-intake"] },
        });
        expect(defaultWorkViewFor(explicit, "wu-intake")?.id).toBe("wv-waiting");
    });

    it("carries subject and mode across sibling-view adjacency", () => {
        const from = withFocusMode(withSubject(nodeDestinationId("wu-intake", "wv-needs"), "subj-7"), "work");
        const adjacent = adjacentWorkViewDestinations(graph, from);
        expect(adjacent).toEqual([
            { workUnitId: "wu-intake", workViewId: "wv-waiting", subjectId: "subj-7", focusMode: "work" },
        ]);
    });
});

describe("graph revision vector", () => {
    it("compares equality and same-or-newer dominance", () => {
        const base = { surfaceConfigRevision: 1, authorizationRevision: 1, navigationStructureRevision: 1 };
        expect(graphRevisionEquals(base, { ...base })).toBe(true);
        expect(graphRevisionIsSameOrNewer({ ...base, surfaceConfigRevision: 2 }, base)).toBe(true);
        expect(graphRevisionIsSameOrNewer(base, base)).toBe(true);
        expect(graphRevisionIsSameOrNewer({ ...base, authorizationRevision: 0 }, base)).toBe(false);
    });
});

describe("materializeOperationalGraph", () => {
    it("maps the client nav tree + resolved views into the compiled graph", () => {
        const graph = materializeOperationalGraph({
            workUnits: [
                { id: "wu-intake", name: "Intake", department_id: "dept-1" },
                { id: "wu-billing", name: "Billing", department_id: "dept-2" },
            ],
            resolveWorkViews: (wu) =>
                wu.id === "wu-intake"
                    ? [
                          workViewInputFromStored({ id: "wv-needs", label: "Needs Attention", compat_queue_key: "lifecycle_new" }),
                          workViewInputFromStored({ id: "wv-waiting", label: "Waiting", compat_queue_key: "lifecycle_waiting" }),
                      ]
                    : [workViewInputFromStored({ id: "wv-open", label: "Open" })],
        });
        expect(workUnitsInOrder(graph).map((n) => n.id)).toEqual(["wu-intake", "wu-billing"]);
        expect(graph.destinations).toHaveLength(3);
        expect(graph.workViews.get("wv-needs")?.lens).toBe("lifecycle_new");
        // a view without a compat_queue_key binds its lens to the view id
        expect(graph.workViews.get("wv-open")?.lens).toBe("wv-open");
    });
});
