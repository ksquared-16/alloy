/**
 * Child-scoped relationship / contact resolution for drawer relationship widgets.
 *
 * Doctrine: household membership ≠ child responsibility. Person identity is global;
 * relationship roles may be scoped to household, child, opportunity, or billing context.
 */

import type { ChildScopedContactLinkRow, PersonHouseholdAdultLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";
import { buildPersonDrawerRelationshipGroups } from "@/lib/admin/person/buildPersonDrawerRelationshipGroups";
import {
    normPersonDrawerHouseholdRole,
    PERSON_DRAWER_HOUSEHOLD_BILLING_ROLES,
    PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES,
    PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES,
    PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES,
    guardianRolePrecedence,
} from "@/lib/admin/person/personDrawerHouseholdRoles";
import {
    filterRelatedListRowsExcludingActiveRecord,
    resolveLayoutRuntimeActiveRecordContext,
    type LayoutRuntimeActiveRecordContext,
} from "@/lib/layout/runtime/layoutRuntimeRelatedListActiveRecord";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const RELATIONSHIP_WIDGET_KEYS = [
    "guardians_for_child",
    "emergency_contacts_for_child",
    "authorized_pickup_for_child",
    "billing_contacts_for_child",
    "household_members",
    "related_children_for_person",
] as const;

export type RelationshipWidgetKey = (typeof RELATIONSHIP_WIDGET_KEYS)[number];

export const RELATIONSHIP_CONTACT_SCOPES = ["household", "child", "opportunity", "person"] as const;

export type RelationshipContactScope = (typeof RELATIONSHIP_CONTACT_SCOPES)[number];

export const RELATIONSHIP_CONTACT_DISPLAY_MODES = ["list", "cards", "table", "grouped_by_child"] as const;

export type RelationshipContactDisplayMode = (typeof RELATIONSHIP_CONTACT_DISPLAY_MODES)[number];

export type LayoutRuntimeRelationshipWidgetConfig = {
    scope: RelationshipContactScope;
    roleTypes: string[];
    includeHouseholdFallback: boolean;
    excludeActiveRecord: boolean;
    maxItems: number;
    displayMode: RelationshipContactDisplayMode;
};

export type ScopedRelationshipContactRow = {
    person_id: string | null;
    contact_id: string | null;
    display_name: string;
    role_type: string | null;
    role_label: string | null;
    is_primary: boolean;
    phone: string | null;
    email: string | null;
    child_person_id: string | null;
    child_display_name: string | null;
    customer_member_id: string | null;
    source: "child_scoped" | "household_fallback" | "household" | "person_relationship";
};

export type ScopedRelationshipContactGroup = {
    key: string;
    title: string;
    child_person_id: string | null;
    child_display_name: string | null;
    contacts: ScopedRelationshipContactRow[];
};

const WIDGET_DEFAULTS: Record<RelationshipWidgetKey, LayoutRuntimeRelationshipWidgetConfig> = {
    guardians_for_child: {
        scope: "child",
        roleTypes: ["parent", "guardian", "primary_contact", "primary", "secondary_guardian", "secondary"],
        includeHouseholdFallback: true,
        excludeActiveRecord: true,
        maxItems: 12,
        displayMode: "cards",
    },
    emergency_contacts_for_child: {
        scope: "child",
        roleTypes: ["emergency_contact", "emergency"],
        includeHouseholdFallback: true,
        excludeActiveRecord: true,
        maxItems: 12,
        displayMode: "cards",
    },
    authorized_pickup_for_child: {
        scope: "child",
        roleTypes: ["authorized_pickup", "pickup"],
        includeHouseholdFallback: true,
        excludeActiveRecord: true,
        maxItems: 12,
        displayMode: "cards",
    },
    billing_contacts_for_child: {
        scope: "child",
        roleTypes: ["payer", "billing", "billing_responsible", "billing_contact"],
        includeHouseholdFallback: true,
        excludeActiveRecord: true,
        maxItems: 8,
        displayMode: "cards",
    },
    household_members: {
        scope: "household",
        roleTypes: [],
        includeHouseholdFallback: false,
        excludeActiveRecord: true,
        maxItems: 24,
        displayMode: "list",
    },
    related_children_for_person: {
        scope: "person",
        roleTypes: [],
        includeHouseholdFallback: false,
        excludeActiveRecord: false,
        maxItems: 24,
        displayMode: "grouped_by_child",
    },
};

export const LAYOUT_EDITOR_RELATIONSHIP_WIDGET_CONFIG_METADATA_KEY = "layoutEditorRelationshipWidgetConfig" as const;

function trimId(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

export function isRelationshipWidgetKey(value: string): value is RelationshipWidgetKey {
    return (RELATIONSHIP_WIDGET_KEYS as readonly string[]).includes(value);
}

export function defaultRelationshipWidgetConfig(widgetKey: RelationshipWidgetKey): LayoutRuntimeRelationshipWidgetConfig {
    return { ...WIDGET_DEFAULTS[widgetKey] };
}

export function readLayoutRuntimeRelationshipWidgetConfig(
    widgetKey: RelationshipWidgetKey,
    metadata?: Record<string, unknown> | null,
): LayoutRuntimeRelationshipWidgetConfig {
    const defaults = defaultRelationshipWidgetConfig(widgetKey);
    const raw = metadata?.[LAYOUT_EDITOR_RELATIONSHIP_WIDGET_CONFIG_METADATA_KEY];
    if (!raw || typeof raw !== "object") return defaults;
    const patch = raw as Partial<LayoutRuntimeRelationshipWidgetConfig>;
    return {
        scope: patch.scope && (RELATIONSHIP_CONTACT_SCOPES as readonly string[]).includes(patch.scope) ?
                patch.scope
            :   defaults.scope,
        roleTypes: Array.isArray(patch.roleTypes) ?
                patch.roleTypes.map(String).filter(Boolean)
            :   defaults.roleTypes,
        includeHouseholdFallback: patch.includeHouseholdFallback ?? defaults.includeHouseholdFallback,
        excludeActiveRecord: patch.excludeActiveRecord ?? defaults.excludeActiveRecord,
        maxItems:
            typeof patch.maxItems === "number" && patch.maxItems > 0 ?
                Math.round(patch.maxItems)
            :   defaults.maxItems,
        displayMode:
            patch.displayMode && (RELATIONSHIP_CONTACT_DISPLAY_MODES as readonly string[]).includes(patch.displayMode) ?
                patch.displayMode
            :   defaults.displayMode,
    };
}

function roleMatchesConfigured(roleType: string | null | undefined, roleTypes: string[]): boolean {
    if (roleTypes.length === 0) return true;
    const role = normPersonDrawerHouseholdRole(roleType);
    const normalizedTargets = new Set(roleTypes.map((r) => normPersonDrawerHouseholdRole(r)));
    return normalizedTargets.has(role);
}

function roleSetForWidgetKey(widgetKey: RelationshipWidgetKey): Set<string> | null {
    switch (widgetKey) {
        case "guardians_for_child":
            return PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES;
        case "emergency_contacts_for_child":
            return PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES;
        case "authorized_pickup_for_child":
            return PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES;
        case "billing_contacts_for_child":
            return PERSON_DRAWER_HOUSEHOLD_BILLING_ROLES;
        default:
            return null;
    }
}

function adultLinkMatchesWidget(link: PersonHouseholdAdultLinkRow, widgetKey: RelationshipWidgetKey, config: LayoutRuntimeRelationshipWidgetConfig): boolean {
    const role = normPersonDrawerHouseholdRole(link.role_type);
    const preset = roleSetForWidgetKey(widgetKey);
    if (preset) return preset.has(role);
    return roleMatchesConfigured(link.role_type, config.roleTypes);
}

function scopedLinkToContactRow(link: ChildScopedContactLinkRow, source: ScopedRelationshipContactRow["source"]): ScopedRelationshipContactRow {
    return {
        person_id: link.person_id,
        contact_id: link.contact_id,
        display_name: link.display_name,
        role_type: link.role_type,
        role_label: link.role_label,
        is_primary: link.is_primary,
        phone: link.phone,
        email: link.email,
        child_person_id: link.child_person_id,
        child_display_name: null,
        customer_member_id: link.customer_member_id,
        source,
    };
}

function adultLinkToContactRow(link: PersonHouseholdAdultLinkRow): ScopedRelationshipContactRow {
    return {
        person_id: link.person_id,
        contact_id: null,
        display_name: trimId(link.display_name) ?? "Unnamed",
        role_type: link.role_type,
        role_label: link.role_label,
        is_primary: link.is_household_primary_contact || link.is_primary,
        phone: null,
        email: null,
        child_person_id: null,
        child_display_name: null,
        customer_member_id: null,
        source: "household_fallback",
    };
}

function sortContacts(rows: ScopedRelationshipContactRow[]): ScopedRelationshipContactRow[] {
    return [...rows].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        const rank = guardianRolePrecedence(a.role_type) - guardianRolePrecedence(b.role_type);
        if (rank !== 0) return rank;
        return a.display_name.localeCompare(b.display_name);
    });
}

