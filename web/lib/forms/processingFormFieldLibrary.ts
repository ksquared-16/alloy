/**
 * Offerable fields for the Processing Form Builder library.
 *
 * The picker used to be a hand-maintained array of ~17 entries while `/process → requirements`
 * drew from the lifecycle field palette (platform rules merged with the org's own custom field
 * definitions). Roughly half the requirement vocabulary therefore had no picker entry, and coverage
 * could demand a rule the builder was structurally incapable of satisfying — a permanent
 * "missing required" with no way to fix it from the form builder.
 *
 * This derives the library from the SAME palette `/process` uses, so anything the process can
 * require is something a form can capture. The curated list survives as a presentation overlay
 * (nicer labels, operator-facing grouping) and as a source of extra non-requirement fields
 * (allergies, signature, …) that are worth offering even though no stage rule references them.
 */

import {
    PROCESSING_BUILDER_CANONICAL_FIELDS,
    PROCESSING_BUILDER_GROUP_ORDER,
    resolveProcessingBuilderRegistryEntry,
    type ProcessingBuilderLibraryGroup,
} from "@/lib/forms/processingFormBuilderLibrary";
import type { BuilderFieldType } from "@/lib/forms/formBuilderSchema";
import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    SYSTEM_FIELD_BY_ID,
    type SystemFieldRegistryEntry,
} from "@/lib/forms/systemFieldRegistry";
import type { LifecycleFieldPaletteEntry } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

/** How the builder should materialize a picked library entry. */
export type ProcessingLibraryFieldAdd =
    | { kind: "registry"; registryId: string }
    | {
          kind: "bound";
          entityType: string;
          fieldKey: string;
          builderType: BuilderFieldType;
      };

export type ProcessingLibraryFieldOffer = {
    /** Stable picker id — the lifecycle rule id when the field comes from the palette. */
    id: string;
    ruleId: string | null;
    label: string;
    meta: string;
    group: ProcessingBuilderLibraryGroup;
    add: ProcessingLibraryFieldAdd;
    /** Requirement tier at the form's configured stage, when this field is a stage rule. */
    tier?: "required" | "recommended";
    /**
     * The process references this rule but nothing a form can capture satisfies it (no field
     * binding — e.g. `opportunity:enrollment_packet`). Offered as a labeled dead end rather than
     * silently absent, so the operator learns why coverage will never clear from the builder.
     */
    captureUnsupported?: boolean;
};

export type ProcessingLibraryGroupOffer = {
    group: ProcessingBuilderLibraryGroup;
    items: ProcessingLibraryFieldOffer[];
};

const ENTITY_GROUP: Record<LifecycleRequirementEntityKey | string, ProcessingBuilderLibraryGroup> = {
    person: "parent",
    child: "child",
    opportunity: "enrollment",
    customer: "household",
};

/** Registry lookup by (entity, field_key) — the palette speaks field keys, not registry ids. */
const REGISTRY_BY_ENTITY_FIELD = new Map<string, SystemFieldRegistryEntry>();
for (const entry of OPERATIONAL_FORM_SYSTEM_FIELDS) {
    REGISTRY_BY_ENTITY_FIELD.set(`${entry.entity_type}:${entry.field_key}`, entry);
    if (entry.shared_value_key) {
        REGISTRY_BY_ENTITY_FIELD.set(`${entry.entity_type}:${entry.shared_value_key}`, entry);
    }
}

/** Palette entities and registry entities do not use identical names for the same thing. */
function registryEntityAliases(entity: string): string[] {
    if (entity === "person") return ["person", "guardian", "parent"];
    if (entity === "child") return ["child", "inquiry_child"];
    if (entity === "opportunity") return ["opportunity", "inquiry"];
    if (entity === "customer") return ["customer", "household"];
    return [entity];
}

function registryEntryForPalette(entry: LifecycleFieldPaletteEntry): SystemFieldRegistryEntry | null {
    if (!entry.field_key) return null;
    for (const alias of registryEntityAliases(entry.entity)) {
        const hit = REGISTRY_BY_ENTITY_FIELD.get(`${alias}:${entry.field_key}`);
        if (hit) return hit;
    }
    return null;
}

