/**
 * Shared identity field composition — child, person/contact, and employee subjects.
 */

import { childProfileFieldKeyFromRef, childProfileSubjectProperty } from "@/lib/fields/customerMemberProfileSurfaces";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type {
    HouseholdEvidenceChild,
    HouseholdEvidenceContact,
} from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { HouseholdEvidenceChildExtended } from "@/lib/adminV2/runtime/focusPanel/household/householdSurfaceFields";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldPresentationLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { resolveCanonicalIdentityFieldLabel } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";

import type { PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

export type IdentityComposeSubject =
    | { kind: "child"; value: ChildrenEvidenceChild | HouseholdEvidenceChildExtended }
    | { kind: "person"; value: HouseholdEvidenceContact }
    | { kind: "contact_edit"; value: PersonContactValues }
    | { kind: "employee"; value: { id: string; name: string; title?: string | null; department?: string | null; email?: string | null; phone?: string | null; badge?: string | null; imageUrl?: string | null } };

export type ComposedIdentityLine = {
    fieldRef: string;
    label: string;
    value: string;
};


function splitDisplayName(name: string): { first: string | null; last: string | null } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: null, last: null };
    if (parts.length === 1) return { first: parts[0]!, last: null };
    return { first: parts[0]!, last: parts.slice(1).join(" ") || null };
}

function composedPersonFullName(subject: IdentityComposeSubject): string | null {
    if (subject.kind === "person") {
        const { first, last } = personNameParts(subject);
        if (first && last) return `${first} ${last}`;
        if (first) return first;
        if (last) return last;
        return subject.value.name?.trim() || null;
    }
    if (subject.kind === "contact_edit") {
        const full = [subject.value.first_name, subject.value.last_name]
            .map((part) => part?.trim())
            .filter(Boolean)
            .join(" ");
        return full || null;
    }
    return null;
}

function personAddressLine1(subject: IdentityComposeSubject): string | null {
    if (subject.kind === "person") return subject.value.addressLine1?.trim() || null;
    if (subject.kind === "contact_edit") return subject.value.address_line1?.trim() || null;
    return null;
}

function personAddressLine2(subject: IdentityComposeSubject): string | null {
    if (subject.kind === "person") return subject.value.addressLine2?.trim() || null;
    if (subject.kind === "contact_edit") return subject.value.address_line2?.trim() || null;
    return null;
}

function personCity(subject: IdentityComposeSubject): string | null {
    if (subject.kind === "person") return subject.value.city?.trim() || null;
    if (subject.kind === "contact_edit") return subject.value.city?.trim() || null;
    return null;
}

function personState(subject: IdentityComposeSubject): string | null {
    if (subject.kind === "person") return subject.value.state?.trim() || null;
    if (subject.kind === "contact_edit") return subject.value.state?.trim() || null;
    return null;
}

function personPostalCode(subject: IdentityComposeSubject): string | null {
    if (subject.kind === "person") return subject.value.postalCode?.trim() || null;
    if (subject.kind === "contact_edit") return subject.value.postal_code?.trim() || null;
    return null;
}

function personNameParts(subject: IdentityComposeSubject): { first: string | null; last: string | null } {
    if (subject.kind !== "person") return { first: null, last: null };
    const contact = subject.value;
    const explicitFirst = contact.firstName?.trim() || null;
    const explicitLast = contact.lastName?.trim() || null;
    if (explicitFirst || explicitLast) return { first: explicitFirst, last: explicitLast };
    return splitDisplayName(contact.name);
}

type Resolver = (subject: IdentityComposeSubject) => string | null;

