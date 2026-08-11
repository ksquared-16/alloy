/**
 * Alloy Search Platform V2 — destination resolution.
 *
 * Answers: **which authoritative Alloy destinations are available to this
 * operator for this subject?** It does NOT own identity matching, and it does not
 * own operational meaning.
 *
 * Destinations are FOCUS PANEL TARGETS — subject + card + item. Search resolves
 * intent; the Focus Panel runtime owns what a card is and how it is revealed
 * (`@/lib/adminV2/runtime/focusPanel/focusPanelTarget`). Search does not own a
 * card vocabulary and must never grow one.
 *
 * Two rules keep this honest:
 *
 * 1. NO INVENTED ROUTES. A route destination is emitted only when a canonical
 *    Alloy surface provably owns it. Components never build URLs.
 *
 * 2. NO GENERIC DRAWER. Clicking a result focuses a card in the workspace the
 *    operator is already in. There is no overlay and no intermediate
 *    search-detail page.
 */

import { canonicalLocationSettingsHref } from "@/lib/admin/canonicalLocationSettingsRoutes";
import {
    SEARCH_INLINE_DESTINATION_CAP,
    type SearchContext,
    type SearchDestination,
    type SearchSubject,
} from "@/lib/search/searchContracts";

/**
 * Canonical Focus Panel card keys this resolver targets. Values must exist in
 * `FOCUS_PANEL_CARD_KEYS`; a test asserts that so a renamed card cannot leave
 * Search pointing at a card that no longer exists.
 */
export const SEARCH_CARD_KEYS = {
    children: "children",
    household: "household",
    /** "Assignments" in the catalogue — placement/assignment work. */
    assignment: "scheduling",
    /** "What's Next" — where process participation is worked. */
    currentWork: "current_work",
} as const;

/** `process_instances.context_type` → the record that hosts that subject's panel. */
const PROCESS_CONTEXT_HOST_TYPES: Record<string, string> = {
    opportunity: "opportunities",
    customer: "customers",
    person: "persons",
};

/**
 * The Work Unit whose surface should host this subject's Focus Panel.
 *
 * THIS IS NOT THE PROCESS KEY. It used to be, and that was a category error with a
 * silent failure mode: `/workspace/work-unit/:slug` resolves work-unit keys and
 * Work View slugs, so navigating to a process (`enrollment`) answered
 * `work_unit_not_found`, nothing composed, and the operator was left on an empty
 * page with no error at all — the "Search opens nothing" defect.
 *
 * `destination_work_unit_key` is resolved during enrichment from the HOST RECORD's
 * own `work_unit_id`, so it names a unit whose evaluated page genuinely contains
 * that record. Null propagates rather than guessing: no work unit means Search does
 * not navigate, which is the honest outcome when no queue holds the record.
 *
 * `preferred` chooses WHICH participation hosts the panel when the operator asked
 * for a specific process context; the work unit still comes from that context's own
 * record, never from the process it belongs to.
 */
function resolveHostWorkUnitKey(contexts: readonly SearchContext[], preferred?: string | null): string | null {
    const hosted = (context: SearchContext): string | null =>
        (context.destination_work_unit_key ?? "").trim() || null;

    const wanted = (preferred ?? "").trim();
    if (wanted) {
        const exact = contexts.find((c) => c.kind === "process" && c.key === wanted);
        if (exact) return hosted(exact);
    }
    // Default host = the subject's first configured participation that is actually
    // worked somewhere. Configuration decides which processes exist and in what
    // order; Search does not.
    const first = contexts.find((c) => c.kind === "process" && hosted(c));
    return first ? hosted(first) : null;
}

function resolveHost(
    subject: SearchSubject,
    contexts: readonly SearchContext[]
): { type: string; id: string } | null {
    for (const context of contexts) {
        if (context.kind !== "process") continue;
        const type = PROCESS_CONTEXT_HOST_TYPES[String(context.destination_entity_type ?? "").trim()];
        const id = String(context.destination_entity_id ?? "").trim();
        if (type && id) return { type, id };
    }
    const householdId = (subject.household_id ?? "").trim();
    if (householdId) return { type: "customers", id: householdId };
    const personId = (subject.person_id ?? "").trim();
    if (personId) return { type: "persons", id: personId };
    return null;
}

function firstName(displayName: string): string {
    return displayName.trim().split(/\s+/)[0] || displayName;
}

/**
 * The subject's own card — what clicking the result focuses.
 *
 *   child     → Children card, that child selected
 *   person    → Household card, that person's relationship row selected
 *   household → Household card
 *   location  → canonical Settings route (a campus has no Focus Panel card)
 */
export function resolveSubjectDestination(
    subject: SearchSubject,
    contexts: readonly SearchContext[] = []
): SearchDestination | null {
    if (subject.kind === "location") {
        return {
            key: "subject",
            label: `Open ${subject.display_name}`,
            target: "route",
            href: canonicalLocationSettingsHref(subject.id),
            primary: true,
        };
    }

    const host = resolveHost(subject, contexts);
    if (!host) return null;

    if (subject.kind === "child") {
        return {
            key: "subject",
            label: `Open ${firstName(subject.display_name)}`,
            target: "focus_panel",
            card_key: SEARCH_CARD_KEYS.children,
            item_id: subject.id,
            host_entity_type: host.type,
            host_entity_id: host.id,
            host_work_unit_key: resolveHostWorkUnitKey(contexts),
            primary: true,
        };
    }

    if (subject.kind === "person") {
        return {
            key: "subject",
            label: `Open ${firstName(subject.display_name)}`,
            target: "focus_panel",
            card_key: SEARCH_CARD_KEYS.household,
            item_id: subject.person_id ?? subject.id,
            host_entity_type: host.type,
            host_entity_id: host.id,
            host_work_unit_key: resolveHostWorkUnitKey(contexts),
            primary: true,
        };
    }

    // household
    return {
        key: "subject",
        label: `Open ${subject.display_name}`,
        target: "focus_panel",
        card_key: SEARCH_CARD_KEYS.household,
        host_entity_type: host.type,
        host_entity_id: host.id,
        host_work_unit_key: resolveHostWorkUnitKey(contexts),
        primary: true,
    };
}

