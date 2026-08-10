/**
 * Alloy Search Platform V2 — destination resolution.
 *
 * Answers: **which authoritative Alloy destinations are available to this
 * operator for this subject?** It does NOT own identity matching, and it does not
 * own operational meaning.
 *
 * Two rules keep this honest:
 *
 * 1. NO INVENTED ROUTES. A destination is emitted only when a canonical Alloy
 *    surface provably owns it. Hrefs come from the canonical route helpers; this
 *    module never concatenates a URL of its own, and components never build one.
 *
 * 2. NO GENERIC SEARCH-DETAIL PAGE. Clicking the subject opens its canonical
 *    default Focus Panel. There is no intermediate "search result page".
 *
 * KNOWN GAP (documented, not faked): there is no canonical operator surface for a
 * child's schedule today — `/adminV2/scheduling` is transitional and
 * `/legacy-admin/schedules` is legacy, and operator surfaces are `/workspace` and
 * `/organization`. So `schedule` is a first-class CONTEXT that ranks and displays,
 * but emits no destination. When a canonical schedule surface lands, it becomes a
 * one-line addition to `CONTEXT_DESTINATION_RESOLVERS` — no caller changes.
 */

import { canonicalLocationSettingsHref } from "@/lib/admin/canonicalLocationSettingsRoutes";
import {
    SEARCH_INLINE_DESTINATION_CAP,
    type SearchContext,
    type SearchDestination,
    type SearchSubject,
} from "@/lib/search/searchContracts";

/** Drawer entity types AdminV2 can open. Legacy member/contact drawers are never targets. */
const OPENABLE_DRAWER_ENTITY_TYPES = new Set(["persons", "customers", "opportunities"]);

/** `process_instances.context_type` → the drawer entity type that owns its surface. */
const PROCESS_CONTEXT_ENTITY_TYPES: Record<string, string> = {
    opportunity: "opportunities",
    customer: "customers",
    person: "persons",
};

/**
 * The subject's own canonical default surface — what clicking the result opens.
 *
 * A child opens as its canonical human identity (person) when one exists, because
 * `persons` is canonical human identity; the child profile is the operational
 * grain, not the identity. Falls back to the household shell.
 */
export function resolveSubjectDestination(
    subject: SearchSubject,
    contexts: readonly SearchContext[] = []
): SearchDestination | null {
    const label = `Open ${firstName(subject.display_name)}`;

    if (subject.kind === "location") {
        return {
            key: "subject",
            label: `Open ${subject.display_name}`,
            target: "route",
            href: canonicalLocationSettingsHref(subject.id),
            primary: true,
        };
    }

    if (subject.kind === "household") {
        return {
            key: "subject",
            label: `Open ${subject.display_name}`,
            target: "open_drawer",
            entity_type: "customers",
            entity_id: subject.id,
            primary: true,
        };
    }

    const personId = (subject.person_id ?? "").trim();
    if (personId) {
        return {
            key: "subject",
            label,
            target: "open_drawer",
            entity_type: "persons",
            entity_id: personId,
            primary: true,
        };
    }

    // A child without a person row still has an authoritative surface: the record
    // its participation runs in. Falling straight to the household would open the
    // FAMILY when the operator asked for the CHILD — V1 resolved
    // person → opportunity → customer for exactly this reason.
    for (const context of contexts) {
        if (context.kind !== "process") continue;
        const type = PROCESS_CONTEXT_ENTITY_TYPES[String(context.destination_entity_type ?? "").trim()];
        const id = String(context.destination_entity_id ?? "").trim();
        if (type === "opportunities" && id) {
            return {
                key: "subject",
                label,
                target: "open_drawer",
                entity_type: type,
                entity_id: id,
                primary: true,
            };
        }
    }

    const householdId = (subject.household_id ?? "").trim();
    if (householdId) {
        return {
            key: "subject",
            label,
            target: "open_drawer",
            entity_type: "customers",
            entity_id: householdId,
            primary: true,
        };
    }

    return null;
}