const CHILD_RESOLVERS: Record<string, Resolver> = {
    "child.first_name": (subject) => {
        if (subject.kind !== "child") return null;
        const child = subject.value;
        return ("firstName" in child ? child.firstName : null) ?? child.name.split(" ")[0] ?? null;
    },
    "child.last_name": (subject) => {
        if (subject.kind !== "child") return null;
        const child = subject.value;
        return ("lastName" in child ? child.lastName : null) ?? (child.name.split(" ").slice(1).join(" ") || null);
    },
    "child.preferred_name": (subject) =>
        subject.kind === "child" && "preferredName" in subject.value ? subject.value.preferredName ?? null : null,
    "child.nickname": (subject) =>
        subject.kind === "child" && "nickname" in subject.value ? subject.value.nickname ?? null : null,
    "child.date_of_birth": (subject) => {
        if (subject.kind !== "child") return null;
        const child = subject.value;
        // ISO date for type=date edit controls — never the formatted dobAge line.
        const iso =
            ("dob" in child && child.dob != null ? String(child.dob).trim().slice(0, 10) : "")
            || "";
        return iso.length > 0 ? iso : null;
    },
    "child.dob_age": (subject) => {
        if (subject.kind !== "child") return null;
        const child = subject.value;
        return ("dobAge" in child ? child.dobAge : null) ?? ("age" in child ? child.age : null) ?? null;
    },
    "child.age": (subject) => {
        if (subject.kind !== "child") return null;
        const child = subject.value;
        return ("age" in child ? child.age : null) ?? ("dobAge" in child ? child.dobAge : null) ?? null;
    },
    "child.name": (subject) => (subject.kind === "child" ? subject.value.name : null),
    "child.gender": (subject) =>
        subject.kind === "child" && "gender" in subject.value
            ? (subject.value as { gender?: string | null }).gender ?? null
            : null,
    "child.allergies": (subject) =>
        subject.kind === "child" && "allergies" in subject.value
            ? (subject.value as { allergies?: string | null }).allergies ?? null
            : null,
    "child.medical_notes": (subject) =>
        subject.kind === "child" && "medicalNotes" in subject.value
            ? (subject.value as { medicalNotes?: string | null }).medicalNotes ?? null
            : null,
    "child.special_instructions": (subject) =>
        subject.kind === "child" && "specialInstructions" in subject.value
            ? (subject.value as { specialInstructions?: string | null }).specialInstructions ?? null
            : null,
    "child.age_band": (subject) =>
        subject.kind === "child" && "ageBand" in subject.value
            ? (subject.value as { ageBand?: string | null }).ageBand ?? null
            : null,
    "inquiry_child.program": (subject) =>
        subject.kind === "child" && "program" in subject.value ? subject.value.program ?? null : null,
    // Storage key is program_category_id; display value is always the program label (never the UUID).
    "inquiry_child.program_category_id": (subject) =>
        subject.kind === "child" && "program" in subject.value ? subject.value.program ?? null : null,
    "child.program": (subject) =>
        subject.kind === "child" && "program" in subject.value ? subject.value.program ?? null : null,
    // Storage key is location_id; display value is always the site label (never the UUID).
    "inquiry_child.location_id": (subject) =>
        subject.kind === "child" && "location" in subject.value
            ? (subject.value as { location?: string | null }).location ?? null
            : null,
    "child.location": (subject) =>
        subject.kind === "child" && "location" in subject.value
            ? (subject.value as { location?: string | null }).location ?? null
            : null,
    "child.room": (subject) =>
        subject.kind === "child" && "room" in subject.value ? subject.value.room ?? null : null,
    "inquiry_child.schedule_type": (subject) =>
        subject.kind === "child" && "schedule" in subject.value ? subject.value.schedule ?? null : null,
    "inquiry_child.desired_schedule_type": (subject) =>
        subject.kind === "child" && "schedule" in subject.value ? subject.value.schedule ?? null : null,
    "child.schedule": (subject) =>
        subject.kind === "child" && "schedule" in subject.value ? subject.value.schedule ?? null : null,
    "child.start_date": (subject) =>
        subject.kind === "child" && "startDate" in subject.value ? subject.value.startDate ?? null : null,
    "child.desired_start_date": (subject) =>
        subject.kind === "child" && "startDate" in subject.value ? subject.value.startDate ?? null : null,
    "inquiry_child.start_date": (subject) => {
        if (subject.kind !== "child") return null;
        const child = subject.value as {
            requestedStart?: string | null;
            startDate?: string | null;
        };
        return child.requestedStart ?? child.startDate ?? null;
    },
    "inquiry_child.requested_days_per_week": (subject) =>
        subject.kind === "child" && "requestedDaysPerWeek" in subject.value
            ? (subject.value as { requestedDaysPerWeek?: string | null }).requestedDaysPerWeek ?? null
            : null,
    "inquiry_child.weekdays": (subject) =>
        subject.kind === "child" && "preferredWeekdays" in subject.value
            ? (subject.value as { preferredWeekdays?: string | null }).preferredWeekdays ?? null
            : null,
    "child.status": (subject) =>
        subject.kind === "child" && "status" in subject.value ? subject.value.status ?? null : null,
    "child.readiness_summary": (subject) =>
        subject.kind === "child" && "needsAttention" in subject.value
            ? subject.value.needsAttention
                ? subject.value.missingLine
                : "Ready"
            : null,
    "child.medical_summary": () => null,
    "child.documents_summary": () => null,
    "child.pickup_summary": () => null,
    "child.communications_summary": () => null,
    "child.notes_summary": (subject) =>
        subject.kind === "child" && "notes" in subject.value
            ? (subject.value as { notes?: string | null }).notes ?? null
            : null,
    "inquiry_child.notes": (subject) =>
        subject.kind === "child" && "notes" in subject.value
            ? (subject.value as { notes?: string | null }).notes ?? null
            : null,
};

