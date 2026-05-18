import { randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { FIELD_REQUIREMENT_POLICY_VERSION } from "@/lib/fields/fieldRequirementPolicy";

import {
    loadConfigLayoutAssistEntityResolveContext,
    type ConfigLayoutAssistEntityResolveContext,
} from "./configLayoutAssistEntityResolve";
import { classifyProposalRisk, inferApplyMode } from "./configurationProposalRisk";
import {
    ensureOperationPermissions,
    resolveOperationPermissions,
} from "./configurationProposalPermissions";
import { normalizeConfigurationProposal } from "./configurationProposalNormalize";
import {
    CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY,
    type ConfigurationOperationV1,
    type ConfigurationProposalEntityType,
    type ConfigurationProposalV1,
} from "./configurationProposalV1";
import {
    parseConfigLayoutAssistIntent,
    slugFieldKey,
    type ConfigLayoutAssistIntentV1,
} from "./configLayoutAssistIntent";
import type { ConfigLayoutAssistTraceV1 } from "./configLayoutAssistTypes";

export const CONFIG_ASSIST_NEW_SECTION_VALUE = "__new_section__" as const;

export const CONFIG_ASSIST_FIELD_TYPES = [
    "text",
    "date",
    "email",
    "phone",
    "number",
    "select",
    "boolean",
] as const;

export type ConfigAssistFieldType = (typeof CONFIG_ASSIST_FIELD_TYPES)[number];

export type ConfigLayoutAssistSectionOptionV1 = {
    section_key: string;
    label: string;
    source: "preset" | "org";
};

export type ConfigLayoutAssistFieldSetupDraftV1 = {
    command: string;
    field_label: string;
    field_key: string;
    inferred_field_type: ConfigAssistFieldType;
    entity_type: ConfigurationProposalEntityType;
    entity_display_label: string;
    default_required: boolean;
    intent: ConfigLayoutAssistIntentV1;
};

export type ConfigLayoutAssistFieldSetupConfirmV1 = {
    command: string;
    field_type: ConfigAssistFieldType;
    required: boolean;
    section_selection:
        | { kind: "existing"; section_key: string }
        | { kind: "new"; section_label: string };
};

export type ConfigLayoutAssistReadySummaryV1 = {
    field_name: string;
    field_type_label: string;
    required_label: string;
    section_label: string;
};

const SECTION_PRESETS_BY_ENTITY: Partial<
    Record<ConfigurationProposalEntityType, ConfigLayoutAssistSectionOptionV1[]>
> = {
    opportunity: [
        { section_key: "details", label: "Inquiry details", source: "preset" },
        { section_key: "enrollment", label: "Enrollment details", source: "preset" },
        { section_key: "custom", label: "Custom fields", source: "preset" },
    ],
};

const FIELD_TYPE_LABELS: Record<ConfigAssistFieldType, string> = {
    text: "Text",
    date: "Date",
    email: "Email",
    phone: "Phone",
    number: "Number",
    select: "Select",
    boolean: "Yes/No",
};

export function inferConfigAssistFieldType(label: string): ConfigAssistFieldType {
    const l = label.toLowerCase();
    if (/\bdate\b/.test(l)) return "date";
    if (/\b(email|e-mail)\b/.test(l)) return "email";
    if (/\b(phone|mobile)\b/.test(l)) return "phone";
    if (/\b(number|amount|count)\b/.test(l)) return "number";
    if (/\b(tier|status|type)\b/.test(l)) return "select";
    if (/\b(yes|no|boolean)\b/.test(l)) return "boolean";
    return "text";
}

export function fieldTypeLabel(fieldType: string): string {
    const key = fieldType.toLowerCase() as ConfigAssistFieldType;
    return FIELD_TYPE_LABELS[key] ?? fieldType;
}

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

function requirementPayload(required: boolean): Pick<
    Record<string, unknown>,
    "is_required" | "requirement_policy"
> {
    return {
        is_required: required,
        requirement_policy: {
            version: FIELD_REQUIREMENT_POLICY_VERSION,
            mode: required ? "required" : "optional",
        },
    };
}

export async function loadConfigLayoutAssistSectionOptions(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: ConfigurationProposalEntityType;
}): Promise<ConfigLayoutAssistSectionOptionV1[]> {
    const presets = SECTION_PRESETS_BY_ENTITY[params.entityType] ?? [
        { section_key: "custom", label: "Custom fields", source: "preset" as const },
    ];
    const byKey = new Map<string, ConfigLayoutAssistSectionOptionV1>();
    for (const p of presets) {
        byKey.set(p.section_key, p);
    }

    const { data } = await params.supabase
        .from("field_section_definitions")
        .select("section_key, label, is_archived, sort_order")
        .eq("org_id", params.orgId)
        .eq("entity_type", params.entityType)
        .order("sort_order", { ascending: true });

    for (const row of data ?? []) {
        if (row.is_archived === true) continue;
        const section_key = String(row.section_key ?? "").trim();
        if (!section_key) continue;
        const label =
            typeof row.label === "string" && row.label.trim() ? row.label.trim() : section_key;
        byKey.set(section_key, { section_key, label, source: "org" });
    }

    return [...byKey.values()];
}

