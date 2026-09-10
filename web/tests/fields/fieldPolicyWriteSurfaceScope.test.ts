import { describe, expect, it } from "vitest";

import { evaluateDrawerFieldPoliciesOnPatch } from "@/lib/fields/enforceDrawerFieldPoliciesOnPatch";
import { buildSimpleInteractionPolicy, buildSimpleRequirementPolicy } from "@/lib/fields/fieldPolicySettingsUi";
import { parseFieldPolicyWriteSurface } from "@/lib/fields/fieldPolicyWriteContext";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

/**
 * A LAYOUT PLACEMENT FROZE AN ENTIRE TENANT.
 *
 * One entry in `config_json.field_placements_v1` marked `source` required on `drawer_overview`.
 * Enforcement discarded the surface and applied it to every PATCH from every origin, so every
 * opportunity in the org became unwritable — a no-op resend of a record's own unchanged name
 * returned 400, and so did every stage transition. Nobody authored that rule.
 *
 * The fix is not to relax the requirement. It is to enforce it where it was written.
 */

/** `source` is optional on the field definition — exactly as the live tenant has it. */
const sourceDef = {
    id: "d-source",
    field_key: "source",
    field_type: "text",
    is_system: true,
    is_required: false,
    requirement_policy: buildSimpleRequirementPolicy("optional"),
    interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "source"),
};

/** `name` carries an org-wide requirement on the DEFINITION. Unscoped: it must hold everywhere. */
const nameDef = {
    id: "d-name",
    field_key: "name",
    field_type: "text",
    is_system: true,
    is_required: true,
    requirement_policy: buildSimpleRequirementPolicy("required"),
    interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "name"),
};

/** The live placement, verbatim in shape: required on the drawer overview and nowhere else. */
const SOURCE_REQUIRED_ON_DRAWER: RecordLayoutConfigJson = {
    field_placements_v1: [
        {
            field_key: "source",
            surfaces: { drawer_overview: { requirement: buildSimpleRequirementPolicy("required") } },
        },
    ],
} as unknown as RecordLayoutConfigJson;

/** A legacy record: created before the placement existed, so it has no source. */
const legacyRecord = { id: "opp-1", name: "Certopp Family", source: null, status_key: "lead" };

function evaluate(body: Record<string, unknown>, writeSurface: "drawer_overview" | null) {
    return evaluateDrawerFieldPoliciesOnPatch({
        entityType: "opportunity",
        defs: [sourceDef, nameDef],
        body,
        persisted: legacyRecord,
        layoutConfig: SOURCE_REQUIRED_ON_DRAWER,
        writeSurface,
    });
}

function violatedKeys(result: ReturnType<typeof evaluate>): string[] {
    return result.ok ? [] : result.violations.map((v) => v.field_key);
}

describe("a surface-scoped requirement is enforced on its surface", () => {
    it("blocks a drawer-overview save when the field it governs is missing", () => {
        // The authored rule, doing exactly its job. This is the case that must NOT regress into
        // permissiveness while fixing the freeze.
        const r = evaluate({ name: "Certopp Family" }, "drawer_overview");
        expect(r.ok).toBe(false);
        expect(violatedKeys(r)).toContain("source");
    });

    it("lets the same save through once the value is supplied on that surface", () => {
        const r = evaluate({ source: "Referral" }, "drawer_overview");
        expect(r.ok).toBe(true);
    });

    it("treats an empty string as still missing", () => {
        const r = evaluate({ source: "   " }, "drawer_overview");
        expect(r.ok).toBe(false);
        expect(violatedKeys(r)).toContain("source");
    });
});

describe("a surface-scoped requirement does not reach writes from other origins", () => {
    it("does not block a stage transition", () => {
        // `{status_key}` from the Focus Panel transition panel. It declares no surface because it is
        // not editing the drawer overview — it is moving the family forward.
        const r = evaluate({ status_key: "tour" }, null);
        expect(r.ok).toBe(true);
    });

    it("does not block a command or relationship mutation", () => {
        const r = evaluate({ assigned_to: "user-7" }, null);
        expect(r.ok).toBe(true);
    });

    it("does not block a record re-save of its own unchanged value", () => {
        /*
         * The symptom that proved the freeze was total: resending the record's own name failed.
         * A record that cannot restate what it already says is not being validated, it is bricked.
         */
        const r = evaluate({ name: legacyRecord.name }, null);
        expect(r.ok).toBe(true);
    });
});

describe("unscoped requirements are untouched by this change", () => {
    it("still enforces a definition-level requirement from an origin that declares no surface", () => {
        // `name` is required on the FIELD, not on a placement. It has no surface scope to respect,
        // so it must hold everywhere — otherwise this fix would be a wholesale bypass.
        const r = evaluate({ name: "" }, null);
        expect(r.ok).toBe(false);
        expect(violatedKeys(r)).toContain("name");
    });

    it("still enforces a definition-level requirement on the drawer overview", () => {
        const r = evaluate({ name: "", source: "Referral" }, "drawer_overview");
        expect(r.ok).toBe(false);
        expect(violatedKeys(r)).toContain("name");
    });

    it("enforces both layers together when a drawer save is missing both", () => {
        const r = evaluate({ name: "" }, "drawer_overview");
        expect(r.ok).toBe(false);
        expect(violatedKeys(r)).toEqual(expect.arrayContaining(["name", "source"]));
    });
});