const CONTACT_EDIT_RESOLVERS: Record<string, Resolver> = {
    "contact.first_name": (subject) => {
        if (subject.kind === "contact_edit") return subject.value.first_name?.trim() || null;
        if (subject.kind === "person") return personNameParts(subject).first;
        return null;
    },
    "contact.last_name": (subject) => {
        if (subject.kind === "contact_edit") return subject.value.last_name?.trim() || null;
        if (subject.kind === "person") return personNameParts(subject).last;
        return null;
    },
    "contact.email": (subject) =>
        subject.kind === "contact_edit" ? subject.value.email?.trim() || null : null,
    "contact.phone": (subject) =>
        subject.kind === "contact_edit" ? subject.value.phone?.trim() || null : null,
    "contact.address_line1": (subject) => personAddressLine1(subject),
    "contact.address_line2": (subject) => personAddressLine2(subject),
    "contact.address_line": (subject) => personAddressLine1(subject),
    "contact.address": (subject) => personAddressLine1(subject),
    "contact.city": (subject) => personCity(subject),
    "contact.state": (subject) => personState(subject),
    "contact.postal_code": (subject) => personPostalCode(subject),
    "contact.postal": (subject) => personPostalCode(subject),
    "contact.zip": (subject) => personPostalCode(subject),
    "contact.full_name": (subject) => composedPersonFullName(subject),
};

const PERSON_RESOLVERS: Record<string, Resolver> = {
    "person.first_name": (subject) => {
        if (subject.kind === "contact_edit") return subject.value.first_name?.trim() || null;
        if (subject.kind === "person") return personNameParts(subject).first;
        return null;
    },
    "person.last_name": (subject) => {
        if (subject.kind === "contact_edit") return subject.value.last_name?.trim() || null;
        if (subject.kind === "person") return personNameParts(subject).last;
        return null;
    },
    "person.full_name": (subject) => composedPersonFullName(subject),
    "person.primary_contact_name": (subject) => (subject.kind === "person" ? subject.value.name : null),
    "person.phone": (subject) => {
        if (subject.kind === "person") return subject.value.phone?.trim() || null;
        if (subject.kind === "contact_edit") return subject.value.phone?.trim() || null;
        return null;
    },
    "person.email": (subject) => {
        if (subject.kind === "person") return subject.value.email?.trim() || null;
        if (subject.kind === "contact_edit") return subject.value.email?.trim() || null;
        return null;
    },
    "person.role_label": (subject) => (subject.kind === "person" ? subject.value.roleLabel : null),
    "person.date_of_birth": () => null,
    "person.address_line": (subject) => personAddressLine1(subject),
    "person.address_line1": (subject) => personAddressLine1(subject),
    "person.address_line2": (subject) => personAddressLine2(subject),
    "person.city": (subject) => personCity(subject),
    "person.state": (subject) => personState(subject),
    "person.postal_code": (subject) => personPostalCode(subject),
    "person.postal": (subject) => personPostalCode(subject),
    "person.zip": (subject) => personPostalCode(subject),
};

const EMPLOYEE_RESOLVERS: Record<string, Resolver> = {
    "employee.name": (subject) => (subject.kind === "employee" ? subject.value.name : null),
    "employee.title": (subject) => (subject.kind === "employee" ? subject.value.title ?? null : null),
    "employee.department": (subject) => (subject.kind === "employee" ? subject.value.department ?? null : null),
    "employee.email": (subject) => (subject.kind === "employee" ? subject.value.email ?? null : null),
    "employee.phone": (subject) => (subject.kind === "employee" ? subject.value.phone ?? null : null),
};