export function buildConfigLayoutAssistFieldSetupDraft(params: {
    command: string;
    entityResolve?: ConfigLayoutAssistEntityResolveContext;
    default_entity_type?: string;
}): ConfigLayoutAssistFieldSetupDraftV1 | null {
    const intent = parseConfigLayoutAssistIntent(params.command, {
        entityResolve: params.entityResolve,
        default_entity_type: params.default_entity_type,
    });
    if (intent.kind !== "create_field" || !intent.field_label?.trim()) {
        return null;
    }
    const field_label = intent.field_label.trim();
    const field_key = intent.field_key ?? slugFieldKey(field_label);
    if (!field_key) return null;

    return {
        command: params.command.trim(),
        field_label,
        field_key,
        inferred_field_type: inferConfigAssistFieldType(field_label),
        entity_type: intent.entity_type,
        entity_display_label: intent.entity_display_label,
        default_required: false,
        intent,
    };
}

export async function prepareConfigLayoutAssistFieldSetup(params: {
    command: string;
    orgId: string;
    supabase: SupabaseClient;
    default_entity_type?: string;
    entityResolve?: ConfigLayoutAssistEntityResolveContext;
}): Promise<
    | {
          ok: true;
          draft: ConfigLayoutAssistFieldSetupDraftV1;
          section_options: ConfigLayoutAssistSectionOptionV1[];
      }
    | { ok: false; error: string; message: string }
> {
    const entityResolve =
        params.entityResolve ??
        (await loadConfigLayoutAssistEntityResolveContext(
            params.supabase,
            params.orgId,
            params.default_entity_type
        ));
    const draft = buildConfigLayoutAssistFieldSetupDraft({
        command: params.command,
        entityResolve,
        default_entity_type: params.default_entity_type,
    });
    if (!draft) {
        return {
            ok: false,
            error: "NOT_CREATE_FIELD",
            message: "Command is not a supported create-field request.",
        };
    }
    const section_options = await loadConfigLayoutAssistSectionOptions({
        supabase: params.supabase,
        orgId: params.orgId,
        entityType: draft.entity_type,
    });
    return { ok: true, draft, section_options };
}

function resolveSectionFromConfirm(
    confirm: ConfigLayoutAssistFieldSetupConfirmV1,
    sectionOptions: ConfigLayoutAssistSectionOptionV1[]
): { section_key: string; section_label: string; is_new_section: boolean } {
    if (confirm.section_selection.kind === "new") {
        const label = confirm.section_selection.section_label.trim();
        const section_key = slugFieldKey(label) || "custom";
        return { section_key, section_label: label || section_key, is_new_section: true };
    }
    const section_key = confirm.section_selection.section_key.trim();
    const match = sectionOptions.find((o) => o.section_key === section_key);
    return {
        section_key,
        section_label: match?.label ?? section_key,
        is_new_section: false,
    };
}