describe("requirement kinds this enforcer never owned stay where they are", () => {
    /*
     * `required_before_status_change` / `required_before_action` / non-save scopes are "advanced"
     * policies: `requirementPolicyEnforceableOnSave` has always excluded them from the save path,
     * and they are evaluated by the lifecycle/action engines instead. Pinned here so the surface
     * change cannot be read as having moved them.
     */
    const advanced = (mode: "required_before_status_change" | "required_before_action") => ({
        id: `d-${mode}`,
        field_key: "lost_reason",
        field_type: "text",
        is_system: true,
        is_required: true,
        requirement_policy: {
            version: 1 as const,
            mode,
            validation_scope: mode === "required_before_action" ? ("action" as const) : ("status_change" as const),
            status_keys: mode === "required_before_status_change" ? ["closed"] : null,
            action_keys: mode === "required_before_action" ? ["close_lead"] : null,
        },
        interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "lost_reason"),
    });

    it.each(["required_before_status_change", "required_before_action"] as const)(
        "leaves %s to its own engine on both surfaces",
        (mode) => {
            for (const surface of ["drawer_overview", null] as const) {
                const r = evaluateDrawerFieldPoliciesOnPatch({
                    entityType: "opportunity",
                    defs: [advanced(mode)],
                    body: { name: "x" },
                    persisted: { ...legacyRecord, lost_reason: null },
                    layoutConfig: SOURCE_REQUIRED_ON_DRAWER,
                    writeSurface: surface,
                });
                expect(r.ok).toBe(true);
            }
        }
    );

    it("keeps an `all`-scope definition requirement global", () => {
        const allScope = {
            ...nameDef,
            id: "d-all",
            requirement_policy: { version: 1 as const, mode: "required" as const, validation_scope: "all" as const },
        };
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "opportunity",
            defs: [allScope],
            body: { name: "" },
            persisted: legacyRecord,
            layoutConfig: SOURCE_REQUIRED_ON_DRAWER,
            writeSurface: null,
        });
        expect(r.ok).toBe(false);
        expect(violatedKeys(r)).toContain("name");
    });
});

describe("the declared surface is read, never guessed", () => {
    it("accepts only known surfaces and discards anything else", () => {
        expect(parseFieldPolicyWriteSurface("drawer_overview")).toBe("drawer_overview");
        expect(parseFieldPolicyWriteSurface("  DRAWER_OVERVIEW ")).toBe("drawer_overview");
        // A caller cannot invent a surface to dodge a rule, and a typo fails closed to "unscoped"
        // rather than silently matching.
        expect(parseFieldPolicyWriteSurface("drawer-overview")).toBeNull();
        expect(parseFieldPolicyWriteSurface("focus_panel")).toBeNull();
        expect(parseFieldPolicyWriteSurface("")).toBeNull();
        expect(parseFieldPolicyWriteSurface(null)).toBeNull();
        expect(parseFieldPolicyWriteSurface(42)).toBeNull();
    });
});

describe("LEGACY RECORDS — publishing a requirement does not brick the installed base", () => {
    /*
     * The real migration scenario, start to finish. Existing records have no source. An admin then
     * publishes a surface requirement for it. What must NOT happen is what did happen: every record
     * that predates the requirement becoming globally unwritable.
     */
    it("keeps records that predate the requirement fully operational", () => {
        // 1-3. The requirement is live; the legacy record has source = null; operational writes work.
        expect(evaluate({ status_key: "tour" }, null).ok).toBe(true);
        expect(evaluate({ assigned_to: "user-7" }, null).ok).toBe(true);
        expect(evaluate({ name: legacyRecord.name }, null).ok).toBe(true);

        // 4. On the surface that owns the rule, the gap is real and reported.
        const onSurface = evaluate({ name: legacyRecord.name }, "drawer_overview");
        expect(onSurface.ok).toBe(false);
        expect(violatedKeys(onSurface)).toContain("source");

        // 5-6. The operator resolves it there, and the requirement is satisfied.
        expect(evaluate({ source: "Referral" }, "drawer_overview").ok).toBe(true);

        // 7. And with the value persisted, that surface is clean for every later write.
        const resolved = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "opportunity",
            defs: [sourceDef, nameDef],
            body: { name: "Certopp Family" },
            persisted: { ...legacyRecord, source: "Referral" },
            layoutConfig: SOURCE_REQUIRED_ON_DRAWER,
            writeSurface: "drawer_overview",
        });
        expect(resolved.ok).toBe(true);
    });
});