function dedupeContacts(rows: ScopedRelationshipContactRow[]): ScopedRelationshipContactRow[] {
    const seen = new Set<string>();
    const out: ScopedRelationshipContactRow[] = [];
    for (const row of rows) {
        const key = row.person_id ?? row.contact_id ?? row.display_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

function resolveActiveChildContext(record: ProofRuntimeRecord): {
    childPersonId: string | null;
    customerMemberId: string | null;
} {
    const context = resolveLayoutRuntimeActiveRecordContext(record);
    const childPersonId =
        context.activeChildPersonId
        ?? trimId(record["child.id"])
        ?? (context.anchorEntity === "child" ? trimId(record.id) : null);
    const customerMemberId =
        trimId(record.customer_member_id)
        ?? trimId(record["child.customer_member_id"])
        ?? null;
    return { childPersonId, customerMemberId };
}

function readChildScopedLinks(record: ProofRuntimeRecord): ChildScopedContactLinkRow[] {
    const raw = record._child_scoped_contact_links;
    return Array.isArray(raw) ? (raw as ChildScopedContactLinkRow[]) : [];
}

/** When true, household fallback must not mask a failed scoped-links query. */
export function childScopedContactLinksQueryFailed(record: ProofRuntimeRecord): boolean {
    return record._child_scoped_contact_links_query_failed === true;
}

function mayUseHouseholdFallback(record: ProofRuntimeRecord, config: LayoutRuntimeRelationshipWidgetConfig): boolean {
    return config.includeHouseholdFallback && !childScopedContactLinksQueryFailed(record);
}

function readHouseholdAdultLinks(record: ProofRuntimeRecord): PersonHouseholdAdultLinkRow[] {
    const raw = record._household_adult_links;
    return Array.isArray(raw) ? (raw as PersonHouseholdAdultLinkRow[]) : [];
}

function filterChildScopedLinks(
    links: ChildScopedContactLinkRow[],
    childPersonId: string | null,
    customerMemberId: string | null,
    config: LayoutRuntimeRelationshipWidgetConfig,
): ChildScopedContactLinkRow[] {
    return links.filter((link) => {
        const matchesChild =
            (childPersonId && link.child_person_id === childPersonId)
            || (customerMemberId && link.customer_member_id === customerMemberId);
        if (!matchesChild) return false;
        return roleMatchesConfigured(link.role_type, config.roleTypes);
    });
}

function householdFallbackContacts(
    record: ProofRuntimeRecord,
    widgetKey: RelationshipWidgetKey,
    config: LayoutRuntimeRelationshipWidgetConfig,
    viewingPersonId: string | null,
): ScopedRelationshipContactRow[] {
    return readHouseholdAdultLinks(record)
        .filter((link) => !viewingPersonId || link.person_id !== viewingPersonId)
        .filter((link) => adultLinkMatchesWidget(link, widgetKey, config))
        .map(adultLinkToContactRow);
}

function applyActiveRecordExclusion(
    rows: ScopedRelationshipContactRow[],
    record: ProofRuntimeRecord,
    config: LayoutRuntimeRelationshipWidgetConfig,
): ScopedRelationshipContactRow[] {
    if (!config.excludeActiveRecord) return rows;
    const context = resolveLayoutRuntimeActiveRecordContext(record);
    if (context.anchorEntity !== "person" && context.anchorEntity !== "child") return rows;
    const activeId = context.activePersonId ?? context.activeChildPersonId;
    if (!activeId) return rows;
    return rows.filter((row) => row.person_id !== activeId);
}

function capRows(rows: ScopedRelationshipContactRow[], maxItems: number): ScopedRelationshipContactRow[] {
    return rows.slice(0, maxItems);
}

/** Resolve flat contact rows for a relationship widget on the current drawer record. */
export function resolveLayoutRuntimeScopedRelationshipContacts(
    record: ProofRuntimeRecord,
    widgetKey: RelationshipWidgetKey,
    configOverride?: Partial<LayoutRuntimeRelationshipWidgetConfig>,
): ScopedRelationshipContactRow[] {
    const config: LayoutRuntimeRelationshipWidgetConfig = {
        ...defaultRelationshipWidgetConfig(widgetKey),
        ...configOverride,
    };
    const { childPersonId, customerMemberId } = resolveActiveChildContext(record);
    const viewingPersonId = resolveLayoutRuntimeActiveRecordContext(record).activePersonId;

    if (widgetKey === "household_members" || config.scope === "household") {
        const rows = readHouseholdAdultLinks(record)
            .filter((link) => !viewingPersonId || link.person_id !== viewingPersonId)
            .map((link) => ({ ...adultLinkToContactRow(link), source: "household" as const }));
        return capRows(
            applyActiveRecordExclusion(sortContacts(dedupeContacts(rows)), record, config),
            config.maxItems,
        );
    }

    if (widgetKey === "related_children_for_person" || config.scope === "person") {
        return [];
    }

    const scoped = filterChildScopedLinks(readChildScopedLinks(record), childPersonId, customerMemberId, config).map(
        (link) => scopedLinkToContactRow(link, "child_scoped"),
    );

    let rows = scoped;
    if (rows.length === 0 && mayUseHouseholdFallback(record, config)) {
        rows = householdFallbackContacts(record, widgetKey, config, viewingPersonId);
    }

    return capRows(
        applyActiveRecordExclusion(sortContacts(dedupeContacts(rows)), record, config),
        config.maxItems,
    );
}

function readInquiryChildren(record: ProofRuntimeRecord): Array<{
    customer_member_id: string | null;
    person_id: string | null;
    display_name: string;
}> {
    const keys = ["_inquiry_children", "children", "_household_children", "household_children"] as const;
    for (const key of keys) {
        const raw = record[key];
        if (!Array.isArray(raw)) continue;
        const mapped = raw
            .map((row) => {
                if (!row || typeof row !== "object") return null;
                const r = row as Record<string, unknown>;
                const display_name =
                    trimId(r["child.name"])
                    ?? trimId(r.display_name)
                    ?? trimId(r.name)
                    ?? "Unnamed child";
                return {
                    customer_member_id:
                        trimId(r.customer_member_id)
                        ?? trimId(r["child.customer_member_id"])
                        ?? trimId(r.id),
                    person_id: trimId(r.person_id) ?? trimId(r["child.id"]) ?? trimId(r.id),
                    display_name,
                };
            })
            .filter((row): row is NonNullable<typeof row> => row != null);
        if (mapped.length > 0) return mapped;
    }
    return [];
}

/** Person drawer — children linked to viewing person with per-child role contact groups. */
export function resolveLayoutRuntimeRelatedChildrenForPerson(
    record: ProofRuntimeRecord,
    widgetKey: RelationshipWidgetKey = "related_children_for_person",
    configOverride?: Partial<LayoutRuntimeRelationshipWidgetConfig>,
): ScopedRelationshipContactGroup[] {
    const config = { ...defaultRelationshipWidgetConfig(widgetKey), ...configOverride };
    const viewingPersonId = trimId(record.id) ?? trimId(record["person.id"]) ?? "";
    const relationshipGroups = buildPersonDrawerRelationshipGroups({
        person_id: viewingPersonId,
        person_relationships: record._person_relationships as Parameters<
            typeof buildPersonDrawerRelationshipGroups
        >[0]["person_relationships"],
        household_child_links: record._household_child_links as Parameters<
            typeof buildPersonDrawerRelationshipGroups
        >[0]["household_child_links"],
        household_adult_links: record._household_adult_links as Parameters<
            typeof buildPersonDrawerRelationshipGroups
        >[0]["household_adult_links"],
        sibling_links: record._sibling_links as Parameters<
            typeof buildPersonDrawerRelationshipGroups
        >[0]["sibling_links"],
    });

    const childLinks = [...relationshipGroups.children, ...relationshipGroups.siblings];
    const scopedLinks = readChildScopedLinks(record);
    const groups: ScopedRelationshipContactGroup[] = [];

    for (const child of childLinks) {
        const childPersonId = trimId(child.person_id);
        const memberId = trimId(child.customer_member_id);
        const childScoped = scopedLinks
            .filter(
                (link) =>
                    (childPersonId && link.child_person_id === childPersonId)
                    || (memberId && link.customer_member_id === memberId),
            )
            .map((link) => scopedLinkToContactRow(link, "child_scoped"));

        if (childScoped.length === 0) continue;

        groups.push({
            key: memberId ?? childPersonId ?? child.display_name ?? "child",
            title: trimId(child.display_name) ?? "Child",
            child_person_id: childPersonId,
            child_display_name: trimId(child.display_name),
            contacts: capRows(sortContacts(dedupeContacts(childScoped)), config.maxItems),
        });
    }

    return groups;
}

/** Opportunity drawer — contacts grouped per enrolled child (no flat ambiguous merge). */
export function resolveLayoutRuntimeOpportunityRelationshipContactGroups(
    record: ProofRuntimeRecord,
    widgetKey: RelationshipWidgetKey,
    configOverride?: Partial<LayoutRuntimeRelationshipWidgetConfig>,
): ScopedRelationshipContactGroup[] {
    const config = { ...defaultRelationshipWidgetConfig(widgetKey), ...configOverride };
    const children = readInquiryChildren(record);
    const scopedLinks = readChildScopedLinks(record);
    const groups: ScopedRelationshipContactGroup[] = [];

    for (const child of children) {
        const childScoped = scopedLinks
            .filter(
                (link) =>
                    (child.person_id && link.child_person_id === child.person_id)
                    || (child.customer_member_id && link.customer_member_id === child.customer_member_id),
            )
            .filter((link) => roleMatchesConfigured(link.role_type, config.roleTypes))
            .map((link) => ({
                ...scopedLinkToContactRow(link, "child_scoped"),
                child_display_name: child.display_name,
            }));

        let contacts: ScopedRelationshipContactRow[] = childScoped;
        if (contacts.length === 0 && mayUseHouseholdFallback(record, config) && children.length === 1) {
            contacts = householdFallbackContacts(record, widgetKey, config, null).map((row) => ({
                ...row,
                child_display_name: child.display_name,
            }));
        }

        groups.push({
            key: child.customer_member_id ?? child.person_id ?? child.display_name,
            title: child.display_name,
            child_person_id: child.person_id,
            child_display_name: child.display_name,
            contacts: capRows(sortContacts(dedupeContacts(contacts)), config.maxItems),
        });
    }

    return groups.filter((group) => group.contacts.length > 0 || config.scope === "opportunity");
}

export function scopedRelationshipContactsToRepeaterRows(
    contacts: ScopedRelationshipContactRow[],
): ProofRuntimeRecord[] {
    return contacts.map((contact, index) => ({
        id: contact.person_id ?? contact.contact_id ?? `contact-${index}`,
        person_id: contact.person_id ?? "",
        "person.id": contact.person_id ?? "",
        "person.primary_contact_name": contact.display_name,
        "person.display_name": contact.display_name,
        "person.household_role": contact.role_label ?? contact.role_type ?? "",
        "person.primary_phone": contact.phone ?? "",
        "person.primary_email": contact.email ?? "",
        "person.is_primary": contact.is_primary ? "Primary" : "",
    }));
}

export function layoutRuntimeRelationshipWidgetEmptyMessage(widgetKey: RelationshipWidgetKey): string {
    switch (widgetKey) {
        case "guardians_for_child":
            return "No guardians linked to this child yet.";
        case "emergency_contacts_for_child":
            return "No emergency contacts linked to this child yet.";
        case "authorized_pickup_for_child":
            return "No authorized pickup contacts for this child yet.";
        case "billing_contacts_for_child":
            return "No billing contacts linked to this child yet.";
        case "related_children_for_person":
            return "No children linked to this person yet.";
        default:
            return "No household members on this record yet.";
    }
}

export function filterRepeaterRowsForRelationshipWidget(
    rows: ProofRuntimeRecord[],
    record: ProofRuntimeRecord,
    widgetKey: RelationshipWidgetKey,
): ProofRuntimeRecord[] {
    const config = defaultRelationshipWidgetConfig(widgetKey);
    if (!config.excludeActiveRecord) return rows;
    const context = resolveLayoutRuntimeActiveRecordContext(record);
    return filterRelatedListRowsExcludingActiveRecord(
        rows,
        { kind: "related_list", refKey: "family_adults", source: "family_adults", id: widgetKey },
        context,
    );
}
