/**
 * Resolve Focus Panel builder field availability via the canonical capability engine.
 * Used by Surface Field Inspector / library badges — not a parallel availability model.
 */

import { layoutRefKeyToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import {
    resolveFieldSurfaceAvailability,
    type FieldSurfaceAvailabilityRow,
} from "@/lib/fields/fieldSurfaceAvailability";

const CONCEPT_TAIL_TO_CHILD_REF: Readonly<Record<string, string>> = {
    name: "child.name",
    first_name: "child.first_name",
    last_name: "child.last_name",
    preferred_name: "child.preferred_name",
    dob: "child.date_of_birth",
    date_of_birth: "child.date_of_birth",
    age: "child.age",
    gender: "child.gender",
    program: "inquiry_child.program",
    room: "child.room",
    schedule: "inquiry_child.schedule_type",
    desired_start: "child.start_date",
    start_date: "child.start_date",
};

/** Normalize builder concept paths to layout refKeys when resolvable. */
export function focusPanelConceptToLayoutRefKey(concept: string): string | null {
    const raw = concept.trim();
    if (!raw) return null;
    if (raw.includes(".")) {
        const lower = raw.toLowerCase();
        if (lower.startsWith("child.") || lower.startsWith("person.") || lower.startsWith("customer.") || lower.startsWith("opportunity.") || lower.startsWith("inquiry_child.")) {
            return lower;
        }
    }
    const parts = raw.split("→").map((p) => p.trim()).filter(Boolean);
    const tail = (parts[parts.length - 1] ?? raw).toLowerCase().replace(/\s+/g, "_");
    if (CONCEPT_TAIL_TO_CHILD_REF[tail]) return CONCEPT_TAIL_TO_CHILD_REF[tail]!;

    const joined = parts.map((p) => p.toLowerCase()).join(" ");
    if (joined.includes("child") || joined.includes("children")) {
        if (CONCEPT_TAIL_TO_CHILD_REF[tail]) return CONCEPT_TAIL_TO_CHILD_REF[tail]!;
    }
    return null;
}

export function resolveFocusPanelConceptAvailability(concept: string): FieldSurfaceAvailabilityRow[] {
    const refKey = focusPanelConceptToLayoutRefKey(concept);
    if (!refKey) return [];
    const canonical = layoutRefKeyToCanonicalRef(refKey);
    if (!canonical) return [];
    return resolveFieldSurfaceAvailability({
        entity_type: canonical.entity_type,
        field_key: canonical.field_key,
        is_active: true,
        is_visible_in_form: true,
        is_visible_in_drawer: true,
        is_visible_in_table: false,
    });
}

export function focusPanelSurfaceStatus(concept: string): {
    status: "available" | "unavailable" | "unknown";
    reason?: string;
    rows: FieldSurfaceAvailabilityRow[];
} {
    const rows = resolveFocusPanelConceptAvailability(concept);
    const focus = rows.find((r) => r.surface === "focus_panel");
    if (!focus) return { status: "unknown", rows };
    return { status: focus.status, reason: focus.reason, rows };
}
