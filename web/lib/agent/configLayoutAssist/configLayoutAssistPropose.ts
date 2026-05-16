import { randomUUID } from "crypto";

import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import { validateLayoutIntegrityNow } from "@/lib/config/layoutIntegrityValidator";
import type { LayoutIntegrityFieldInput } from "@/lib/config/layoutIntegrityValidator";
import { resolveFieldEditability, resolveFieldInteractionPolicy } from "@/lib/fields/fieldInteractionPolicy";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    parseConfigLayoutAssistIntent,
    type ConfigLayoutAssistIntentV1,
} from "./configLayoutAssistIntent";
import type { ConfigLayoutAssistTraceV1 } from "./configLayoutAssistTypes";
import { classifyProposalRisk, inferApplyMode } from "./configurationProposalRisk";
import { ensureOperationPermissions, resolveOperationPermissions } from "./configurationProposalPermissions";
import { normalizeConfigurationProposal } from "./configurationProposalNormalize";
import {
    CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY,
    type ConfigurationOperationV1,
    type ConfigurationProposalV1,
} from "./configurationProposalV1";

export type BuildConfigLayoutProposalInput = {
    command: string;
    orgId: string;
    userId: string;
    supabase?: SupabaseClient;
    default_entity_type?: string;
};

function newOp(
    partial: Omit<ConfigurationOperationV1, "operation_id" | "rationale" | "required_permissions"> & {
        rationale: string[];
    }
): ConfigurationOperationV1 {
    const kind = partial.kind;
    return {
        operation_id: randomUUID(),
        kind,
        entity_type: partial.entity_type,
        layout_key: partial.layout_key ?? null,
        field_key: partial.field_key ?? null,
        section_key: partial.section_key ?? null,
        before: partial.before ?? null,
        after: partial.after ?? null,
        rationale: partial.rationale,
        warnings: partial.warnings,
        required_permissions: resolveOperationPermissions(kind),
        expected_updated_at: partial.expected_updated_at ?? null,
        field_definition_id: partial.field_definition_id ?? null,
        surface: partial.surface ?? null,
    };
}

function inferFieldType(label: string): string {
    const l = label.toLowerCase();
    if (/\bdate\b/.test(l)) return "date";
    if (/\b(email|e-mail)\b/.test(l)) return "email";
    if (/\b(phone|mobile)\b/.test(l)) return "phone";
    if (/\b(number|amount|count)\b/.test(l)) return "number";
    if (/\b(tier|status|type)\b/.test(l)) return "select";
    return "text";
}

async function loadFieldRow(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    fieldKey: string
): Promise<Record<string, unknown> | null> {
    const { data } = await supabase
        .from("field_definitions")
        .select("*")
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("field_key", fieldKey)
        .maybeSingle();
    return data as Record<string, unknown> | null;
}

async function buildDataQualityProposal(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    intent: ConfigLayoutAssistIntentV1
): Promise<ConfigurationOperationV1[]> {
    const { data: fieldRows } = await supabase
        .from("field_definitions")
        .select(
            "field_key, entity_type, field_type, is_active, is_system, is_required, requirement_policy, interaction_policy, is_visible_in_form, is_visible_in_drawer, is_visible_in_table, is_visible_in_public_booking, section_key, config"
        )
        .eq("org_id", orgId)
        .eq("entity_type", entityType);

    const { data: sectionRows } = await supabase
        .from("field_section_definitions")
        .select("section_key, entity_type, is_archived, section_config")
        .eq("org_id", orgId)
        .eq("entity_type", entityType);

    const layoutResolved = await fetchEffectiveRecordDrawerLayout(supabase, orgId, entityType);
    const layout_config_json = layoutResolved.ok && layoutResolved.layout ? layoutResolved.layout.config_json : null;

    const field_definitions: LayoutIntegrityFieldInput[] = (fieldRows ?? []).map((r) => ({
        field_key: String(r.field_key),
        entity_type: String(r.entity_type),
        field_type: String(r.field_type),
        is_active: r.is_active !== false,
        is_system: Boolean(r.is_system),
        is_required: Boolean(r.is_required),
        requirement_policy: r.requirement_policy,
        interaction_policy: r.interaction_policy,
        is_visible_in_form: r.is_visible_in_form !== false,
        is_visible_in_drawer: r.is_visible_in_drawer !== false,
        is_visible_in_table: Boolean(r.is_visible_in_table),
        is_visible_in_public_booking: Boolean(r.is_visible_in_public_booking),
        section_key: r.section_key,
        config: r.config,
    }));

    const report = validateLayoutIntegrityNow({
        entity_type: entityType,
        field_definitions,
        sections: (sectionRows ?? []).map((s) => ({
            section_key: String(s.section_key),
            entity_type: String(s.entity_type),
            is_archived: Boolean(s.is_archived),
            section_config: s.section_config,
        })),
        layout_config_json,
    });

    return report.issues.slice(0, 12).map((issue) =>
        newOp({
            kind: "data_quality_recommendation",
            entity_type: entityType,
            field_key: issue.field_key ?? null,
            section_key: issue.section_key ?? null,
            before: null,
            after: {
                issue_code: issue.code,
                severity: issue.severity,
                message: issue.message,
            },
            rationale: [issue.message, intent.summary],
        })
    );
}

