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
    CHILD_PROFILE_ENTITY_TYPE,
    type ChildProfileFieldProjection,
} from "@/lib/forms/childProfileFieldProjection";
import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    SYSTEM_FIELD_BY_ID,
    type SystemFieldRegistryEntry,
} from "@/lib/forms/systemFieldRegistry";
import type { LifecycleFieldPaletteEntry } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { lifecycleFieldRuleBinding } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

/** How the builder should materialize a picked library entry. */
export type ProcessingLibraryFieldAdd =
    | { kind: "registry"; registryId: string }
    | {
          kind: "bound";
          entityType: string;
          fieldKey: string;
          builderType: BuilderFieldType;
          /** The organization vocabulary this field is declared over, when it has one. */
          optionSetKey?: string;
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
    // Registry entity names, for collapsing curated duplicates back to a natural group.
    guardian: "parent",
    enrollment: "enrollment",
    household: "household",
    /*
     * A CHILD IS A PERSON TOO, AND THAT IS WHY THIS MAP IS NOT ENOUGH ON ITS OWN.
     *
     * Grain here is inferred from the entity a field is STORED on, and `person` holds guardians —
     * so `person.gender` is correctly filed under Parent / Guardian. The child's own person
     * attributes live on `customer_member`, which the lifecycle palette does not load
     * (`LIFECYCLE_FIELD_ENTITY_TYPES`), so no child-grain Gender is offered at all and the single
     * Gender in the picker reads as though it were the child's.
     *
     * The mapping is declared here so the grain is right the moment that entity is carried, rather
     * than leaving a second wrong-owner bug behind the first fix.
     */
    customer_member: "child",
};

/**
 * Registry lookup by capture key.
 *
 * The palette speaks bare entity field keys (`person` / `first_name`); the registry's own
 * `field_key` is the prefixed form (`guardian_first_name`). Joining on `${entity}:${field_key}`
 * therefore never matched, every palette rule fell through to an unbound "bound" offer, and the
 * curated overlay re-added the same field under a second label — two "first name" entries for
 * parents, three for guardian email/phone.
 *
 * `lifecycleFieldRuleBinding(ruleId).form_capture_keys` is the platform's own answer to "which form
 * field satisfies this rule" (it is what `evaluateFormsLifecycleFieldCoverage` matches on), and its
 * entries are exactly registry field keys. Join on that.
 */
const REGISTRY_BY_CAPTURE_KEY = new Map<string, SystemFieldRegistryEntry>();
for (const entry of OPERATIONAL_FORM_SYSTEM_FIELDS) {
    for (const key of [entry.id, entry.field_key, entry.shared_value_key]) {
        if (key && !REGISTRY_BY_CAPTURE_KEY.has(key)) REGISTRY_BY_CAPTURE_KEY.set(key, entry);
    }
}

function registryEntryForPalette(entry: LifecycleFieldPaletteEntry): SystemFieldRegistryEntry | null {
    const binding = lifecycleFieldRuleBinding(entry.rule_id);
    for (const captureKey of binding?.form_capture_keys ?? []) {
        const hit = REGISTRY_BY_CAPTURE_KEY.get(captureKey);
        if (hit) return hit;
    }
    // Org custom fields have no binding; try the palette's own key before giving up.
    return (entry.field_key && REGISTRY_BY_CAPTURE_KEY.get(entry.field_key)) || null;
}

/**
 * Curated label overlay. Only borrow a curated label when that curated entry sits in the SAME group
 * the palette rule belongs to — otherwise its framing is about a different use of the field
 * (guardian_email as "Emergency email" vs "Parent email") and would mislabel the requirement.
 */
