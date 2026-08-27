/**
 * The two authoring actions that were missing.
 *
 * Alloy declared `form` requirements authorable and entry intents configurable, and then had no way
 * to author either: 14 library modules read, resolved, normalized, published and consumed
 * `requirements_v1`, and no route wrote it. `entry_points_v1` was the same. A fully authenticated
 * admin could not set either value, which is why the certification could not publish a revision.
 *
 * These controls are in two registers, and the difference matters:
 *
 *   • BEHAVIOURAL — the mutation helpers and the guards the route delegates to. Real assertions on
 *     real values.
 *   • SOURCE — that the real PATCH switch reaches those helpers, behind the handler's existing
 *     authorization. This route has no HTTP harness in this suite, and the established idiom here
 *     (see `reorderStageDraftAuthority`, `draftPersistenceConvergence`) is to read the route source.
 *     A source control proves wiring, never behaviour, and is labelled as such.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    parseLifecycleBuilderV1,
    serializeLifecycleBuilderV1,
    setProcessEntryPoint,
    setStageRequirements,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    isAuthorableRequirementKind,
    parseStageRequirementsV1,
    REQUIREMENT_KINDS_V1,
} from "@/lib/lifecycle/stageRequirementsV1";
import { isProcessEntryIntent } from "@/lib/lifecycle/processEntryPointsV1";

const ROUTE = readFileSync(
    resolve(__dirname, "../../app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts"),
    "utf8",
);

const FORM_A = "17bc2de8-0f83-48a6-aabc-bcd72725bce8";
const FORM_B = "9a86ec71-e589-41d8-bd09-617dfe23d0d8";
const DESCRIPTION = "Lead to enrolled — inquiry, tour, decision, placement.";

/** A draft with the shape that matters: a description, an unknown field, and two stages. */
function draft(): LifecycleBuilderV1 {
    return parseLifecycleBuilderV1({
        version: 1,
        active_process_id: "proc-1",
        processes: [
            {
                id: "proc-1",
                key: "enrollment",
                name: "Enrollment",
                description: DESCRIPTION,
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                future_section_v9: { keep: true },
                stages: [
                    { id: "s1", key: "waitlist", label: "Waitlist", sort_order: 0, is_active: true },
                    {
                        id: "s2",
                        key: "enrolling",
                        label: "Enrolling",
                        description: "The parent completes the paperwork.",
                        sort_order: 1,
                        is_active: true,
                        future_stage_field: { keep: true },
                    },
                ],
            },
        ],
    })!;
}

const requirement = (id: string, formId: string) => ({
    requirement_id: id,
    kind: "form",
    form_definition_id: formId,
    level: "required",
    scope: "record",
    timing: "stage_exit",
    enforcement: "blocking",
});

const parseRequirements = (rows: unknown[]) => parseStageRequirementsV1({ version: 1, requirements: rows })!;
const roundTrip = (c: LifecycleBuilderV1) => parseLifecycleBuilderV1(serializeLifecycleBuilderV1(c))!;
/**
 * The STORED shape. Unknown fields ride a symbol-keyed residue on the parsed record and are spread
 * back into plain keys only at serialize time, so a residue assertion has to read the payload —
 * reading the parsed record would look like data loss that is not there.
 */
const stored = (c: LifecycleBuilderV1) => serializeLifecycleBuilderV1(c) as Record<string, any>;
const proc = (c: LifecycleBuilderV1) => c.processes[0]!;
const stage = (c: LifecycleBuilderV1, key: string) => proc(c).stages.find((s) => s.key === key)!;

// ─────────────────────────────────────────────────────────────────────────────
// Action A — set_process_entry_point
// ─────────────────────────────────────────────────────────────────────────────