/** Curated presentation overlay, keyed by the registry id a curated entry resolves to. */
const CURATED_BY_REGISTRY_ID = new Map<string, (typeof PROCESSING_BUILDER_CANONICAL_FIELDS)[number]>();
for (const curated of PROCESSING_BUILDER_CANONICAL_FIELDS) {
    if (!CURATED_BY_REGISTRY_ID.has(curated.registryId)) CURATED_BY_REGISTRY_ID.set(curated.registryId, curated);
}

const KIND_TO_BUILDER_TYPE: Record<string, BuilderFieldType> = {
    text: "short_text",
    long_text: "long_text",
    textarea: "long_text",
    number: "number",
    date: "date",
    select: "select",
    multiselect: "select",
    boolean: "boolean",
    checkbox: "boolean",
    signature: "signature",
    file: "file_ref",
    file_ref: "file_ref",
    email: "short_text",
    phone: "short_text",
};

function builderTypeFor(entry: LifecycleFieldPaletteEntry, registry: SystemFieldRegistryEntry | null): BuilderFieldType {
    if (registry) return KIND_TO_BUILDER_TYPE[registry.suggested_kind] ?? "short_text";
    const key = entry.field_key ?? "";
    if (/(^|_)(date|dob|birth)($|_)/.test(key)) return "date";
    if (/(^|_)(count|number|qty|quantity|days_per_week)($|_)/.test(key)) return "number";
    if (/(^|_)(id|key|type|status|plan|cohort|group|category)$/.test(key)) return "select";
    if (/(accepted|flag|consent|opt_in)$/.test(key)) return "boolean";
    if (/(notes|comments|description)$/.test(key)) return "long_text";
    return "short_text";
}

const BUILDER_TYPE_META: Record<BuilderFieldType, string> = {
    short_text: "Short text",
    long_text: "Long text",
    text_block: "Text block",
    number: "Number",
    date: "Date",
    select: "Dropdown",
    boolean: "Yes / No",
    signature: "Signature",
    file_ref: "File upload",
};

const GROUP_META_LABEL: Record<ProcessingBuilderLibraryGroup, string> = {
    child: "Child",
    parent: "Parent",
    enrollment: "Enrollment",
    medical: "Medical",
    emergency_contacts: "Emergency",
    communication: "Communication",
    household: "Household",
    system: "System",
};

function offerFromPalette(
    entry: LifecycleFieldPaletteEntry,
    tier: "required" | "recommended" | undefined
): ProcessingLibraryFieldOffer {
    const registry = registryEntryForPalette(entry);
    const curated = registry ? CURATED_BY_REGISTRY_ID.get(registry.id) : undefined;
    const group = curated?.group ?? ENTITY_GROUP[entry.entity] ?? "system";
    const builderType = builderTypeFor(entry, registry);

    // No form field can satisfy it: the platform manages it on the record (`config_only`), it is
    // explicitly outside form coverage, or it has no field binding at all.
    const captureUnsupported = entry.config_only || !entry.form_coverage_supported || !entry.field_key;

    return {
        id: entry.rule_id,
        ruleId: entry.rule_id,
        label: curated?.pickerLabel ?? entry.field_label,
        meta: captureUnsupported
            ? "Tracked on the record — cannot be captured by a form"
            : `${BUILDER_TYPE_META[builderType]} · ${GROUP_META_LABEL[group]}`,
        group,
        add:
            registry ?
                { kind: "registry", registryId: registry.id }
            :   {
                    kind: "bound",
                    entityType: entry.entity,
                    fieldKey: entry.field_key ?? entry.rule_id,
                    builderType,
                },
        ...(tier ? { tier } : {}),
        ...(captureUnsupported ? { captureUnsupported: true } : {}),
    };
}