/** Household destination for any subject that belongs to one. */
function resolveHouseholdDestination(subject: SearchSubject): SearchDestination | null {
    const householdId = (subject.household_id ?? "").trim();
    if (!householdId || subject.kind === "household") return null;
    return {
        key: "household",
        label: "Household",
        target: "open_drawer",
        entity_type: "customers",
        entity_id: householdId,
    };
}

/**
 * Per-context destination resolvers, keyed by context kind.
 *
 * Composition point: a new context kind that gains a canonical surface registers
 * here. There is no conditional chain in the orchestrator.
 */
const CONTEXT_DESTINATION_RESOLVERS: Record<
    SearchContext["kind"],
    (context: SearchContext) => SearchDestination | null
> = {
    process: (context) => {
        const type = PROCESS_CONTEXT_ENTITY_TYPES[String(context.destination_entity_type ?? "").trim()];
        const id = String(context.destination_entity_id ?? "").trim();
        if (!type || !id || !OPENABLE_DRAWER_ENTITY_TYPES.has(type)) return null;
        return {
            // Configured process key — the LABEL is configured, the key is stable.
            key: `process:${context.key}`,
            label: context.label,
            target: "open_drawer",
            entity_type: type,
            entity_id: id,
        };
    },
    // No canonical operator schedule surface exists yet — see module header.
    schedule: () => null,
    relationship: () => null,
    placement: () => null,
};

/**
 * Resolve every destination for a result, ordered.
 *
 * `promotedKeys` comes from query intent: `Joe Smith enrollment` promotes the
 * enrollment destination ahead of the others while Joe stays the subject.
 * The primary (subject) destination always stays first — clicking the subject
 * must remain predictable regardless of intent.
 */
export function resolveSearchDestinations(args: {
    subject: SearchSubject;
    contexts: SearchContext[];
    promotedKeys: readonly string[];
}): SearchDestination[] {
    const { subject, contexts, promotedKeys } = args;

    const primary = resolveSubjectDestination(subject, contexts);
    const secondary: SearchDestination[] = [];

    for (const context of contexts) {
        const resolved = CONTEXT_DESTINATION_RESOLVERS[context.kind]?.(context) ?? null;
        if (resolved) secondary.push(resolved);
    }

    const household = resolveHouseholdDestination(subject);
    if (household) secondary.push(household);

    // Promote destinations the operator's query asked for, preserving relative
    // order within each band so ordering stays deterministic and testable.
    const promoted: SearchDestination[] = [];
    const rest: SearchDestination[] = [];
    for (const dest of secondary) {
        if (destinationMatchesPromotedKey(dest, promotedKeys)) promoted.push(dest);
        else rest.push(dest);
    }

    const ordered = [...(primary ? [primary] : []), ...promoted, ...rest];

    // De-duplicate by target so a process whose context entity is the household
    // does not render twice.
    const seen = new Set<string>();
    return ordered.filter((d) => {
        const id = `${d.target}:${d.entity_type ?? ""}:${d.entity_id ?? ""}:${d.href ?? ""}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function destinationMatchesPromotedKey(
    destination: SearchDestination,
    promotedKeys: readonly string[]
): boolean {
    return promotedKeys.some(
        (key) => destination.key === key || destination.key === `process:${key}`
    );
}

/** Split destinations into what shows inline vs behind a restrained `More`. */
export function splitInlineDestinations(destinations: SearchDestination[]): {
    inline: SearchDestination[];
    overflow: SearchDestination[];
} {
    return {
        inline: destinations.slice(0, SEARCH_INLINE_DESTINATION_CAP),
        overflow: destinations.slice(SEARCH_INLINE_DESTINATION_CAP),
    };
}

function firstName(displayName: string): string {
    const first = displayName.trim().split(/\s+/)[0];
    return first || displayName;
}