async function buildExplainOperations(
    supabase: SupabaseClient,
    orgId: string,
    intent: ConfigLayoutAssistIntentV1
): Promise<{ operations: ConfigurationOperationV1[]; rationale: string[] }> {
    const fieldKey = intent.field_key;
    if (!fieldKey) {
        return {
            operations: [],
            rationale: ["Could not resolve field from command; specify a field key or clearer label."],
        };
    }

    const row = await loadFieldRow(supabase, orgId, intent.entity_type, fieldKey);
    if (!row) {
        return {
            operations: [],
            rationale: [`No field definition found for ${intent.entity_type}.${fieldKey}.`],
        };
    }

    const source = {
        field_key: fieldKey,
        entity_type: intent.entity_type,
        interaction_policy: row.interaction_policy,
    };
    const policy = resolveFieldInteractionPolicy(source);
    const edit = resolveFieldEditability(source, { surface: "admin_explain" });

    const rationale = [
        `Field ${fieldKey} on ${intent.entity_type} uses editability mode "${policy.editability_mode}".`,
        edit.editable
            ? "Field is editable in the default admin context."
            : `Field is not editable: ${edit.lock_reason ?? "interaction policy blocks writes"}.`,
    ];
    if (policy.ownership?.write_target_entity) {
        rationale.push(
            `Writes route to ${policy.ownership.write_target_entity}.${policy.ownership.write_target_field ?? "?"}.`
        );
    }

    return {
        operations: [
            newOp({
                kind: "data_quality_recommendation",
                entity_type: intent.entity_type,
                field_key: fieldKey,
                field_definition_id: String(row.id),
                before: {
                    interaction_policy: row.interaction_policy,
                    is_visible_in_drawer: row.is_visible_in_drawer,
                },
                after: {
                    editable: edit.editable,
                    editability_mode: policy.editability_mode,
                    write_target_entity: policy.ownership?.write_target_entity ?? null,
                },
                rationale,
            }),
        ],
        rationale,
    };
}

/**
 * Deterministic proposal generation (no LLM). Does not apply or auto-approve.
 */
