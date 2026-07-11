/**
 * Shared identity field composition — child, person/contact, and employee subjects.
 */

import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type {
    HouseholdEvidenceChild,
    HouseholdEvidenceContact,
} from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { HouseholdEvidenceChildExtended } from "@/lib/adminV2/runtime/focusPanel/household/householdSurfaceFields";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldPresentationLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

export type IdentityComposeSubject =
    | { kind: "child"; value: ChildrenEvidenceChild | HouseholdEvidenceChildExtended }
    | { kind: "person"; value: HouseholdEvidenceContact }
    | { kind: "employee"; value: { id: string; name: string; title?: string | null; department?: string | null; email?: string | null; phone?: string | null; badge?: string | null; imageUrl?: string | null } };

export type ComposedIdentityLine = {
    fieldRef: string;
    label: string;
    value: string;
};

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
        return ("dobAge" in child ? child.dobAge : null) ?? ("dob" in child ? child.dob : null) ?? null;
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
    "inquiry_child.program": (subject) =>
        subject.kind === "child" && "program" in subject.value ? subject.value.program ?? null : null,
    "inquiry_child.schedule_type": (subject) =>
        subject.kind === "child" && "schedule" in subject.value ? subject.value.schedule ?? null : null,
    "child.start_date": (subject) =>
        subject.kind === "child" && "startDate" in subject.value ? subject.value.startDate ?? null : null,
    "child.status": (subject) =>
        subject.kind === "child" && "status" in subject.value ? subject.value.status ?? null : null,
};

const PERSON_RESOLVERS: Record<string, Resolver> = {
    "person.primary_contact_name": (subject) => (subject.kind === "person" ? subject.value.name : null),
    "person.phone": (subject) => (subject.kind === "person" ? subject.value.phone : null),
    "person.email": (subject) => (subject.kind === "person" ? subject.value.email : null),
    "person.role_label": (subject) => (subject.kind === "person" ? subject.value.roleLabel : null),
    "person.date_of_birth": () => null,
    "person.address_line": () => null,
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
    ...EMPLOYEE_RESOLVERS,
};

const NAME_FIELD_REFS = new Set([
    "child.first_name",
    "child.last_name",
    "child.preferred_name",
    "child.name",
    "person.primary_contact_name",
    "employee.name",
]);

export function resolveIdentityFieldValue(subject: IdentityComposeSubject, fieldRef: string): string | null {
    const raw = RESOLVERS[fieldRef]?.(subject) ?? null;
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
    return subject.value.name || fallbackName;
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
        const catalog = fieldRef.replace(/^[a-z_]+\./, "").replace(/_/g, " ");
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