/** Curated entries that no palette rule covers — still worth offering (allergies, signature, …). */
function curatedExtras(claimedRegistryIds: ReadonlySet<string>): ProcessingLibraryFieldOffer[] {
    const out: ProcessingLibraryFieldOffer[] = [];
    for (const curated of PROCESSING_BUILDER_CANONICAL_FIELDS) {
        if (claimedRegistryIds.has(curated.registryId)) continue;
        const registry = resolveProcessingBuilderRegistryEntry(curated);
        if (!registry) continue;
        out.push({
            id: curated.id,
            ruleId: null,
            label: curated.pickerLabel,
            meta: curated.pickerMeta,
            group: curated.group,
            add: { kind: "registry", registryId: curated.registryId },
        });
    }
    return out;
}

export type BuildProcessingFormFieldLibraryInput = {
    /** Lifecycle palette for the form's configured stage (platform rules + org custom fields). */
    palette: readonly LifecycleFieldPaletteEntry[];
    /** Stage rule ids, so the picker can mark what this stage actually asks for. */
    requiredRuleIds?: readonly string[];
    recommendedRuleIds?: readonly string[];
};

/**
 * Build the operator-facing field library: every palette rule for the stage, plus curated extras
 * the palette does not cover. Groups follow the curated operator ordering.
 */
export function buildProcessingFormFieldLibrary(
    input: BuildProcessingFormFieldLibraryInput
): ProcessingLibraryGroupOffer[] {
    const required = new Set(input.requiredRuleIds ?? []);
    const recommended = new Set(input.recommendedRuleIds ?? []);

    const offers: ProcessingLibraryFieldOffer[] = [];
    const claimedRegistryIds = new Set<string>();
    const seenIds = new Set<string>();

    for (const entry of input.palette) {
        // `config_only` entries are NOT skipped when the stage requires them. Dropping a required
        // rule from the picker is what produced a permanently unclearable "missing required": the
        // operator is told a field is missing and given no way to add it. Show it, marked as not
        // form-capturable, so the gap is explained rather than invisible.
        if (entry.config_only && !required.has(entry.rule_id) && !recommended.has(entry.rule_id)) continue;
        if (seenIds.has(entry.rule_id)) continue;
        seenIds.add(entry.rule_id);
        const tier = required.has(entry.rule_id) ? "required" : recommended.has(entry.rule_id) ? "recommended" : undefined;
        const offer = offerFromPalette(entry, tier);
        if (offer.add.kind === "registry") claimedRegistryIds.add(offer.add.registryId);
        offers.push(offer);
    }

    for (const extra of curatedExtras(claimedRegistryIds)) {
        if (seenIds.has(extra.id)) continue;
        seenIds.add(extra.id);
        offers.push(extra);
    }

    const byGroup = new Map<ProcessingBuilderLibraryGroup, ProcessingLibraryFieldOffer[]>();
    for (const offer of offers) {
        const list = byGroup.get(offer.group) ?? [];
        list.push(offer);
        byGroup.set(offer.group, list);
    }

    // Required first, then recommended, then the rest — the stage's own asks lead the group.
    const tierRank = (o: ProcessingLibraryFieldOffer) =>
        o.captureUnsupported ? 3 : o.tier === "required" ? 0 : o.tier === "recommended" ? 1 : 2;

    return PROCESSING_BUILDER_GROUP_ORDER.map((group) => ({
        group,
        items: (byGroup.get(group) ?? []).sort((a, b) => tierRank(a) - tierRank(b) || a.label.localeCompare(b.label)),
    })).filter((g) => g.items.length > 0);
}

/** Registry entry for a picked offer, when it resolves to one. */
export function registryEntryForOffer(offer: ProcessingLibraryFieldOffer): SystemFieldRegistryEntry | null {
    if (offer.add.kind !== "registry") return null;
    const { registryId } = offer.add;
    return (
        SYSTEM_FIELD_BY_ID.get(registryId) ??
        OPERATIONAL_FORM_SYSTEM_FIELDS.find((f) => f.id === registryId) ??
        null
    );
}
