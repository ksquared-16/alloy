import { resolvePersonDrawerProfile } from "@/lib/admin/person/resolvePersonDrawerProfile";
import type { PersonDrawerProfileKey } from "@/lib/admin/person/personDrawerVisibilityTypes";

const TYPE_LABELS: Record<Exclude<PersonDrawerProfileKey, "mixed" | "unknown">, string> = {
    child: "Child",
    parent: "Parent",
    guardian: "Guardian",
    employee: "Employee",
    emergency_contact: "Emergency contact",
};

export function globalSearchPersonTypeLabel(input: {
    person_id: string;
    customer_members?: Array<{ relationship?: string | null }> | null;
    customer_persons?: Array<{ role_type?: string | null }> | null;
}): string {
    const profile = resolvePersonDrawerProfile({
        person_id: input.person_id,
        customer_members: input.customer_members,
        customer_persons: input.customer_persons,
    });
    if (profile.display === "unknown") return "Person";
    if (profile.display === "mixed") {
        return profile.badgeLabels.slice(0, 2).join(" · ") || "Person";
    }
    return TYPE_LABELS[profile.display] ?? "Person";
}

export function globalSearchPersonSecondaryContext(input: {
    isChild: boolean;
    siteLabel: string | null;
    householdName: string | null;
}): string | null {
    if (input.isChild) return input.siteLabel?.trim() || input.householdName?.trim() || null;
    return input.householdName?.trim() || input.siteLabel?.trim() || null;
}

export function personRowIsChildRelationship(relationship: string | null | undefined): boolean {
    const rel = String(relationship ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
    return rel === "child" || rel === "enrolled_child";
}
