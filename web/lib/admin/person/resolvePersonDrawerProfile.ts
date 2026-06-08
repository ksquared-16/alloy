import type { PersonDrawerProfileKey, PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";

export type PersonDrawerProfileInput = {
    person_id: string;
    is_employee?: boolean | null;
    customer_persons?: Array<{ role_type?: string | null }> | null;
    person_relationships?: Array<{
        from_person_id: string;
        to_person_id: string;
        relationship_type?: string | null;
    }> | null;
    customer_members?: Array<{ relationship?: string | null }> | null;
    opportunity_person_roles?: Array<{ role_type?: string | null }> | null;
};

const BADGE_LABELS: Record<Exclude<PersonDrawerProfileKey, "mixed" | "unknown">, string> = {
    child: "Child",
    parent: "Parent",
    guardian: "Guardian",
    employee: "Employee",
    emergency_contact: "Emergency Contact",
};

const PARENT_ROLE_KEYS = new Set(["parent", "primary_contact", "primary"]);
const GUARDIAN_ROLE_KEYS = new Set(["guardian"]);
const EMERGENCY_ROLE_KEYS = new Set(["emergency_contact", "emergency"]);
const CHILD_ROLE_KEYS = new Set(["child", "enrolled_child"]);

function normRole(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

/**
 * Resolve person drawer presentation profile(s) from existing join signals.
 *
 * **Precedence (for badge order, not exclusivity):**
 * 1. `child` — `customer_members.relationship = child` or `customer_persons.role_type` child
 * 2. `parent` — customer person parent roles; `person_relationships` parent edge (from = parent of this person)
 * 3. `guardian` — guardian roles / guardian edges
 * 4. `emergency_contact` — emergency roles / edges; opportunity_persons emergency roles
 * 5. `employee` — `persons.is_employee`
 *
 * Multiple roles surface as multiple badges (`Parent • Employee`). `mixed` is the display token when 2+ apply.
 * No persistence — presentation only.
 */
export function resolvePersonDrawerProfile(input: PersonDrawerProfileInput): PersonDrawerProfileResult {
    const pid = String(input.person_id ?? "").trim();
    const found = new Set<Exclude<PersonDrawerProfileKey, "mixed" | "unknown">>();

    for (const m of input.customer_members ?? []) {
        const rel = normRole(m.relationship);
        if (rel === "child" || CHILD_ROLE_KEYS.has(rel)) {
            found.add("child");
        }
    }

    for (const cp of input.customer_persons ?? []) {
        const role = normRole(cp.role_type);
        if (CHILD_ROLE_KEYS.has(role)) found.add("child");
        if (PARENT_ROLE_KEYS.has(role)) found.add("parent");
        if (GUARDIAN_ROLE_KEYS.has(role)) found.add("guardian");
        if (EMERGENCY_ROLE_KEYS.has(role)) found.add("emergency_contact");
    }

    for (const rel of input.person_relationships ?? []) {
        const type = normRole(rel.relationship_type);
        if (!pid) continue;
        const isFrom = rel.from_person_id === pid;
        const isTo = rel.to_person_id === pid;
        if (isTo && (type === "parent" || PARENT_ROLE_KEYS.has(type))) {
            found.add("child");
        }
        if (isFrom && (type === "parent" || PARENT_ROLE_KEYS.has(type))) {
            found.add("parent");
        }
        if (isTo && (type === "guardian" || GUARDIAN_ROLE_KEYS.has(type))) {
            found.add("child");
        }
        if (isFrom && (type === "guardian" || GUARDIAN_ROLE_KEYS.has(type))) {
            found.add("guardian");
        }
        if (EMERGENCY_ROLE_KEYS.has(type)) {
            if (isFrom || isTo) found.add("emergency_contact");
        }
        if (isFrom && type === "child") {
            found.add("parent");
        }
        if (isTo && type === "child") {
            found.add("child");
        }
    }

    for (const op of input.opportunity_person_roles ?? []) {
        const role = normRole(op.role_type);
        if (PARENT_ROLE_KEYS.has(role)) found.add("parent");
        if (GUARDIAN_ROLE_KEYS.has(role)) found.add("guardian");
        if (EMERGENCY_ROLE_KEYS.has(role)) found.add("emergency_contact");
    }

    if (input.is_employee === true) {
        found.add("employee");
    }

    const precedence: Exclude<PersonDrawerProfileKey, "mixed" | "unknown">[] = [
        "child",
        "parent",
        "guardian",
        "emergency_contact",
        "employee",
    ];
    const profiles = precedence.filter((k) => found.has(k));
    const badgeLabels = profiles.map((k) => BADGE_LABELS[k]);

    let display: PersonDrawerProfileKey;
    if (profiles.length === 0) {
        display = "unknown";
    } else if (profiles.length === 1) {
        display = profiles[0]!;
    } else {
        display = "mixed";
    }

    return { profiles, display, badgeLabels };
}
