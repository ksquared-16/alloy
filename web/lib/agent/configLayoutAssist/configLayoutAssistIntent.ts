/**
 * Deterministic Orchestrator intent parsing for Configuration / Layout Assist.
 */

import type { ConfigLayoutAssistEntityResolveContext } from "./configLayoutAssistEntityResolve";
import { buildEntityResolveContext, resolveEntityTypeFromPhrase } from "./configLayoutAssistEntityResolve";
import type { ConfigurationProposalEntityType } from "./configurationProposalV1";

export type ConfigLayoutAssistIntentKindV1 =
    | "create_field"
    | "expose_field"
    | "hide_field"
    | "set_field_interaction"
    | "explain_field"
    | "data_quality_scan"
    | "unknown";

export type ConfigLayoutAssistIntentV1 = {
    kind: ConfigLayoutAssistIntentKindV1;
    /** Canonical field_definitions.entity_type */
    entity_type: ConfigurationProposalEntityType;
    /** Tenant-facing entity label used in summaries */
    entity_display_label: string;
    field_key: string | null;
    field_label: string | null;
    surface: string | null;
    summary: string;
};

const CREATE_FIELD_EXPLICIT_RE =
    /\b(?:create|add)\s+(?:a\s+)?(?:new\s+)?(.+?)\s+field\b/i;
const CREATE_FIELD_FOR_ENTITY_RE =
    /\b(?:create|add)\s+(?:a\s+)?(?:new\s+)?(.+?)\s+(?:for|on|to)\s+(?:the\s+)?(.+?)\s*$/i;
const EXPOSE_RE = /\b(?:expose|show|display|make)\s+(?:the\s+)?(.+?)\s+(?:visible|in\s+(?:the\s+)?(?:summary|drawer|header))\b/i;
const EXPOSE_SIMPLE_RE = /\b(?:expose|show)\s+(.+?)(?:\s+in|\s+on|\s+everywhere|$)/i;
const HIDE_RE = /\bhide\s+(.+?)(?:\s+from|\s+on|$)/i;
const EDITABLE_FROM_RE =
    /\b(?:make|set)\s+(.+?)\s+editable(?:\s+(?:from|on))?\s+(?:the\s+)?(.+?)\s*$/i;
