/**
 * Alloy Search Platform V2 — retrieval.
 *
 * Answers exactly one question: **what accessible canonical subjects match this query?**
 *
 * It does NOT own destinations, and it does NOT own operational meaning. Adapters
 * are registered in `SEARCH_SUBJECT_ADAPTERS`; adding a subject kind means adding
 * an adapter, not editing a conditional in an orchestrator.
 *
 * Matching signals vs display fields are deliberately different sets. Email and
 * phone are MATCHING signals — an operator may search by them — but they are not
 * identity keys and are not returned as recognition metadata here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    allowListIsImpossible,
    applySearchAllowList,
    type SearchAccessEnvelope,
} from "@/lib/search/searchAccessEnvelope";
import { SEARCH_PER_KIND_CANDIDATE_CAP, type SearchSubjectKind } from "@/lib/search/searchContracts";
import type { SearchIntent } from "@/lib/search/searchQueryIntent";

/** Retrieval cap before in-process AND-filtering. Bounded so search stays interactive. */
const RETRIEVAL_FETCH_CAP = 60;

/**
 * A matched subject before enrichment.
 *
 * `match_text` is the concatenated searchable signal set used for AND-filtering
 * and for ranking. It is never displayed.
 */
export type SearchCandidate = {
    kind: SearchSubjectKind;
    id: string;
    display_name: string;
    person_id?: string | null;
    household_id?: string | null;
    /** Location known at retrieval time (locations only); others resolve during enrichment. */
    location_id?: string | null;
    match_text: string;
    /** True when the match came from a related subject rather than this subject's own name. */
    matched_via_relation?: boolean;
};

export type SearchRetrievalContext = {
    supabase: SupabaseClient;
    orgId: string;
    envelope: SearchAccessEnvelope;
    intent: SearchIntent;
};

function escapeIlike(term: string): string {
    return term.replace(/[%_\\]/g, " ").trim();
}

/** Longest token is the most selective — use it to bound the DB read. */
function primaryToken(intent: SearchIntent): string {
    const tokens = intent.subject_terms.map(escapeIlike).filter((t) => t.length > 0);
    if (!tokens.length) return "";
    return tokens.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Every subject term must appear somewhere in the searchable signal set. */
function matchesAllTerms(matchText: string, intent: SearchIntent): boolean {
    const haystack = matchText.toLowerCase();
    return intent.subject_terms.every((t) => haystack.includes(t.toLowerCase()));
}

function joinSignals(...parts: Array<string | null | undefined>): string {
    return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" ");
}

