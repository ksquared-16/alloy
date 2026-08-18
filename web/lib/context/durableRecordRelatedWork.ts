/**
 * RELATED WORK for a durable record — Search's destinations, asked about one subject.
 *
 * The product rule this serves:
 *
 *     selecting a record opens the record; selecting related work navigates to the work.
 *
 * The second half needs operational destinations — "Enrollment · Waitlist lives on THIS Work View
 * of THIS Work Unit, and the row to select is THIS participation" — and the platform already owns
 * exactly one resolver of that question: `resolveSearchDestinations`, proven by the Search
 * certifications. This module is NOT a second resolver. It builds the same `SearchSubject` shape
 * `runSearch` builds, hands it the same `SubjectContext[]` (Search's `SearchContext` is a type
 * alias of it — one assembly authority, `buildSubjectContexts`), and keeps only the destinations
 * that are genuinely operational.
 *
 * ── WHAT IS KEPT, AND WHAT IS NOT ──
 *
 * Kept: `focus_panel` destinations — process cohorts ("Enrollment · Waitlist"), the per-process
 * fallback when no cohort is provable, and a child's Assignment destination. These are the entries
 * an overlay may offer as `Go to`, and each carries the full selection payload the operator-focus
 * listener commits, byte-identical to what a Search click would have dispatched.
 *
 * Dropped: the primary record destination (`durable_record` — the overlay IS that destination
 * already), `route` targets, and the Household destination (`key === "household"`) — a family is a
 * RECORD here, switched in place, not work to navigate to.
 *
 * ── WHY THE CASE FIELDS ARE NULL ──
 *
 * `household_case_entity_id` / `household_case_work_unit_key` are Search-enrichment fallbacks for
 * subjects with no participation of their own (a parent, a household). Every destination this
 * module keeps resolves its host from the subject's OWN process contexts; a subject without any has
 * no operational destinations, and inventing a case host for them here would be resolution — the
 * thing this module exists not to do.
 */

import type { SubjectContext } from "@/lib/context/subjectContextTypes";
import { resolveSearchDestinations } from "@/lib/search/searchDestinations";
import type { SearchDestination, SearchSubject } from "@/lib/search/searchContracts";

export type DurableRecordRelatedWorkSubject =
    | { kind: "child"; memberId: string; personId: string | null; householdId: string | null; label: string }
    | { kind: "person"; personId: string; label: string };

/** The `Go to` entries a durable record's overlay may offer. Empty is ordinary. */
export function durableRecordRelatedWork(
    subject: DurableRecordRelatedWorkSubject,
    contexts: readonly SubjectContext[],
): SearchDestination[] {
    const searchSubject: SearchSubject =
        subject.kind === "child"
            ? {
                  kind: "child",
                  id: subject.memberId,
                  display_name: subject.label,
                  person_id: subject.personId,
                  household_id: subject.householdId,
                  household_case_entity_id: null,
                  household_case_work_unit_key: null,
              }
            : {
                  kind: "person",
                  id: subject.personId,
                  display_name: subject.label,
                  person_id: subject.personId,
                  household_id: null,
                  household_case_entity_id: null,
                  household_case_work_unit_key: null,
              };

    return resolveSearchDestinations({
        subject: searchSubject,
        contexts: [...contexts],
        promotedKeys: [],
    }).filter(
        (destination) =>
            destination.target === "focus_panel"
            && destination.key !== "household"
            // A destination without a Work Unit has nowhere to send the operator. Search's own
            // executor refuses these at click time; refusing them here means the overlay never
            // renders a `Go to` that would do nothing.
            && Boolean((destination.host_work_unit_key ?? "").trim()),
    );
}