/** Household context for a subject that belongs to one. */
function resolveHouseholdDestination(
    subject: SearchSubject,
    contexts: readonly SearchContext[]
): SearchDestination | null {
    if (subject.kind === "household" || subject.kind === "location") return null;
    const host = resolveHost(subject, contexts);
    if (!host) return null;
    return {
        key: "household",
        label: "Household",
        target: "focus_panel",
        card_key: SEARCH_CARD_KEYS.household,
        host_entity_type: host.type,
        host_entity_id: host.id,
        host_work_unit_key: resolveHostWorkUnitKey(contexts),
    };
}

/**
 * Per-context destination resolvers, keyed by context kind.
 *
 * Composition point: a context kind that gains a card registers here. There is no
 * conditional chain in the orchestrator.
 */
const CONTEXT_DESTINATION_RESOLVERS: Record<
    SearchContext["kind"],
    (context: SearchContext, subject: SearchSubject, host: { type: string; id: string } | null, allContexts: readonly SearchContext[]) => SearchDestination | null
> = {
    /**
     * A configured process is worked on the Current Work card, with the process
     * selected as context. The LABEL is configured and the `context_key` is the
     * configured `process_key` — no process name is hardcoded, so a tenant that
     * renames or adds a process needs no code change.
     */
    process: (context, subject, host, allContexts) => {
        if (!host) return null;
        return {
            key: `process:${context.key}`,
            label: context.label,
            target: "focus_panel",
            card_key: SEARCH_CARD_KEYS.currentWork,
            item_id: subject.kind === "child" ? subject.id : null,
            context_key: context.key,
            host_entity_type: host.type,
            host_entity_id: host.id,
            // A process destination hosts on ITS OWN configured work unit.
            host_work_unit_key: resolveHostWorkUnitKey(allContexts, context.key),
        };
    },
    /**
     * Schedule/placement is worked on the Assignments card. Previously this
     * emitted nothing because no drawer could address a card — the context could
     * rank and display but never be opened.
     */
    schedule: (_context, subject, host, allContexts) => {
        if (!host || subject.kind !== "child") return null;
        return {
            key: "assignment",
            label: "Assignment",
            target: "focus_panel",
            card_key: SEARCH_CARD_KEYS.assignment,
            item_id: subject.id,
            host_entity_type: host.type,
            host_entity_id: host.id,
            host_work_unit_key: resolveHostWorkUnitKey(allContexts),
        };
    },
    relationship: () => null,
    placement: (_context, subject, host, allContexts) => {
        if (!host || subject.kind !== "child") return null;
        return {
            key: "assignment",
            label: "Assignment",
            target: "focus_panel",
            card_key: SEARCH_CARD_KEYS.assignment,
            item_id: subject.id,
            host_entity_type: host.type,
            host_entity_id: host.id,
        };
    },
};

/**
 * Resolve every destination for a result, ordered.
 *
 * `promotedKeys` comes from query intent: `Lennon assignment` promotes the
 * Assignment destination ahead of the others while Lennon stays the subject. The
 * primary (subject) destination always stays first — clicking the subject must
 * remain predictable regardless of intent.
 */
export function resolveSearchDestinations(args: {
    subject: SearchSubject;
    contexts: SearchContext[];
    promotedKeys: readonly string[];
}): SearchDestination[] {
    const { subject, contexts, promotedKeys } = args;
    const host = resolveHost(subject, contexts);

    const primary = resolveSubjectDestination(subject, contexts);
    const secondary: SearchDestination[] = [];

    for (const context of contexts) {
        const resolved = CONTEXT_DESTINATION_RESOLVERS[context.kind]?.(context, subject, host, contexts) ?? null;
        if (resolved) secondary.push(resolved);
    }

    const household = resolveHouseholdDestination(subject, contexts);
    if (household) secondary.push(household);

    const promoted: SearchDestination[] = [];
    const rest: SearchDestination[] = [];
    for (const dest of secondary) {
        if (destinationMatchesPromotedKey(dest, promotedKeys)) promoted.push(dest);
        else rest.push(dest);
    }

    const ordered = [...(primary ? [primary] : []), ...promoted, ...rest];

    // De-duplicate on OPERATOR CONTEXT, not on the underlying record.
    //
    // The previous key was `target:entity_type:entity_id`, which meant a child's
    // subject destination and their Enrollment destination — both addressing the
    // same opportunity record — collapsed into one, leaving Household as the only
    // visible context. "Open Lennon" and "Enrollment — Waitlist" are different
    // operator intents even when they share a payload underneath.
    const seen = new Set<string>();
    return ordered.filter((d) => {
        if (seen.has(d.key)) return false;
        seen.add(d.key);
        return true;
    });
}

function destinationMatchesPromotedKey(
    destination: SearchDestination,
    promotedKeys: readonly string[]
): boolean {
    return promotedKeys.some(
        (key) =>
            destination.key === key ||
            destination.key === `process:${key}` ||
            // `schedule` intent promotes the Assignment destination.
            (key === "schedule" && destination.key === "assignment")
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