function curatedLabelSourceFor(
    registryId: string,
    group: ProcessingBuilderLibraryGroup
): (typeof PROCESSING_BUILDER_CANONICAL_FIELDS)[number] | undefined {
    return PROCESSING_BUILDER_CANONICAL_FIELDS.find(
        (c) => c.registryId === registryId && c.group === group
    );
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

/**
 * The Form answer type for a palette entry, or `null` when Forms cannot represent it.
 *
 * `null` is a real answer. A canonical field whose declared type has no Form equivalent is offered
 * as an explicit dead end rather than quietly downgraded to a text box, because a text box that
 * claims to write to a typed canonical field is a lie the administrator cannot see.
 */
function builderTypeFor(entry: LifecycleFieldPaletteEntry, registry: SystemFieldRegistryEntry | null): BuilderFieldType | null {
    if (registry) return KIND_TO_BUILDER_TYPE[registry.suggested_kind] ?? "short_text";
    /*
     * The organization's OWN answer, before any guess.
     *
     * `field_definitions.field_type` is what the Data Model says this field is. Reaching the key
     * spelling first is how `person.gender` — declared a `select` over `person_gender` — became a
     * short text box: no regex below matches "gender", so it fell to the default. A canonical field
     * that Alloy already types must never be re-derived from its name.
     */
    const declared = entry.canonical_field_type?.trim();
    if (declared) return KIND_TO_BUILDER_TYPE[declared] ?? null;
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
    multiselect: "Multi-select",
    boolean: "Yes / No",
    signature: "Signature",
    file_ref: "File upload",
    // A canonical field is never a party collection; the picker cannot offer one.
    party_collection: "Repeated people",
    // Nor a whole address: the picker offers the individual canonical parts, and the ADDRESS is
    // composed from them by the answer type rather than being a field in the catalogue.
    structured_address: "Address",
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
    /*
     * THE OWNER IS THE ENTITY THE FIELD ACTUALLY LIVES ON.
     *
     * A palette rule carries the entity its RULE is written against; the registry entry it resolves
     * to carries the entity the field is STORED on, and those disagree for any child-grain fact a
     * guardian-facing rule asks for. `child_allergies` is declared `entity_type: "child"` in the
     * registry and was reaching the picker under Parent / Guardian because the rule that asks for
     * it is written against `person`.
     *
     * The registry's own entity is the stronger statement — it is where the answer is written — so
     * it decides the grain. This is not the curated overlay relocating anything: a curated entry may
     * still only lend a nicer LABEL, and the guard below keeps it in the resolved group.
     */
    const group = (registry ? ENTITY_GROUP[registry.entity_type] : undefined) ?? ENTITY_GROUP[entry.entity] ?? "system";
    const curated = registry ? curatedLabelSourceFor(registry.id, group) : undefined;
    const builderType = builderTypeFor(entry, registry);

    // `form_coverage_supported` is the platform's OWN answer to "can a form capture this", and a
    // resolvable registry entry is proof that it can. `config_only` is NOT part of this decision:
    // it is derived from `runtime_enforced` (lifecycleFieldPaletteMerge.ts) and means "the runtime
    // does not enforce this rule" — unrelated to capture. Reading it as "not form-capturable"
    // mislabeled Date of birth and Location (both `form_coverage_supported: true`) and, because
    // `orgRowToPalette` sets `config_only: true` on EVERY org custom field, mislabeled every custom
    // field the tenant had defined.
    /*
     * `builderType === null` is the second reason a field cannot be captured: the organization
     * declared a type this form builder has no answer control for. Failing closed here keeps the
     * field visible and honest ("tracked on the record") instead of inserting a text box that
     * silently loses the field's semantics.
     */
    /*
     * A choice with no answers is the same lie in a different shape. `location_id`,
     * `primary_contact_id` and `pipeline_stage_id` are declared `select` but point at ROWS in
     * another table rather than at a list of answers — the picker offered them as dropdowns with
     * nothing in them, which a family cannot answer and an administrator cannot fix.
     */
    const choiceWithoutAnswers =
        !registry
        && (builderType === "select" || builderType === "multiselect")
        && !entry.canonical_option_set_key
        && entry.canonical_field_type != null
        && entry.canonical_has_inline_options !== true;
    const captureUnsupported =
        (!entry.form_coverage_supported && !registry) || builderType === null || choiceWithoutAnswers;

    return {
        id: entry.rule_id,
        ruleId: entry.rule_id,
        label: curated?.pickerLabel ?? entry.field_label,
        meta: captureUnsupported
            ? "Tracked on the record — cannot be captured by a form"
            : `${BUILDER_TYPE_META[builderType!]} · ${GROUP_META_LABEL[group]}`,
        group,
        add:
            registry ?
                { kind: "registry", registryId: registry.id }
            :   {
                    kind: "bound",
                    entityType: entry.entity,
                    fieldKey: entry.field_key ?? entry.rule_id,
                    builderType: builderType ?? "short_text",
                    // Carried so the inserted question is backed by the SAME list the record is.
                    ...(entry.canonical_option_set_key && (builderType === "select" || builderType === "multiselect")
                        ? { optionSetKey: entry.canonical_option_set_key }
                        : {}),
                },
        ...(tier ? { tier } : {}),
        ...(captureUnsupported ? { captureUnsupported: true } : {}),
    };
}

/**
 * Curated entries that no palette rule covers — still worth offering (allergies, signature, …).
 *
 * Several curated entries describe the SAME registry field under different operator framings
 * (`guardian_email` is both "Parent email" and "Emergency email"). Offering both would put two form
 * fields on one underlying key, so a shared field collapses to a single offer that uses the
 * registry's own label and its entity-natural group rather than arbitrarily picking one framing.
 */
function curatedExtras(claimedRegistryIds: ReadonlySet<string>): ProcessingLibraryFieldOffer[] {
    const byRegistryId = new Map<string, (typeof PROCESSING_BUILDER_CANONICAL_FIELDS)[number][]>();
    for (const curated of PROCESSING_BUILDER_CANONICAL_FIELDS) {
        if (claimedRegistryIds.has(curated.registryId)) continue;
        if (!resolveProcessingBuilderRegistryEntry(curated)) continue;
        byRegistryId.set(curated.registryId, [...(byRegistryId.get(curated.registryId) ?? []), curated]);
    }

    const out: ProcessingLibraryFieldOffer[] = [];
    for (const [registryId, entries] of byRegistryId) {
        const only = entries.length === 1 ? entries[0] : undefined;
        if (only) {
            out.push({
                id: only.id,
                ruleId: null,
                label: only.pickerLabel,
                meta: only.pickerMeta,
                group: only.group,
                add: { kind: "registry", registryId },
            });
            continue;
        }
        const registry = resolveProcessingBuilderRegistryEntry(entries[0]!)!;
        out.push({
            id: registryId,
            ruleId: null,
            label: registry.default_label,
            meta: entries[0]!.pickerMeta,
            group: ENTITY_GROUP[registry.entity_type] ?? entries[0]!.group,
            add: { kind: "registry", registryId },
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
    /**
     * The child's own profile fields (`customer_member`).
     *
     * Carried separately because the lifecycle palette's entity vocabulary cannot express this
     * owner — see `lib/forms/childProfileFieldProjection.ts` for why widening that contract would
     * have changed what Create Lead and public submission validation require.
     */
    childProfile?: readonly ChildProfileFieldProjection[];
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

    let offers: ProcessingLibraryFieldOffer[] = [];
    const claimedRegistryIds = new Set<string>();
    const seenIds = new Set<string>();

    for (const entry of input.palette) {
        // Every palette entry is offered. The picker must mirror the field vocabulary `/fields` and
        // `/surfaces` show — those apply no `config_only` filter either. Filtering on it here hid
        // most of the platform catalog AND every org custom field (orgRowToPalette marks them all
        // `config_only: true`), which is exactly what this library was built to stop doing.
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

    /*
     * THE CHILD'S OWN PROFILE.
     *
     * `person.gender` is the guardian's and stays the guardian's. The child's gender lives on
     * `customer_member`, which the lifecycle palette's entity vocabulary cannot name, so these are
     * projected from the platform's child-profile manifest intersected with the org's own rows —
     * canonical data, not a curated list, and nothing here names a field.
     */
    /*
     * A CONCEPT ALREADY OFFERED AT CHILD GRAIN IS NOT OFFERED TWICE.
     *
     * `child_allergies` is an established child-grain destination in the system field registry, and
     * the child profile manifest carries `allergies` as well. Offering both put two identical
     * "Allergies" entries under Child, writing to different destinations, with nothing for an
     * administrator to choose between — and picking the manifest one would have created a second
     * home for a Health-classified fact that the Health contract has not yet given a writer.
     *
     * The established offer wins. Suppression is by concept at the same grain, so this is a rule
     * about duplication rather than a rule about allergies.
     */
    const claimedChildLabels = new Set(
        offers.filter((o) => o.group === "child").map((o) => o.label.trim().toLowerCase()),
    );
    for (const field of input.childProfile ?? []) {
        const id = `${CHILD_PROFILE_ENTITY_TYPE}:${field.field_key}`;
        if (seenIds.has(id)) continue;
        if (claimedChildLabels.has(field.label.trim().toLowerCase())) continue;
        seenIds.add(id);
        const builderType = KIND_TO_BUILDER_TYPE[field.field_type] ?? null;
        const unsupported =
            builderType === null
            || ((builderType === "select" || builderType === "multiselect")
                && !field.option_set_key
                && !field.has_inline_options);
        offers.push({
            id,
            ruleId: null,
            label: field.label,
            meta: unsupported
                ? "Tracked on the record — cannot be captured by a form"
                : `${BUILDER_TYPE_META[builderType!]} · Child`,
            group: "child",
            add: {
                kind: "bound",
                entityType: CHILD_PROFILE_ENTITY_TYPE,
                fieldKey: field.field_key,
                builderType: builderType ?? "short_text",
                ...(field.option_set_key && (builderType === "select" || builderType === "multiselect")
                    ? { optionSetKey: field.option_set_key }
                    : {}),
            },
            ...(unsupported ? { captureUnsupported: true } : {}),
        });
    }

    /*
     * TWO FIELDS, ONE WORD, DIFFERENT RECORDS.
     *
     * `Start date` exists at child grain and at enrollment grain; `Vertical` at enrollment and at
     * household; `Location` at child and at enrollment. An administrator scanning the picker sees
     * the same word twice with nothing to choose between them, and the two write to different
     * canonical owners — so picking the wrong one is silent and permanent.
     *
     * Where a label is claimed by more than one grain, each copy is named by the grain that owns
     * it. Nothing is invented: the prefix is the operator word for the group the offer is already
     * in, so a label only changes when it was genuinely ambiguous. A label owned by one grain is
     * left exactly as the organization wrote it.
     */
    /*
     * ONE DESTINATION, ONE OFFER.
     *
     * The identity of a destination is its BINDING, not the picker row that reached it — the
     * inspector has always matched on `entity.field_key` for exactly this reason. Two stage rules
     * can ask for the same registry field (a child-grain rule and a guardian-grain rule both
     * needing `start_date`), and once grain follows the record the answer is written to, both land
     * in the same group as two rows reading `Desired start date` with nothing to tell them apart.
     *
     * Keeping the first is safe: they resolve to the same field, so the second adds a choice
     * without adding an option. A tier the later row carries is preserved, because "this stage
     * requires it" is information the survivor should not lose.
     */
    const byBinding = new Map<string, ProcessingLibraryFieldOffer>();
    const deduped: ProcessingLibraryFieldOffer[] = [];
    for (const offer of offers) {
        const binding =
            offer.add.kind === "bound"
                ? `${offer.add.entityType}.${offer.add.fieldKey}`
                : `registry:${offer.add.registryId}`;
        const key = `${offer.group}::${binding}`;
        const kept = byBinding.get(key);
        if (kept) {
            if (!kept.tier && offer.tier) kept.tier = offer.tier;
            continue;
        }
        byBinding.set(key, offer);
        deduped.push(offer);
    }
    offers = deduped;

    const labelOwners = new Map<string, Set<ProcessingBuilderLibraryGroup>>();
    for (const offer of offers) {
        if (offer.captureUnsupported) continue;
        const key = offer.label.trim().toLowerCase();
        const seen = labelOwners.get(key) ?? new Set<ProcessingBuilderLibraryGroup>();
        seen.add(offer.group);
        labelOwners.set(key, seen);
    }
    for (const offer of offers) {
        if (offer.captureUnsupported) continue;
        const owners = labelOwners.get(offer.label.trim().toLowerCase());
        if (!owners || owners.size < 2) continue;
        offer.label = `${GROUP_META_LABEL[offer.group]} — ${offer.label}`;
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