export function buildProposalFromFieldSetupConfirm(params: {
    draft: ConfigLayoutAssistFieldSetupDraftV1;
    confirm: ConfigLayoutAssistFieldSetupConfirmV1;
    sectionOptions: ConfigLayoutAssistSectionOptionV1[];
    userId: string;
}): {
    proposal: ConfigurationProposalV1;
    trace: ConfigLayoutAssistTraceV1;
    ready_summary: ConfigLayoutAssistReadySummaryV1;
} {
    const { draft, confirm, sectionOptions, userId } = params;
    const { section_key, section_label, is_new_section } = resolveSectionFromConfirm(
        confirm,
        sectionOptions
    );
    const field_type = confirm.field_type;
    const required = confirm.required;

    const operations: ConfigurationOperationV1[] = [];

    if (is_new_section) {
        operations.push(
            newOp({
                kind: "create_section",
                entity_type: draft.entity_type,
                section_key,
                before: null,
                after: {
                    section_key,
                    label: section_label,
                    sort_order: 100,
                    is_archived: false,
                },
                rationale: [`Create section "${section_label}" for ${draft.entity_display_label}.`],
            })
        );
    }

    operations.push(
        newOp({
            kind: "create_field",
            entity_type: draft.entity_type,
            field_key: draft.field_key,
            section_key,
            before: null,
            after: {
                field_key: draft.field_key,
                field_type,
                label: draft.field_label,
                section_key,
                is_visible_in_drawer: true,
                is_visible_in_form: true,
                ...requirementPayload(required),
            },
            rationale: [
                `Create custom field "${draft.field_label}" (${draft.field_key}) in ${section_label} on ${draft.entity_display_label}.`,
            ],
        })
    );

    const proposed_operations = ensureOperationPermissions(operations);
    const summary = `Create ${draft.field_label} field for ${draft.entity_display_label}`;

    const raw: ConfigurationProposalV1 = {
        version: 1,
        id: randomUUID(),
        category: "field",
        intent: draft.command,
        summary,
        rationale: proposed_operations.flatMap((o) => o.rationale),
        impacted_entities: [draft.entity_type],
        impacted_fields: [draft.field_key],
        risk_level: classifyProposalRisk(proposed_operations),
        requires_approval: true,
        permission_requirements: [],
        proposed_operations,
        apply_mode: inferApplyMode(proposed_operations),
        metadata: {
            agent: CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY,
            intent_kind: "create_field",
            entity_display_label: draft.entity_display_label,
            field_setup: {
                field_type,
                required,
                section_key,
                section_label,
            },
        },
        generated_by: CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY,
        created_at: new Date().toISOString(),
        created_by: userId,
    };

    const proposal = normalizeConfigurationProposal(raw, {
        default_generated_by: CONFIGURATION_LAYOUT_ASSIST_AGENT_KEY,
    });

    const trace: ConfigLayoutAssistTraceV1 = {
        agent: "config_layout_assist",
        deterministic: true,
        intent: draft.intent,
        rationale_steps: [
            `Parsed intent: create_field`,
            `Confirmed field type: ${field_type}`,
            `Required: ${required ? "yes" : "no"}`,
            `Section: ${section_label}`,
        ],
        command: draft.command,
    };

    const ready_summary: ConfigLayoutAssistReadySummaryV1 = {
        field_name: draft.field_label,
        field_type_label: fieldTypeLabel(field_type),
        required_label: required ? "Yes" : "No",
        section_label,
    };

    return { proposal, trace, ready_summary };
}

export function fieldSetupIntroMessage(draft: ConfigLayoutAssistFieldSetupDraftV1): string {
    return `I can add “${draft.field_label}” to ${draft.entity_display_label}.`;
}

export function fieldSetupNeedsClarification(intent: ConfigLayoutAssistIntentV1): boolean {
    return intent.kind === "create_field" && Boolean(intent.field_label?.trim());
}
