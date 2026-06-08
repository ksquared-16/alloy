import { describe, expect, it } from "vitest";
import {
    classifyProposalRisk,
    CONFIGURATION_PROPOSAL_VERSION,
    dedupeProposalWarnings,
    deserializeConfigurationProposal,
    groupOperationsByKind,
    inferApplyMode,
    normalizeConfigurationProposal,
    resolveProposalPermissions,
    serializeConfigurationProposal,
    sortOperationsDeterministic,
    validateConfigurationProposal,
    type ConfigurationOperationV1,
    type ConfigurationProposalV1,
} from "@/lib/agent/configLayoutAssist";

function baseProposal(overrides: Partial<ConfigurationProposalV1> = {}): ConfigurationProposalV1 {
    const op: ConfigurationOperationV1 = {
        operation_id: "op-1",
        kind: "expose_field_on_layout",
        entity_type: "opportunity",
        field_key: "preferred_start_date",
        layout_key: "default",
        surface: "drawer_summary",
        before: { is_visible_in_drawer: false },
        after: { is_visible_in_drawer: true, surface: "drawer_summary" },
        rationale: ["Operator asked to show field in summary"],
        required_permissions: [],
    };
    return {
        version: CONFIGURATION_PROPOSAL_VERSION,
        id: "prop-001",
        category: "layout",
        intent: "expose_field",
        summary: "Expose Preferred Start Date in summary",
        rationale: ["Requested in command bar"],
        impacted_entities: ["opportunity"],
        risk_level: "low",
        requires_approval: true,
        permission_requirements: [],
        proposed_operations: [op],
        apply_mode: "single_operation",
        generated_by: "deterministic",
        created_at: "2026-05-16T12:00:00.000Z",
        ...overrides,
    };
}

describe("validateConfigurationProposal", () => {
    it("valid proposal passes", () => {
        const r = validateConfigurationProposal(normalizeConfigurationProposal(baseProposal()));
        expect(r.ok).toBe(true);
        expect(r.error_count).toBe(0);
    });

    it("rejects invalid operation kind", () => {
        const p = baseProposal();
        p.proposed_operations[0] = { ...p.proposed_operations[0]!, kind: "invalid_kind" as "create_field" };
        const r = validateConfigurationProposal(p);
        expect(r.ok).toBe(false);
        expect(r.issues.some((i) => i.code === "invalid_operation_kind")).toBe(true);
    });

    it("rejects duplicate operation ids", () => {
        const op = baseProposal().proposed_operations[0]!;
        const p = baseProposal({
            proposed_operations: [
                { ...op, operation_id: "dup" },
                { ...op, operation_id: "dup", field_key: "other_field" },
            ],
        });
        const r = validateConfigurationProposal(p);
        expect(r.ok).toBe(false);
        expect(r.issues.some((i) => i.code === "duplicate_operation_id")).toBe(true);
    });

    it("rejects malformed create_field payload", () => {
        const p = baseProposal({
            category: "field",
            proposed_operations: [
                {
                    operation_id: "cf-1",
                    kind: "create_field",
                    entity_type: "opportunity",
                    field_key: null,
                    before: null,
                    after: { label: "Missing type" },
                    rationale: [],
                    required_permissions: [],
                },
            ],
        });
        const r = validateConfigurationProposal(p);
        expect(r.ok).toBe(false);
        expect(r.issues.some((i) => i.code === "invalid_operation_payload")).toBe(true);
    });

    it("rejects unknown field_key when context provided", () => {
        const p = baseProposal({
            proposed_operations: [
                {
                    ...baseProposal().proposed_operations[0]!,
                    operation_id: "op-2",
                    kind: "update_field",
                    field_key: "ghost_field",
                    after: { label: "X" },
                },
            ],
        });
        const r = validateConfigurationProposal(p, {
            known_field_keys_by_entity: { opportunity: ["preferred_start_date"] },
        });
        expect(r.ok).toBe(false);
        expect(r.issues.some((i) => i.code === "unknown_field_key")).toBe(true);
    });
});

describe("serializeConfigurationProposal", () => {
    it("deterministic serialization", () => {
        const p = normalizeConfigurationProposal(baseProposal());
        const a = serializeConfigurationProposal(p);
        const b = serializeConfigurationProposal(p);
        expect(a).toBe(b);
        expect(a).toContain('"version":1');
    });

    it("unsupported version rejected on deserialize", () => {
        const raw = { ...JSON.parse(serializeConfigurationProposal(baseProposal())), version: 2 };
        const r = deserializeConfigurationProposal(raw);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain("unsupported");
    });

    it("round-trip deserialize normalizes", () => {
        const json = serializeConfigurationProposal(baseProposal());
        const r = deserializeConfigurationProposal(json);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.proposal.permission_requirements).toContain("layouts.manage");
            expect(r.proposal.permission_requirements).toContain("fields.manage");
        }
    });
});

