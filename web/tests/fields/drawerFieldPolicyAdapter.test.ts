import { describe, expect, it } from "vitest";
import {
    attachDrawerFieldPolicyResolution,
    buildDrawerFieldPolicyResolvedMap,
    resolveDrawerFieldPolicy,
    summarizeDrawerFieldPolicyMap,
} from "@/lib/fields/drawerFieldPolicyAdapter";

describe("drawerFieldPolicyAdapter", () => {
    it("maps opportunity custom field to field_values and enforceable", () => {
        const r = resolveDrawerFieldPolicy("opportunity", {
            field_key: "campus_preference",
            is_system: false,
        });
        expect(r).toMatchObject({
            storage: "field_values",
            bodyKey: "campus_preference",
            policyMode: "enforceable",
            requirementSupported: true,
            interactionSupported: true,
        });
    });

    it("maps job custom field to field_values and enforceable", () => {
        const r = resolveDrawerFieldPolicy("job", {
            field_key: "access_notes",
            is_system: false,
        });
        expect(r?.policyMode).toBe("enforceable");
        expect(r?.storage).toBe("field_values");
    });

    it("maps opportunity native safe scalars to column and enforceable", () => {
        for (const key of ["name", "source", "assigned_to", "lost_reason", "job_date", "job_time_window"]) {
            const r = resolveDrawerFieldPolicy("opportunity", { field_key: key, is_system: true });
            expect(r?.policyMode).toBe("enforceable");
            expect(r?.storage).toBe("column");
            expect(r?.bodyKey).toBe(key);
        }
    });

    it("maps opportunity notes to metadata.notes path and enforceable", () => {
        const r = resolveDrawerFieldPolicy("opportunity", { field_key: "notes", is_system: true });
        expect(r).toMatchObject({
            storage: "metadata",
            bodyKey: "notes",
            policyMode: "enforceable",
        });
    });

    it("maps job native safe scalars to column and enforceable", () => {
        for (const key of [
            "title",
            "description",
            "service_key",
            "job_type",
            "scheduled_at",
            "completed_at",
            "service_frequency_key",
            "is_recurring",
        ]) {
            const r = resolveDrawerFieldPolicy("job", { field_key: key, is_system: true });
            expect(r?.policyMode).toBe("enforceable");
            expect(r?.storage).toBe("column");
        }
    });

    it("defers status_key", () => {
        const opp = resolveDrawerFieldPolicy("opportunity", { field_key: "status_key", is_system: true });
        const job = resolveDrawerFieldPolicy("job", { field_key: "status_key", is_system: true });
        expect(opp?.policyMode).toBe("deferred");
        expect(job?.policyMode).toBe("deferred");
        expect(opp?.requirementSupported).toBe(false);
    });

    it("defers pricing and quote fields", () => {
        expect(
            resolveDrawerFieldPolicy("opportunity", { field_key: "quote_total", is_system: true })?.policyMode
        ).toBe("deferred");
        expect(
            resolveDrawerFieldPolicy("opportunity", { field_key: "quote_inputs", is_system: true })?.storage
        ).toBe("pipeline");
        expect(
            resolveDrawerFieldPolicy("job", { field_key: "gross_price_cents", is_system: true })?.policyMode
        ).toBe("deferred");
        expect(
            resolveDrawerFieldPolicy("job", { field_key: "_discount_amount_cents", is_system: true })?.storage
        ).toBe("computed");
    });

    it("never policy-controls computed underscore fields", () => {
        const r = resolveDrawerFieldPolicy("job", { field_key: "_customer_name", is_system: true });
        expect(r?.policyMode).toBe("never_policy_controlled");
        expect(r?.storage).toBe("computed");
    });

    it("never/deferred for FK and relationship fields", () => {
        const fk = resolveDrawerFieldPolicy("opportunity", { field_key: "customer_id", is_system: true });
        expect(fk?.policyMode).toBe("never_policy_controlled");
        expect(fk?.storage).toBe("relationship");

        const vendor = resolveDrawerFieldPolicy("job", { field_key: "assigned_vendor_id", is_system: true });
        expect(vendor?.policyMode).toBe("never_policy_controlled");
    });

    it("defers tour and desired_start_date", () => {
        expect(
            resolveDrawerFieldPolicy("opportunity", { field_key: "desired_start_date", is_system: true })?.policyMode
        ).toBe("deferred");
        expect(
            resolveDrawerFieldPolicy("opportunity", { field_key: "tour_date", is_system: true })?.policyMode
        ).toBe("deferred");
    });

    it("defers unknown system field", () => {
        const r = resolveDrawerFieldPolicy("opportunity", { field_key: "external_source", is_system: true });
        expect(r?.policyMode).toBe("deferred");
        expect(r?.storage).toBe("unknown");
    });

    it("defers customer_notes alias", () => {
        const r = resolveDrawerFieldPolicy("opportunity", { field_key: "customer_notes", is_system: true });
        expect(r?.policyMode).toBe("deferred");
    });

    it("buildDrawerFieldPolicyResolvedMap keys by field_key", () => {
        const map = buildDrawerFieldPolicyResolvedMap("opportunity", [
            { field_key: "name", is_system: true },
            { field_key: "custom_a", is_system: false },
        ]);
        expect(Object.keys(map)).toEqual(["name", "custom_a"]);
        expect(summarizeDrawerFieldPolicyMap(map).enforceable).toBe(2);
    });

    it("buildDrawerFieldPolicyResolvedMap attaches effective behavior from placement", () => {
        const map = buildDrawerFieldPolicyResolvedMap(
            "opportunity",
            [
                {
                    field_key: "custom_notes",
                    is_system: false,
                    is_required: true,
                    requirement_policy: { version: 1, mode: "required" },
                },
            ],
            {
                layoutConfig: {
                    field_placements_v1: [
                        {
                            field_key: "custom_notes",
                            surfaces: {
                                drawer_overview: {
                                    requirement: { version: 1, mode: "optional" },
                                },
                            },
                        },
                    ],
                },
            }
        );
        expect(map.custom_notes?.requirement?.mode).toBe("optional");
        expect(map.custom_notes?.requirement_source).toBe("placement");
    });

    it("job map omits effective behavior fields", () => {
        const map = buildDrawerFieldPolicyResolvedMap("job", [
            { field_key: "title", is_system: true, is_required: true },
        ]);
        expect(map.title?.requirement).toBeUndefined();
        expect(map.title?.interaction).toBeUndefined();
    });

    it("attachDrawerFieldPolicyResolution enriches opportunity payload", () => {
        const out: Record<string, unknown> = {
            _field_definitions: [
                {
                    id: "1",
                    field_key: "name",
                    field_type: "text",
                    label: "Name",
                    section_key: "overview",
                    sort_order: 0,
                    is_system: true,
                    is_visible_in_drawer: true,
                    is_required: false,
                    requirement_policy: null,
                    interaction_policy: null,
                },
            ],
        };
        attachDrawerFieldPolicyResolution(out, "opportunities", { layoutConfig: null });
        const resolved = out._field_policy_resolved as Record<string, { policyMode: string }>;
        expect(resolved.name.policyMode).toBe("enforceable");
    });

    it("attachDrawerFieldPolicyResolution skips non-phase-1 drawer types", () => {
        const out: Record<string, unknown> = {
            _field_definitions: [{ field_key: "name", is_system: true }],
        };
        attachDrawerFieldPolicyResolution(out, "customers");
        expect(out._field_policy_resolved).toBeUndefined();
    });
});