describe("set_process_entry_point", () => {
    it("survives save → parse → serialize", () => {
        const out = roundTrip(setProcessEntryPoint(draft(), "proc-1", "enrollment_start", "enrolling"));
        expect(proc(out).entry_points_v1).toEqual({ version: 1, by_intent: { enrollment_start: "enrolling" } });
    });

    it("preserves every other authored mapping", () => {
        // Two intents are independent statements. Authoring one must never retract the other.
        const withLead = setProcessEntryPoint(draft(), "proc-1", "create_lead", "waitlist");
        const both = setProcessEntryPoint(withLead, "proc-1", "enrollment_start", "enrolling");
        expect(proc(roundTrip(both)).entry_points_v1!.by_intent).toEqual({
            create_lead: "waitlist",
            enrollment_start: "enrolling",
        });
    });

    it("updates an existing mapping in place rather than duplicating it", () => {
        const once = setProcessEntryPoint(draft(), "proc-1", "enrollment_start", "waitlist");
        const twice = setProcessEntryPoint(once, "proc-1", "enrollment_start", "enrolling");
        expect(proc(roundTrip(twice)).entry_points_v1!.by_intent).toEqual({ enrollment_start: "enrolling" });
    });

    it("leaves the rest of the process untouched", () => {
        const out = roundTrip(setProcessEntryPoint(draft(), "proc-1", "enrollment_start", "enrolling"));
        expect(proc(out).description).toBe(DESCRIPTION);
        expect(stored(out).processes[0].future_section_v9).toEqual({ keep: true });
        expect(proc(out).stages.map((s) => s.key)).toEqual(["waitlist", "enrolling"]);
        expect(stage(out, "enrolling").requirements_v1).toBeUndefined();
    });

    it("refuses an unknown intent through the guard the route uses", () => {
        expect(isProcessEntryIntent("enrollment_start")).toBe(true);
        expect(isProcessEntryIntent("start_enrollment")).toBe(false);
        expect(isProcessEntryIntent("")).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action B — set_stage_requirements
// ─────────────────────────────────────────────────────────────────────────────

describe("set_stage_requirements", () => {
    it("survives save → parse → serialize exactly", () => {
        const out = roundTrip(
            setStageRequirements(draft(), "proc-1", "enrolling", parseRequirements([requirement("r1", FORM_A), requirement("r2", FORM_B)])),
        );
        const reqs = stage(out, "enrolling").requirements_v1!;
        expect(reqs.version).toBe(1);
        expect(reqs.requirements).toHaveLength(2);
        expect(reqs.requirements[0]).toMatchObject({
            requirement_id: "r1",
            ref: { kind: "form", form_definition_id: FORM_A },
            level: "required",
            scope: "record",
            timing: "stage_exit",
            enforcement: "blocking",
        });
        // Order is the authored order — it is the order the family meets the artifacts in.
        expect(reqs.requirements.map((r) => r.requirement_id)).toEqual(["r1", "r2"]);
    });

    it("keeps an authored EMPTY section distinct from an absent one", () => {
        // D-90: presence is authority. Authored `[]` means canonical requires nothing; absent means
        // canonical is silent and the legacy projection still answers. Collapsing them silently
        // switches which authority a stage has.
        const authoredEmpty = roundTrip(setStageRequirements(draft(), "proc-1", "enrolling", parseRequirements([])));
        expect(stage(authoredEmpty, "enrolling").requirements_v1).toEqual({ version: 1, requirements: [] });
        expect(stage(draft(), "enrolling").requirements_v1).toBeUndefined();
    });

    it("replaces rather than merges — so a requirement can actually be removed", () => {
        const two = setStageRequirements(draft(), "proc-1", "enrolling", parseRequirements([requirement("r1", FORM_A), requirement("r2", FORM_B)]));
        const one = setStageRequirements(two, "proc-1", "enrolling", parseRequirements([requirement("r2", FORM_B)]));
        expect(stage(roundTrip(one), "enrolling").requirements_v1!.requirements.map((r) => r.requirement_id)).toEqual(["r2"]);
    });

    it("touches exactly one stage", () => {
        const out = roundTrip(setStageRequirements(draft(), "proc-1", "enrolling", parseRequirements([requirement("r1", FORM_A)])));
        expect(stage(out, "waitlist").requirements_v1).toBeUndefined();
        expect(stage(out, "enrolling").description).toBe("The parent completes the paperwork.");
        expect(stored(out).processes[0].stages[1].future_stage_field).toEqual({ keep: true });
        expect(proc(out).description).toBe(DESCRIPTION);
    });

    it("refuses an unauthorable kind through the guard the route uses", () => {
        expect(isAuthorableRequirementKind("form")).toBe(true);
        expect(isAuthorableRequirementKind("field")).toBe(true);
        for (const kind of REQUIREMENT_KINDS_V1.filter((k) => k !== "form" && k !== "field")) {
            expect(isAuthorableRequirementKind(kind), kind).toBe(false);
        }
    });

    it("does not silently accept a malformed row", () => {
        // The canonical parser SKIPS an unreadable row, which is right for reading stored config and
        // wrong for authoring: four of five accepted would report a requirement that does not exist.
        // The route compares counts, so this asymmetry is what that guard detects.
        const rows = [requirement("r1", FORM_A), { requirement_id: "r2", kind: "form" /* no form_definition_id */, level: "required" }];
        expect(parseRequirements(rows).requirements).toHaveLength(1);
        expect(rows).toHaveLength(2);
    });

    it("drops a duplicate requirement_id, which the count guard then catches", () => {
        const rows = [requirement("r1", FORM_A), requirement("r1", FORM_B)];
        expect(parseRequirements(rows).requirements).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Both together — the certification shape
// ─────────────────────────────────────────────────────────────────────────────

describe("both actions on one draft", () => {
    it("compose without disturbing each other or anything else", () => {
        const authored = setStageRequirements(
            setProcessEntryPoint(draft(), "proc-1", "enrollment_start", "enrolling"),
            "proc-1",
            "enrolling",
            parseRequirements([requirement("r1", FORM_A), requirement("r2", FORM_B)]),
        );
        const out = roundTrip(authored);
        expect(proc(out).entry_points_v1!.by_intent).toEqual({ enrollment_start: "enrolling" });
        expect(stage(out, "enrolling").requirements_v1!.requirements).toHaveLength(2);
        expect(proc(out).description).toBe(DESCRIPTION);
        expect(stored(out).processes[0].future_section_v9).toEqual({ keep: true });
    });

    it("adds nothing to a draft neither action touched — normalization is not widened", () => {
        // If authoring materialized defaults on the way through, the pre-publish diff would stop
        // being able to say "only the authorized keys moved".
        const before = serializeLifecycleBuilderV1(draft());
        const after = serializeLifecycleBuilderV1(roundTrip(draft()));
        expect(after).toEqual(before);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring — SOURCE controls. These prove reachability, not behaviour.
// ─────────────────────────────────────────────────────────────────────────────

describe("the real PATCH handler reaches both actions", () => {
    it("declares both cases in the one action switch", () => {
        expect(ROUTE).toContain('case "set_process_entry_point":');
        expect(ROUTE).toContain('case "set_stage_requirements":');
    });

    it("delegates to the canonical mutation helpers", () => {
        expect(ROUTE).toContain("config = setProcessEntryPoint(config, processId, intentRaw, stageKey);");
        expect(ROUTE).toContain("config = setStageRequirements(config, processId, stageKey, parsed);");
    });

    it("uses the existing guards rather than a second validator", () => {
        expect(ROUTE).toContain("isProcessEntryIntent(intentRaw)");
        expect(ROUTE).toContain("parseStageRequirementsV1({ version: 1, requirements: body.requirements })");
        expect(ROUTE).toContain("isAuthorableRequirementKind(requirement.ref.kind)");
    });

    it("inherits the handler's authorization boundary — no second entry point", () => {
        // Both actions live inside the same PATCH, after the same admin/role/department-scope
        // guards. There is no separate export and no bypass.
        // Scoped to the PATCH body: the file also exports a GET, and an unscoped indexOf would
        // measure that handler's guards instead — the identity mistake that makes an assertion pass
        // vacuously.
        const patchAt = ROUTE.indexOf("export async function PATCH");
        expect(patchAt).toBeGreaterThan(-1);
        const patch = ROUTE.slice(patchAt);
        const authAt = patch.indexOf('ctx.role !== "admin"');
        const scopeAt = patch.indexOf("departmentIdAllowed(dim, departmentId)");
        const switchAt = patch.indexOf("switch (action)");
        expect(authAt).toBeGreaterThan(-1);
        expect(scopeAt).toBeGreaterThan(authAt);
        expect(switchAt).toBeGreaterThan(scopeAt);
        expect(patch.indexOf('case "set_process_entry_point":')).toBeGreaterThan(switchAt);
        expect(patch.indexOf('case "set_stage_requirements":')).toBeGreaterThan(switchAt);
        expect(ROUTE.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g)).toEqual([
            "export async function GET",
            "export async function PATCH",
        ]);
    });

    it("refuses unknown process and unknown stage before mutating", () => {
        expect(ROUTE).toContain('{ error: "Unknown process" }, { status: 404 }');
        expect(ROUTE).toContain('{ error: `Unknown stage "${stageKey}"` }, { status: 404 }');
        expect(ROUTE).toContain("st.key === stageKey && st.is_active");
    });

    it("saves through the one draft owner", () => {
        expect(ROUTE).toContain("saveDraft(draftClient");
        expect(ROUTE).not.toContain("from(\"business_process_revisions\")");
    });
});