export async function buildDeterministicConfigurationProposal(
    input: BuildConfigLayoutProposalInput
): Promise<{ proposal: ConfigurationProposalV1; trace: ConfigLayoutAssistTraceV1 }> {
    const command = input.command.trim();
    const intent = parseConfigLayoutAssistIntent(command, {
        default_entity_type: input.default_entity_type,
    });

    const traceSteps: string[] = [`Parsed intent: ${intent.kind}`, intent.summary];
    const operations: ConfigurationOperationV1[] = [];
    let category: ConfigurationProposalV1["category"] = "field";
    let rationale: string[] = [intent.summary];

    if (intent.kind === "data_quality_scan" && input.supabase) {
        category = "data_quality";
        const ops = await buildDataQualityProposal(input.supabase, input.orgId, intent.entity_type, intent);
        operations.push(...ops);
        traceSteps.push(`Layout integrity scan returned ${ops.length} recommendation(s).`);
        rationale = [`Scanned ${intent.entity_type} configuration for integrity issues.`];
    } else if (intent.kind === "explain_field" && input.supabase) {
        category = "interaction";
        const explained = await buildExplainOperations(input.supabase, input.orgId, intent);
        operations.push(...explained.operations);
        rationale = explained.rationale;
        traceSteps.push("Resolved field interaction policy for explainability.");
    } else if (intent.kind === "create_field" && intent.field_key) {
        category = "field";
        const label = intent.field_label ?? intent.field_key;
        operations.push(
            newOp({
                kind: "create_field",
                entity_type: intent.entity_type,
                field_key: intent.field_key,
                before: null,
                after: {
                    field_key: intent.field_key,
                    field_type: inferFieldType(label),
                    label,
                    section_key: "custom",
                    is_visible_in_drawer: true,
                },
                rationale: [`Create custom field "${label}" (${intent.field_key}).`],
            })
        );
    } else if (intent.kind === "expose_field" && intent.field_key) {
        category = "layout";
        let before: Record<string, unknown> | null = null;
        let fieldDefinitionId: string | null = null;
        if (input.supabase) {
            const row = await loadFieldRow(input.supabase, input.orgId, intent.entity_type, intent.field_key);
            if (row) {
                before = {
                    is_visible_in_drawer: row.is_visible_in_drawer,
                    is_visible_in_form: row.is_visible_in_form,
                };
                fieldDefinitionId = String(row.id);
            }
        }
        operations.push(
            newOp({
                kind: "expose_field_on_layout",
                entity_type: intent.entity_type,
                field_key: intent.field_key,
                field_definition_id: fieldDefinitionId,
                surface: intent.surface ?? "drawer_body",
                before,
                after: { is_visible_in_drawer: true, surface: intent.surface ?? "drawer_body" },
                rationale: [`Expose ${intent.field_key} on ${intent.entity_type} drawer surfaces.`],
            })
        );
    } else if (intent.kind === "hide_field" && intent.field_key) {
        category = "layout";
        operations.push(
            newOp({
                kind: "hide_field_on_layout",
                entity_type: intent.entity_type,
                field_key: intent.field_key,
                before: { is_visible_in_drawer: true },
                after: { is_visible_in_drawer: false },
                rationale: [`Hide ${intent.field_key} from ${intent.entity_type} drawer.`],
            })
        );
    } else if (intent.kind === "set_field_interaction" && intent.field_key) {
        category = "interaction";
        operations.push(
            newOp({
                kind: "set_field_interaction",
                entity_type: intent.entity_type,
                field_key: intent.field_key,
                before: null,
                after: {
                    interaction_policy: {
                        version: 1,
                        editability_mode: "editable",
                    },
                },
                rationale: [`Set ${intent.field_key} to editable on ${intent.entity_type} (admin form/drawer).`],
            })
        );
    }

    const proposed_operations = ensureOperationPermissions(operations);
    const risk_level = classifyProposalRisk(proposed_operations);
    const apply_mode = inferApplyMode(proposed_operations);

    const raw: ConfigurationProposalV1 = {
        version: 1,
        id: randomUUID(),
        category,
        intent: command,
        summary: intent.summary,
        rationale,
        impacted_entities: [intent.entity_type],
        impacted_fields: intent.field_key ? [intent.field_key] : [],
        risk_level,
        requires_approval: true,
        permission_requirements: [],
        proposed_operations,
        apply_mode,
        metadata: { agent: CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY, intent_kind: intent.kind },
        generated_by: CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY,
        created_at: new Date().toISOString(),
        created_by: input.userId,
    };

    const proposal = normalizeConfigurationProposal(raw, {
        default_generated_by: CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY,
    });

    const trace: ConfigLayoutAssistTraceV1 = {
        agent: "config_layout_assist",
        deterministic: true,
        intent,
        rationale_steps: traceSteps,
        command,
    };

    return { proposal, trace };
}