function personDisplayName(row: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    id: string;
}): string {
    const full = (row.full_name ?? "").trim();
    if (full) return full;
    const parts = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return parts || "Unnamed person";
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * `persons` — canonical human identity.
 *
 * Matching signals: name, email, phone. Access: the resolved person allow-list,
 * applied IN THE QUERY.
 */
async function retrievePersons(ctx: SearchRetrievalContext): Promise<SearchCandidate[]> {
    const token = primaryToken(ctx.intent);
    if (!token) return [];
    if (allowListIsImpossible(ctx.envelope.allowedPersonIds)) return [];

    const pattern = `%${token}%`;
    let q = ctx.supabase
        .from("persons")
        .select("id, first_name, last_name, full_name, email, phone")
        .eq("org_id", ctx.orgId);
    q = applySearchAllowList(q, "id", ctx.envelope.allowedPersonIds);

    const { data, error } = await q
        .or(
            [
                `full_name.ilike.${pattern}`,
                `first_name.ilike.${pattern}`,
                `last_name.ilike.${pattern}`,
                `email.ilike.${pattern}`,
                `phone.ilike.${pattern}`,
            ].join(",")
        )
        .limit(RETRIEVAL_FETCH_CAP);
    if (error) throw new Error(error.message);

    const out: SearchCandidate[] = [];
    for (const row of (data ?? []) as Array<{
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
    }>) {
        const matchText = joinSignals(row.full_name, row.first_name, row.last_name, row.email, row.phone);
        if (!matchesAllTerms(matchText, ctx.intent)) continue;
        out.push({
            kind: "person",
            id: String(row.id),
            display_name: personDisplayName(row),
            person_id: String(row.id),
            match_text: matchText,
        });
    }
    return out.slice(0, SEARCH_PER_KIND_CANDIDATE_CAP);
}

/**
 * `customer_members` — durable child profile truth.
 *
 * The child is the subject; the household is context. Access: the resolved
 * customer allow-list, applied IN THE QUERY (V1 filtered these only after
 * assembling the row).
 */
async function retrieveChildren(ctx: SearchRetrievalContext): Promise<SearchCandidate[]> {
    const token = primaryToken(ctx.intent);
    if (!token) return [];
    if (allowListIsImpossible(ctx.envelope.allowedCustomerIds)) return [];

    const pattern = `%${token}%`;
    let q = ctx.supabase
        .from("customer_members")
        .select("id, customer_id, person_id, display_name, first_name, last_name, relationship")
        .eq("org_id", ctx.orgId);
    q = applySearchAllowList(q, "customer_id", ctx.envelope.allowedCustomerIds);

    const { data, error } = await q
        .or(
            [
                `display_name.ilike.${pattern}`,
                `first_name.ilike.${pattern}`,
                `last_name.ilike.${pattern}`,
            ].join(",")
        )
        .limit(RETRIEVAL_FETCH_CAP);
    if (error) throw new Error(error.message);

    const out: SearchCandidate[] = [];
    for (const row of (data ?? []) as Array<{
        id: string;
        customer_id: string;
        person_id?: string | null;
        display_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
    }>) {
        const matchText = joinSignals(row.display_name, row.first_name, row.last_name);
        if (!matchesAllTerms(matchText, ctx.intent)) continue;
        const name =
            (row.display_name ?? "").trim() ||
            [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
            "Unnamed child";
        out.push({
            kind: "child",
            id: String(row.id),
            display_name: name,
            person_id: row.person_id ? String(row.person_id) : null,
            household_id: String(row.customer_id),
            match_text: matchText,
        });
    }
    return out.slice(0, SEARCH_PER_KIND_CANDIDATE_CAP);
}

/**
 * `customers` — the household/account shell.
 *
 * V1 treated household name as context only, so `Smith household` could not
 * resolve a household subject. V2 makes it a first-class subject.
 */
async function retrieveHouseholds(ctx: SearchRetrievalContext): Promise<SearchCandidate[]> {
    const token = primaryToken(ctx.intent);
    if (!token) return [];
    if (allowListIsImpossible(ctx.envelope.allowedCustomerIds)) return [];

    const pattern = `%${token}%`;
    let q = ctx.supabase.from("customers").select("id, name").eq("org_id", ctx.orgId);
    q = applySearchAllowList(q, "id", ctx.envelope.allowedCustomerIds);

    const { data, error } = await q.ilike("name", pattern).limit(RETRIEVAL_FETCH_CAP);
    if (error) throw new Error(error.message);

    const out: SearchCandidate[] = [];
    for (const row of (data ?? []) as Array<{ id: string; name?: string | null }>) {
        const matchText = joinSignals(row.name);
        if (!matchesAllTerms(matchText, ctx.intent)) continue;
        out.push({
            kind: "household",
            id: String(row.id),
            display_name: (row.name ?? "").trim() || "Unnamed household",
            household_id: String(row.id),
            match_text: matchText,
        });
    }
    return out.slice(0, SEARCH_PER_KIND_CANDIDATE_CAP);
}

/** `locations` — sites the operator can reach. */
async function retrieveLocations(ctx: SearchRetrievalContext): Promise<SearchCandidate[]> {
    const token = primaryToken(ctx.intent);
    if (!token) return [];
    if (allowListIsImpossible(ctx.envelope.allowedSiteLocationIds)) return [];

    const pattern = `%${token}%`;
    let q = ctx.supabase
        .from("locations")
        .select("id, label, city")
        .eq("org_id", ctx.orgId)
        .eq("location_type", "site")
        .or("is_active.is.null,is_active.eq.true");
    q = applySearchAllowList(q, "id", ctx.envelope.allowedSiteLocationIds);

    const { data, error } = await q.ilike("label", pattern).limit(RETRIEVAL_FETCH_CAP);
    if (error) throw new Error(error.message);

    const out: SearchCandidate[] = [];
    for (const row of (data ?? []) as Array<{ id: string; label?: string | null; city?: string | null }>) {
        const matchText = joinSignals(row.label, row.city);
        if (!matchesAllTerms(matchText, ctx.intent)) continue;
        out.push({
            kind: "location",
            id: String(row.id),
            display_name: (row.label ?? "").trim() || "Unnamed location",
            location_id: String(row.id),
            match_text: matchText,
        });
    }
    return out.slice(0, SEARCH_PER_KIND_CANDIDATE_CAP);
}

/**
 * Related-name expansion: children whose HOUSEHOLD matched the query.
 *
 * This is what makes `Smith schedule` return Joe and Emma at child grain rather
 * than one misleading household-level answer. Expansion is access-safe because
 * it starts from households that already passed the allow-list.
 */
export async function expandChildrenFromHouseholds(
    ctx: SearchRetrievalContext,
    householdIds: string[]
): Promise<SearchCandidate[]> {
    const ids = [...new Set(householdIds.filter(Boolean))];
    if (!ids.length) return [];
    if (allowListIsImpossible(ctx.envelope.allowedCustomerIds)) return [];

    let q = ctx.supabase
        .from("customer_members")
        .select("id, customer_id, person_id, display_name, first_name, last_name")
        .eq("org_id", ctx.orgId)
        .in("customer_id", ids);
    q = applySearchAllowList(q, "customer_id", ctx.envelope.allowedCustomerIds);

    const { data, error } = await q.limit(RETRIEVAL_FETCH_CAP);
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<{
        id: string;
        customer_id: string;
        person_id?: string | null;
        display_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
    }>).map((row) => ({
        kind: "child" as const,
        id: String(row.id),
        display_name:
            (row.display_name ?? "").trim() ||
            [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
            "Unnamed child",
        person_id: row.person_id ? String(row.person_id) : null,
        household_id: String(row.customer_id),
        match_text: joinSignals(row.display_name, row.first_name, row.last_name),
        matched_via_relation: true,
    }));
}

export type SearchSubjectAdapter = {
    kind: SearchSubjectKind;
    retrieve: (ctx: SearchRetrievalContext) => Promise<SearchCandidate[]>;
};

/**
 * The subject registry. Composition point for future subject kinds — a new kind
 * is a new entry here, never a new branch in the orchestrator.
 */
export const SEARCH_SUBJECT_ADAPTERS: readonly SearchSubjectAdapter[] = [
    { kind: "child", retrieve: retrieveChildren },
    { kind: "person", retrieve: retrievePersons },
    { kind: "household", retrieve: retrieveHouseholds },
    { kind: "location", retrieve: retrieveLocations },
];

/**
 * Run every registered adapter, then apply the ONE-SUBJECT law.
 *
 * A person who exists only as a child profile must not appear twice — once as a
 * `child` and once as a `person`. The child grain wins because it carries the
 * durable operational truth; the person id is preserved on the child subject.
 */
export function dedupeCandidates(candidates: SearchCandidate[]): SearchCandidate[] {
    const childPersonIds = new Set(
        candidates.filter((c) => c.kind === "child" && c.person_id).map((c) => String(c.person_id))
    );

    const seen = new Set<string>();
    const out: SearchCandidate[] = [];
    for (const c of candidates) {
        if (c.kind === "person" && childPersonIds.has(c.id)) continue;
        const key = `${c.kind}:${c.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
    }
    return out;
}

export async function retrieveSearchCandidates(ctx: SearchRetrievalContext): Promise<SearchCandidate[]> {
    if (ctx.envelope.impossible) return [];
    if (!ctx.intent.subject_terms.length) return [];

    const batches = await Promise.all(SEARCH_SUBJECT_ADAPTERS.map((a) => a.retrieve(ctx)));
    const direct = batches.flat();

    // Expand children from directly matched households so household-name queries
    // return schedule-bearing children at the correct grain.
    const householdIds = direct.filter((c) => c.kind === "household").map((c) => c.id);
    const expanded = householdIds.length ? await expandChildrenFromHouseholds(ctx, householdIds) : [];

    return dedupeCandidates([...direct, ...expanded]);
}