const RESOLVERS: Record<string, Resolver> = {
    ...CHILD_RESOLVERS,
    ...PERSON_RESOLVERS,
    ...CONTACT_EDIT_RESOLVERS,
    ...EMPLOYEE_RESOLVERS,
};

const NAME_FIELD_REFS = new Set([
    "child.first_name",
    "child.last_name",
    "child.preferred_name",
    "child.name",
    "person.first_name",
    "person.last_name",
    "person.primary_contact_name",
    "employee.name",
]);

/**
 * Any child-profile manifest field, resolved without a hand-written resolver.
 *
 * The five original config fields each had one, which is why adding a sixth meant editing this file.
 * Every manifest field is a `field_values` entry on the child, exposed on the subject under a
 * predictable property — so the resolver is derivable, and the hand-written ones above stay only
 * because three legacy keys use property names that predate the manifest.
 * @see lib/fields/customerMemberProfileSurfaces
 */
function resolveChildProfileManifestValue(subject: IdentityComposeSubject, fieldRef: string): string | null {
    if (subject.kind !== "child") return null;
    const fieldKey = childProfileFieldKeyFromRef(fieldRef);
    if (!fieldKey) return null;
    const value = subject.value as Record<string, unknown>;
    const property = childProfileSubjectProperty(fieldKey);
    const raw = value[property] ?? value[fieldKey];
    return typeof raw === "string" ? raw : raw == null ? null : String(raw);
}

export function resolveIdentityFieldValue(subject: IdentityComposeSubject, fieldRef: string): string | null {
    const raw = RESOLVERS[fieldRef]?.(subject) ?? resolveChildProfileManifestValue(subject, fieldRef) ?? null;
    return raw?.trim() || null;
}

export function composedIdentityDisplayName(
    subject: IdentityComposeSubject,
    config: NestedSurfaceConfig | null,
    groupKey: string,
    fallbackName: string,
): string {
    if (subject.kind === "child") {
        const preferred = resolveIdentityFieldValue(subject, "child.preferred_name");
        if (preferred) return preferred;
        const first = resolveIdentityFieldValue(subject, "child.first_name");
        const last = resolveIdentityFieldValue(subject, "child.last_name");
        if (first && last) return `${first} ${last}`;
        if (first) return first;
        return subject.value.name || fallbackName;
    }
    if (subject.kind === "person") return subject.value.name || fallbackName;
    if (subject.kind === "employee") return subject.value.name || fallbackName;
    if (subject.kind === "contact_edit") {
        const full = [subject.value.first_name, subject.value.last_name].filter(Boolean).join(" ").trim();
        return full || fallbackName;
    }
    return fallbackName;
}

export function composedIdentityLines(args: {
    subject: IdentityComposeSubject;
    config: NestedSurfaceConfig | null;
    groupKey: string;
    fieldRefs: readonly string[];
    skipNameFields?: boolean;
}): ComposedIdentityLine[] {
    const { subject, config, groupKey, fieldRefs, skipNameFields = true } = args;
    const lines: ComposedIdentityLine[] = [];
    for (const fieldRef of fieldRefs) {
        if (skipNameFields && NAME_FIELD_REFS.has(fieldRef)) continue;
        const value = resolveIdentityFieldValue(subject, fieldRef);
        if (!value) continue;
        const catalog = resolveCanonicalIdentityFieldLabel(fieldRef);
        const label = config
            ? fieldPresentationLabel(config, groupKey, fieldRef, catalog)
            : catalog;
        lines.push({ fieldRef, label, value });
    }
    return lines;
}

/** @deprecated Use composedIdentityDisplayName — kept for children card parity. */
export function composedChildDisplayName(
    child: ChildrenEvidenceChild,
    config: NestedSurfaceConfig | null,
): string {
    return composedIdentityDisplayName({ kind: "child", value: child }, config, "identity", child.name);
}

/** @deprecated Use composedIdentityLines — kept for children card parity. */
export function composedChildIdentityLines(
    child: ChildrenEvidenceChild,
    config: NestedSurfaceConfig | null,
): ComposedIdentityLine[] {
    const keys = config?.groups.find((g) => g.key === "identity")?.selectedFieldKeys ?? ["child.dob_age"];
    return composedIdentityLines({
        subject: { kind: "child", value: child },
        config,
        groupKey: "identity",
        fieldRefs: keys,
    });
}
