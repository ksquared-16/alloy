/**
 * Resolves tenant-facing entity labels/aliases to canonical field-definition entity_type.
 */

import { ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY } from "@/lib/admin/adminFieldEntityDisplayLabel";
import { resolveEntityLabelsForOrg, type EntityLabelRow } from "@/lib/admin/entityLabelsResolve";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CONFIGURATION_PROPOSAL_ENTITY_TYPES, type ConfigurationProposalEntityType } from "./configurationProposalV1";

export type ConfigLayoutAssistEntityResolveContext = {
    default_entity_type: ConfigurationProposalEntityType;
    aliasIndex: ReadonlyMap<string, ConfigurationProposalEntityType>;
    displayLabel: (canonical: ConfigurationProposalEntityType, form: "singular" | "plural") => string;
};

const CANONICAL_SET = new Set<string>(CONFIGURATION_PROPOSAL_ENTITY_TYPES);

/** Static aliases (vertical-neutral); tenant labels merge on top. */
const STATIC_ENTITY_ALIASES: Record<string, ConfigurationProposalEntityType> = {
    inquiry: "opportunity",
    inquiries: "opportunity",
    opportunity: "opportunity",
    opportunities: "opportunity",
    person: "person",
    persons: "person",
    people: "person",
    customer: "customer",
    customers: "customer",
    job: "job",
    jobs: "job",
    vendor: "vendor",
    vendors: "vendor",
    schedule: "schedule",
    schedules: "schedule",
    location: "location",
    locations: "location",
};

function normalizeAliasToken(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/^the\s+/, "")
        .replace(/[^a-z0-9\s_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function labelsStorageKeyToCanonical(entityTypeKey: string): ConfigurationProposalEntityType | null {
    const key = entityTypeKey.trim();
    for (const [canonical, labelsKey] of Object.entries(ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY)) {
        if (labelsKey === key && CANONICAL_SET.has(canonical)) {
            return canonical as ConfigurationProposalEntityType;
        }
    }
    if (CANONICAL_SET.has(key)) {
        return key as ConfigurationProposalEntityType;
    }
    return null;
}

function defaultDisplayLabel(canonical: ConfigurationProposalEntityType, form: "singular" | "plural"): string {
    const labelsKey = ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY[canonical] ?? canonical;
    const base = labelsKey.replace(/s$/, "");
    if (form === "plural") {
        return `${base.charAt(0).toUpperCase()}${base.slice(1)}s`;
    }
    return `${base.charAt(0).toUpperCase()}${base.slice(1)}`;
}

/**
 * Build alias index from org effective entity labels (plus static inquiry/opportunity aliases).
 */
export function buildEntityResolveContext(
    effectiveLabels: EntityLabelRow[],
    defaultEntityType: string = "opportunity"
): ConfigLayoutAssistEntityResolveContext {
    const default_entity_type = CANONICAL_SET.has(defaultEntityType)
        ? (defaultEntityType as ConfigurationProposalEntityType)
        : "opportunity";

    const aliasIndex = new Map<string, ConfigurationProposalEntityType>();
    const displayByCanonical = new Map<ConfigurationProposalEntityType, { singular: string; plural: string }>();

    for (const [alias, canonical] of Object.entries(STATIC_ENTITY_ALIASES)) {
        aliasIndex.set(normalizeAliasToken(alias), canonical);
    }

    for (const canonical of CONFIGURATION_PROPOSAL_ENTITY_TYPES) {
        displayByCanonical.set(canonical, {
            singular: defaultDisplayLabel(canonical, "singular"),
            plural: defaultDisplayLabel(canonical, "plural"),
        });
    }

    for (const row of effectiveLabels) {
        const canonical = labelsStorageKeyToCanonical(row.entity_type);
        if (!canonical) continue;

        const singular = row.singular?.trim() || defaultDisplayLabel(canonical, "singular");
        const plural = row.plural?.trim() || defaultDisplayLabel(canonical, "plural");
        displayByCanonical.set(canonical, { singular, plural });

        aliasIndex.set(normalizeAliasToken(canonical), canonical);
        aliasIndex.set(normalizeAliasToken(singular), canonical);
        aliasIndex.set(normalizeAliasToken(plural), canonical);

        const labelsKey = ADMIN_FIELD_ENTITY_TYPE_TO_LABELS_KEY[canonical];
        if (labelsKey) {
            aliasIndex.set(normalizeAliasToken(labelsKey), canonical);
        }
    }

    return {
        default_entity_type,
        aliasIndex,
        displayLabel: (canonical, form) => displayByCanonical.get(canonical)?.[form] ?? defaultDisplayLabel(canonical, form),
    };
}

export async function loadConfigLayoutAssistEntityResolveContext(
    supabase: SupabaseClient,
    orgId: string,
    defaultEntityType?: string
): Promise<ConfigLayoutAssistEntityResolveContext> {
    const labels = await resolveEntityLabelsForOrg(supabase, orgId);
    return buildEntityResolveContext(labels.effective, defaultEntityType ?? "opportunity");
}

export function resolveEntityTypeFromPhrase(
    phrase: string,
    ctx: ConfigLayoutAssistEntityResolveContext
): ConfigurationProposalEntityType {
    const normalized = normalizeAliasToken(phrase);
    if (!normalized) return ctx.default_entity_type;

    if (ctx.aliasIndex.has(normalized)) {
        return ctx.aliasIndex.get(normalized)!;
    }

    const tokens = normalized.split(/\s+/).filter(Boolean);
    for (let i = tokens.length; i >= 1; i--) {
        const slice = tokens.slice(-i).join(" ");
        if (ctx.aliasIndex.has(slice)) {
            return ctx.aliasIndex.get(slice)!;
        }
    }

    return ctx.default_entity_type;
}

/** Review URL for Settings proposal detail (supports id + proposalId query keys). */
export function buildConfigProposalReviewHref(proposalId: string | null | undefined): string {
    if (!proposalId?.trim()) {
        return "/adminV2/settings/config-proposals";
    }
    return `/adminV2/settings/config-proposals?proposalId=${encodeURIComponent(proposalId.trim())}`;
}