const EDITABLE_RE = /\b(?:make|set)\s+(.+?)\s+editable\b/i;
const EXPLAIN_RE = /\bwhy\s+(?:can'?t\s+i\s+edit|is)\s+(.+?)\s+(?:read[\s-]?only|not\s+editable)/i;
const DQ_RE = /\b(?:inconsistenc\w*|layout\s+problem|required.*not\s+visible|data\s+quality)\b/i;
const CONFIG_SIGNAL_RE =
    /\b(field|fields|section|layout|drawer|visibility|required|read[\s-]?only|editable|option\s+set|subsidy|preferred\s+start|tour\s+date|header|summary)\b/i;

export function slugFieldKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

function extractFieldPhrase(text: string): string | null {
    const t = text.trim();
    if (!t) return null;
    const key = slugFieldKey(t);
    return key.length >= 2 ? key : null;
}

function entityLabel(ctx: ConfigLayoutAssistEntityResolveContext, canonical: ConfigurationProposalEntityType): string {
    return ctx.displayLabel(canonical, "plural");
}

export function isConfigLayoutAssistLikeCommand(input: string): boolean {
    const raw = input.trim();
    if (!raw) return false;
    if (DQ_RE.test(raw)) return true;
    if (CREATE_FIELD_EXPLICIT_RE.test(raw)) return true;
    if (CREATE_FIELD_FOR_ENTITY_RE.test(raw)) return true;
    if (EXPOSE_RE.test(raw) || EXPOSE_SIMPLE_RE.test(raw)) return true;
    if (HIDE_RE.test(raw)) return true;
    if (EDITABLE_FROM_RE.test(raw) || EDITABLE_RE.test(raw)) return true;
    if (EXPLAIN_RE.test(raw)) return true;
    if (CONFIG_SIGNAL_RE.test(raw) && /\b(layout|field|section|drawer|visible|required|editable|create|add)\b/i.test(raw)) {
        return true;
    }
    return false;
}

export type ParseConfigLayoutAssistIntentOptions = {
    default_entity_type?: string;
    entityResolve?: ConfigLayoutAssistEntityResolveContext;
};

export function parseConfigLayoutAssistIntent(
    input: string,
    options?: ParseConfigLayoutAssistIntentOptions
): ConfigLayoutAssistIntentV1 {
    const raw = input.trim();
    const ctx =
        options?.entityResolve ??
        buildEntityResolveContext([], options?.default_entity_type ?? "opportunity");

    if (DQ_RE.test(raw)) {
        const entity_type = ctx.default_entity_type;
        return {
            kind: "data_quality_scan",
            entity_type,
            entity_display_label: entityLabel(ctx, entity_type),
            field_key: null,
            field_label: null,
            surface: null,
            summary: "Scan layout and field configuration for integrity issues.",
        };
    }

    const createForM = raw.match(CREATE_FIELD_FOR_ENTITY_RE);
    if (createForM?.[1] && createForM[2]) {
        const label = createForM[1].trim();
        const entity_type = resolveEntityTypeFromPhrase(createForM[2], ctx);
        const field_key = extractFieldPhrase(label);
        return {
            kind: "create_field",
            entity_type,
            entity_display_label: entityLabel(ctx, entity_type),
            field_key,
            field_label: label,
            surface: null,
            summary: field_key
                ? `Create field "${label}" (${field_key}) for ${entityLabel(ctx, entity_type)}.`
                : `Create field "${label}" for ${entityLabel(ctx, entity_type)}.`,
        };
    }

    const createM = raw.match(CREATE_FIELD_EXPLICIT_RE);
    if (createM?.[1]) {
        const label = createM[1].trim();
        const entity_type = ctx.default_entity_type;
        const field_key = extractFieldPhrase(label);
        return {
            kind: "create_field",
            entity_type,
            entity_display_label: entityLabel(ctx, entity_type),
            field_key,
            field_label: label,
            surface: null,
            summary: field_key
                ? `Create field "${label}" (${field_key}) for ${entityLabel(ctx, entity_type)}.`
                : `Create field "${label}" for ${entityLabel(ctx, entity_type)}.`,
        };
    }

    const exposeM = raw.match(EXPOSE_RE) ?? raw.match(EXPOSE_SIMPLE_RE);
    if (exposeM?.[1]) {
        const label = exposeM[1].trim();
        const entity_type = ctx.default_entity_type;
        const surface = /\bsummary\b/i.test(raw) ? "drawer_summary" : /\bheader\b/i.test(raw) ? "drawer_header" : "drawer_body";
        return {
            kind: "expose_field",
            entity_type,
            entity_display_label: entityLabel(ctx, entity_type),
            field_key: extractFieldPhrase(label),
            field_label: label,
            surface,
            summary: `Expose "${label}" on ${entityLabel(ctx, entity_type)} layout (${surface}).`,
        };
    }

    const hideM = raw.match(HIDE_RE);
    if (hideM?.[1]) {
        const label = hideM[1].trim();
        const entity_type = ctx.default_entity_type;
        return {
            kind: "hide_field",
            entity_type,
            entity_display_label: entityLabel(ctx, entity_type),
            field_key: extractFieldPhrase(label),
            field_label: label,
            surface: null,
            summary: `Hide "${label}" on ${entityLabel(ctx, entity_type)} layouts.`,
        };
    }

    const editFromM = raw.match(EDITABLE_FROM_RE);
    if (editFromM?.[1] && editFromM[2]) {
        const label = editFromM[1].trim();
        const entity_type = resolveEntityTypeFromPhrase(editFromM[2], ctx);
        return {
            kind: "set_field_interaction",
            entity_type,
            entity_display_label: entityLabel(ctx, entity_type),
            field_key: extractFieldPhrase(label),
            field_label: label,
            surface: null,
            summary: `Adjust editability for "${label}" on ${entityLabel(ctx, entity_type)}.`,
        };
    }

    const editM = raw.match(EDITABLE_RE);
    if (editM?.[1]) {
        const label = editM[1].trim();
        const entity_type = ctx.default_entity_type;
        return {
            kind: "set_field_interaction",
            entity_type,
            entity_display_label: entityLabel(ctx, entity_type),
            field_key: extractFieldPhrase(label),
            field_label: label,
            surface: null,
            summary: `Adjust editability for "${label}" on ${entityLabel(ctx, entity_type)}.`,
        };
    }

    const explainM = raw.match(EXPLAIN_RE);
    if (explainM?.[1]) {
        const label = explainM[1].trim();
        const entity_type = ctx.default_entity_type;
        return {
            kind: "explain_field",
            entity_type,
            entity_display_label: entityLabel(ctx, entity_type),
            field_key: extractFieldPhrase(label),
            field_label: label,
            surface: null,
            summary: `Explain why "${label}" is not editable.`,
        };
    }

    const entity_type = ctx.default_entity_type;
    return {
        kind: "unknown",
        entity_type,
        entity_display_label: entityLabel(ctx, entity_type),
        field_key: null,
        field_label: null,
        surface: null,
        summary: "Configuration command not recognized; refine your request.",
    };
}