describe("classifyProposalRisk", () => {
    it("expose field is low", () => {
        const ops = baseProposal().proposed_operations;
        expect(classifyProposalRisk(ops)).toBe("low");
    });

    it("hide required field is high", () => {
        const risk = classifyProposalRisk([
            {
                operation_id: "h1",
                kind: "hide_field_on_layout",
                entity_type: "opportunity",
                field_key: "tier",
                before: { is_required: true, is_visible_in_drawer: true },
                after: { is_visible_in_drawer: false },
                rationale: [],
                required_permissions: [],
            },
        ]);
        expect(risk).toBe("high");
    });

    it("editable related-record without write target is high", () => {
        const risk = classifyProposalRisk([
            {
                operation_id: "w1",
                kind: "set_field_write_target",
                entity_type: "opportunity",
                field_key: "first_name",
                before: null,
                after: { editable: true, write_behavior: "none", interaction_mode: "editable" },
                rationale: [],
                required_permissions: [],
            },
        ]);
        expect(risk).toBe("high");
    });

    it("create required field is medium", () => {
        const risk = classifyProposalRisk([
            {
                operation_id: "c1",
                kind: "create_field",
                entity_type: "opportunity",
                field_key: "preferred_start_date",
                before: null,
                after: { field_key: "preferred_start_date", field_type: "date", is_required: true },
                rationale: [],
                required_permissions: [],
            },
        ]);
        expect(risk).toBe("medium");
    });
});

describe("resolveProposalPermissions", () => {
    it("aggregates and dedupes permissions in stable order", () => {
        const perms = resolveProposalPermissions([
            {
                operation_id: "a",
                kind: "update_option_set",
                entity_type: "opportunity",
                before: null,
                after: { set_key: "tier" },
                rationale: [],
                required_permissions: ["option_sets.manage"],
            },
            {
                operation_id: "b",
                kind: "create_section",
                entity_type: "opportunity",
                section_key: "custom",
                before: null,
                after: { label: "Custom" },
                rationale: [],
                required_permissions: [],
            },
        ]);
        expect(perms).toEqual(["option_sets.manage", "sections.manage"]);
    });
});

describe("normalizeConfigurationProposal", () => {
    it("dedupes warnings", () => {
        const w = { severity: "warning" as const, code: "dup", message: "Same", operation_id: null };
        const p = baseProposal({ warnings: [w, w] });
        const n = normalizeConfigurationProposal(p);
        expect(n.warnings?.length).toBe(1);
    });

    it("stable operation ordering", () => {
        const ops: ConfigurationOperationV1[] = [
            {
                operation_id: "z",
                kind: "update_field",
                entity_type: "opportunity",
                field_key: "b",
                before: {},
                after: {},
                rationale: [],
                required_permissions: [],
            },
            {
                operation_id: "a",
                kind: "create_field",
                entity_type: "opportunity",
                field_key: "a",
                before: null,
                after: { field_key: "a", field_type: "text" },
                rationale: [],
                required_permissions: [],
            },
        ];
        const sorted = sortOperationsDeterministic(ops);
        expect(sorted[0]!.kind).toBe("create_field");
        expect(sorted[1]!.kind).toBe("update_field");
    });

    it("infers apply_mode recommendation_only", () => {
        const p = normalizeConfigurationProposal(
            baseProposal({
                proposed_operations: [
                    {
                        operation_id: "dq-1",
                        kind: "data_quality_recommendation",
                        entity_type: "opportunity",
                        before: null,
                        after: { code: "required_field_not_visible", field_key: "x" },
                        rationale: [],
                        required_permissions: [],
                    },
                ],
                requires_approval: false,
            })
        );
        expect(inferApplyMode(p.proposed_operations)).toBe("recommendation_only");
        expect(p.apply_mode).toBe("recommendation_only");
    });

    it("groups operations by kind", () => {
        const p = normalizeConfigurationProposal(baseProposal());
        const groups = groupOperationsByKind(p.proposed_operations);
        expect(groups.expose_field_on_layout?.length).toBe(1);
    });
});

describe("dedupeProposalWarnings", () => {
    it("dedupes by severity code message operation_id", () => {
        const out = dedupeProposalWarnings([
            { severity: "warning", code: "a", message: "m", operation_id: null },
            { severity: "warning", code: "a", message: "m", operation_id: null },
        ]);
        expect(out).toHaveLength(1);
    });
});
