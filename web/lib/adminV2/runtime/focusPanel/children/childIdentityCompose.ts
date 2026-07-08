/**
 * Compose child identity display from configured presentation fields.
 * Never exposes schema keys — operators configure First Name, Preferred Name, etc.
 */

import {
    fieldPresentationLabel,
    selectedFieldKeys,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";

const IDENTITY_FIELD_RESOLVERS: Record<string, (child: ChildrenEvidenceChild) => string | null> = {
    "child.first_name": (c) => c.firstName ?? c.name.split(" ")[0] ?? null,
    "child.last_name": (c) => c.lastName ?? (c.name.split(" ").slice(1).join(" ") || null),
    "child.preferred_name": (c) => c.preferredName ?? null,
    "child.nickname": (c) => c.nickname ?? null,
    // Prefer doctrine-formatted dobAge; never leak raw ISO DOB on Focus Panel surfaces.
    "child.date_of_birth": (c) => c.dobAge ?? c.dob ?? null,
    "child.dob_age": (c) => c.dobAge ?? c.age ?? null,
    "child.name": (c) => c.name,
};

export type ComposedIdentityLine = {
    fieldKey: string;
    label: string;
    value: string;
};

/** Primary display name from composed identity fields (preferred → first+last → name). */
export function composedChildDisplayName(
    child: ChildrenEvidenceChild,
    config: NestedSurfaceConfig | null,
): string {
    const preferred = resolveIdentityValue(child, config, "child.preferred_name");
    if (preferred) return preferred;
    const first = resolveIdentityValue(child, config, "child.first_name");
    const last = resolveIdentityValue(child, config, "child.last_name");
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    return child.name;
}

/** Secondary identity lines (age, dob, nickname…) in configured order. */
export function composedChildIdentityLines(
    child: ChildrenEvidenceChild,
    config: NestedSurfaceConfig | null,
): ComposedIdentityLine[] {
    const keys = config ? selectedFieldKeys(config, "identity") : ["child.dob_age"];
    const skip = new Set(["child.first_name", "child.last_name", "child.preferred_name", "child.name"]);
    const lines: ComposedIdentityLine[] = [];
    for (const fieldKey of keys) {
        if (skip.has(fieldKey)) continue;
        const value = resolveIdentityValue(child, config, fieldKey);
        if (!value) continue;
        const catalogLabel = fieldKey.replace(/^child\./, "").replace(/_/g, " ");
        const label = config
            ? fieldPresentationLabel(config, "identity", fieldKey, catalogLabel)
            : catalogLabel;
        lines.push({ fieldKey, label, value });
    }
    return lines;
}

function resolveIdentityValue(
    child: ChildrenEvidenceChild,
    config: NestedSurfaceConfig | null,
    fieldKey: string,
): string | null {
    void config;
    const resolver = IDENTITY_FIELD_RESOLVERS[fieldKey];
    const raw = resolver?.(child) ?? null;
    return raw?.trim() || null;
}
