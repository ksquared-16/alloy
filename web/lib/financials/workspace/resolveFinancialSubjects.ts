/**
 * WHO HAS A FINANCIAL ACCOUNT — the cohort BEFORE any money exists.
 *
 * ── WHY THIS IS A SEPARATE READ FROM POSITION ──────────────────────────────────────────────────
 *
 * `resolveFinancialPositionCohort` answers "what is posted money doing". It discovers households by
 * scanning charges, so a household appears on it only once somebody has billed them. Accounts was
 * built on that cohort alone, and it therefore answered a question nobody asked: *which households
 * already have posted financial activity*. The question Accounts exists for is *which household
 * financial accounts can I understand or operate* — and a family with no transaction yet is a
 * perfectly ordinary answer to it. The household is a financial subject before its first charge;
 * that is when an operator most needs to reach it, because adding the first charge is the work.
 *
 * So the rail is `eligible financial subjects LEFT JOIN current financial position`. This module is
 * the left side. It reports NO money and computes none: it answers only who exists and where their
 * money would be located.
 *
 * ── THE ELIGIBILITY PREDICATE IS NOT INVENTED HERE ─────────────────────────────────────────────
 *
 * It was censused, and the codebase already owns it in two places that agree:
 *
 *   · `financialSubjectIdentity.ts` — "ONE RULE FOR 'does this subject have a financial account?'"
 *     resolves the household customer id and nothing else. Its own words: "Not an eligibility
 *     policy, and not a permission… This answers only the identity question: is there an account
 *     for this subject to be about." The account IS the household.
 *
 *   · `buildFinancialsCardVM` — "AN ENROLMENT IS ONE BILLABLE SOURCE, NOT ELIGIBILITY FOR
 *     FINANCIALS… a family incurs charges BEFORE they enrol — a waitlist fee, a registration or
 *     application fee, a deposit… A household with no enrolment still HAS an account. Financials
 *     answers for it."
 *
 * That is why this file does NOT gate on an active agreement. Gating on one is the exact product
 * assumption the canonical account reader removed and documented, and re-introducing it here would
 * put a second, contradictory eligibility system under the same word "account". Whether a
 * PARTICULAR charge needs an agreement stays where it already lives: the charge template and the
 * `charge.add` resolver.
 *
 * ── AND IT IS STILL NOT "EVERY ROW IN THE CRM" ─────────────────────────────────────────────────
 *
 * Eligibility is identity; VISIBILITY is the location contract, and it is applied here unchanged.
 * `financialWorkLocation.ts` already decides which financial work an operator may see, and this
 * lifts that decision from the charge grain to the subject grain by asking it of the very same
 * function, for every source the household can be charged against:
 *
 *   · each of its enrolment agreements  → `site` scope, that agreement's site
 *   · the household account itself      → `org` scope, no site
 *
 * A subject is in the cohort when AT LEAST ONE of those locations is visible. The consequences fall
 * out of the existing rule rather than being restated: a site filter admits only households with an
 * enrolment at that site; a site-restricted operator never sees an org-scoped household account,
 * because a household that belongs to no site is not inside any of the sites they hold. Site scope
 * can only narrow here, exactly as it can only narrow there.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    isFinancialWorkVisible,
    resolveFinancialWorkLocation,
    type FinancialWorkLocation,
} from "@/lib/financials/workspace/financialWorkLocation";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { ID_BATCH, readInBatches } from "@/lib/financials/workspace/resolveFinancialPosition";

/** How many households one subject read will look at. Mirrors the position scan cap deliberately. */
export const FINANCIAL_SUBJECT_SCAN_CAP = 2000;

/** One page of a PostgREST read. Stated, not assumed — `db-max-rows` is 1000 on this deployment. */
const PAGE = 1000;

export type FinancialSubjectRow = {
    customerId: string;
    /** The household's own name. Never an id on screen. */
    householdName: string | null;
    /** The sites this household's enrolment-backed money can belong to. Possibly empty. */
    siteLocationIds: string[];
    /**
     * True when the household holds at least one enrolment agreement.
     *
     * Reported, never used as a gate — see the eligibility note above. It exists so a surface can
     * say WHY an account is org-scoped rather than leaving an operator to guess.
     */
    hasEnrollmentAgreement: boolean;
    /**
     * ── WHAT THE QUEUE NARROWS BY, AND WHY IT IS HERE RATHER THAN IN A SEARCH INDEX ────────────
     *
     * An operator looking a family up types a CHILD's name as often as the household's, and asks
     * for "the Toddler room" or "the Preschool program" rather than for a household id. None of
     * that is financial: it is identity and placement, which is exactly what this read already
     * answers, so the facets ride the subject row instead of Financials growing a second search
     * index over households it does not own.
     *
     * Every one is CANONICAL and none is derived:
     *   childNames    `customer_members` — the durable household composer puts children here
     *   contactNames  `customer_persons` less the canonical `child` role — the adult edge, the
     *                 same predicate `resolvePayerCandidates` uses, borrowed rather than restated
     *   programs      the CURRENT `child_placements.program_category_id`, labelled by
     *                 `location_program_categories.label`
     *   rooms         the CURRENT `child_placements.room_location_id`, labelled by `locations.name`
     *
     * "Current" means a placement that has not ended, been superseded or been cancelled. A family
     * that left the Toddler room in June is not in the Toddler room.
     *
     * NOTHING HERE TOUCHES MONEY. A queue filter decides whether a household is LISTED; it can
     * never change what that household owes, and no figure on this surface is computed from a
     * facet.
     */
    childNames: string[];
    contactNames: string[];
    programs: FinancialSubjectFacet[];
    rooms: FinancialSubjectFacet[];
};

/** A canonical placement fact an operator can narrow the queue by. Id for the filter, label for the eye. */
export type FinancialSubjectFacet = { id: string; label: string };

export type FinancialSubjectCohort = {
    subjects: FinancialSubjectRow[];
    scope: { siteLocationId: string | null; siteScope: "all" | "restricted" };
    /** True when the household scan cap was reached — there are more subjects than this carries. */
    truncated: boolean;
    scanCap: number;
};

export type FinancialSubjectArgs = {
    orgId: string;
    /** The operator's own rights, resolved server-side. Never taken from a client. */
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: readonly string[];
    /** The site the operator selected, or null for org scope. */
    activeSiteLocationId?: string | null;
    scanCap?: number;
};

/**
 * Every location a household's money can occupy, resolved through the charge-grain contract.
 *
 * The household account location is unconditional because it is unconditional in the data: a
 * household can always be the billable source of a registration or waitlist fee, whether or not one
 * has been raised. Nothing here invents a site for a household that has none.
 */
function locationsForSubject(siteLocationIds: readonly string[]): FinancialWorkLocation[] {
    const out: FinancialWorkLocation[] = [];
    for (const site of siteLocationIds) {
        const located = resolveFinancialWorkLocation({
            billableSourceType: "enrollment_agreement",
            agreementSiteLocationId: site,
        });
        if (located) out.push(located);
    }
    const household = resolveFinancialWorkLocation({
        billableSourceType: "customer",
        agreementSiteLocationId: null,
    });
    if (household) out.push(household);
    return out;
}

/** Visible when any one of the household's locations is visible. Narrowing only, never widening. */
export function isFinancialSubjectVisible(args: {
    siteLocationIds: readonly string[];
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: readonly string[];
    activeSiteLocationId: string | null;
}): boolean {
    return locationsForSubject(args.siteLocationIds).some((location) =>
        isFinancialWorkVisible({
            location,
            siteScope: args.siteScope,
            allowedSiteLocationIds: args.allowedSiteLocationIds,
            activeSiteLocationId: args.activeSiteLocationId,
        }),
    );
}

export async function resolveFinancialSubjectCohort(
    supabase: SupabaseClient,
    args: FinancialSubjectArgs,
    /*
     * ── SAY WHERE THE COHORT'S TIME GOES ───────────────────────────────────────────────────────
     *
     * The route's `cohort;dur=` is 645-717 ms and gates the Accounts account list. A slice already
     * guessed at what was inside that label — collapsed the facet chaining from seven waves to
     * four — and the deployed number did not move. A duration with no interior is how that happens
     * twice, so the caller may pass a mark and get the phases.
     */
    mark?: (name: string) => void,
): Promise<FinancialSubjectCohort> {
    const phase = (name: string) => mark?.(name);
    const activeSiteLocationId = args.activeSiteLocationId?.trim() || null;
    const scanCap = Math.min(Math.max(args.scanCap ?? FINANCIAL_SUBJECT_SCAN_CAP, 1), FINANCIAL_SUBJECT_SCAN_CAP);
    const scope = { siteLocationId: activeSiteLocationId, siteScope: args.siteScope };

    /*
     * THE HOUSEHOLDS. Paged by `.range()` for the same reason the position scan is: a `.limit()`
     * larger than `db-max-rows` is answered with a silent short page, and a rail that quietly loses
     * families is worse than one that fails. Ordered by (name, id) — the id is the tiebreaker that
     * keeps paging stable when many households share a name.
     */
    const households: Array<{ id: string; name: string | null }> = [];
    let reachedEnd = false;
    while (households.length < scanCap) {
        const want = Math.min(PAGE, scanCap - households.length);
        const { data, error } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", args.orgId)
            .order("name", { ascending: true })
            .order("id", { ascending: true })
            .range(households.length, households.length + want - 1);
        if (error) throw new Error(`financial subjects: households could not be read (${error.message.trim()})`);
        const page = (data ?? []) as Array<{ id: string; name: string | null }>;
        for (const row of page) households.push(row);
        if (page.length < want) {
            reachedEnd = true;
            break;
        }
    }
    const truncated = !reachedEnd && households.length >= scanCap;

    phase("households");
    const customerIds = households.map((h) => h.id).filter(Boolean);
    /*
     * ── THE FACETS NEVER NEEDED THE AGREEMENT SITES ────────────────────────────────────────────
     *
     * `readAgreementSites` walks three dependent reads of its own — agreements by customer, then
     * the orphan agreements a paged scan finds, then the members those orphans name. The three
     * facet reads below take `customerIds` and NOTHING else: children, contacts and placements are
     * all keyed by the households wave one already produced.
     *
     * They ran after it purely because the site map is used first when the rows are assembled.
     * Measured with a holding client, that made this cohort SEVEN sequential waves, and measured on
     * deployed staging the whole endpoint took 1,370 ms to return 4.2 KB — the gate on the Accounts
     * shell, since the account list cannot render and the card cannot be asked for until it lands.
     *
     * Started together, the site map and the facets overlap instead of queueing. Same reads, same
     * predicates, same rows, same per-facet failure tolerance — each still degrades to an empty
     * facet rather than failing the cohort.
     */
    const sitesP = readAgreementSites(supabase, args.orgId, customerIds);
    const facetsP = Promise.all([
        readChildNames(supabase, args.orgId, customerIds).catch(() => new Map<string, string[]>()),
        readContactNames(supabase, args.orgId, customerIds).catch(() => new Map<string, string[]>()),
        readCurrentPlacements(supabase, args.orgId, customerIds).catch((e) => {
            /*
             * Non-fatal, and NOT silent. A household an operator cannot filter by room is still a
             * household they must be able to reach, so the rail renders — but a swallowed facet
             * failure once looked exactly like "this tenant has no rooms", which is how a wrong
             * column name survived a full pass.
             */
            console.warn(`financial subjects: placement facets unavailable — ${e instanceof Error ? e.message : String(e)}`);
            return new Map<string, { programs: FinancialSubjectFacet[]; rooms: FinancialSubjectFacet[] }>();
        }),
    ]);
    const sitesByCustomer = await sitesP;
    phase("agreement_sites");
    /*
     * The queue facets, read once for the whole cohort. Each is independently tolerant: a facet
     * read that fails leaves that facet empty rather than failing the cohort, because a household
     * an operator cannot filter by room is still a household they must be able to reach, and a
     * rail that refuses to render because a classroom label could not be read has turned a
     * convenience into an outage.
     */
    const [childrenByCustomer, contactsByCustomer, placementsByCustomer] = await facetsP;
    phase("facets");

    const subjects: FinancialSubjectRow[] = [];
    for (const household of households) {
        const siteLocationIds = [...(sitesByCustomer.get(household.id) ?? new Set<string>())];
        const visible = isFinancialSubjectVisible({
            siteLocationIds,
            siteScope: args.siteScope,
            allowedSiteLocationIds: args.allowedSiteLocationIds,
            activeSiteLocationId,
        });
        if (!visible) continue;
        subjects.push({
            customerId: household.id,
            householdName: typeof household.name === "string" && household.name.trim() ? household.name.trim() : null,
            siteLocationIds,
            hasEnrollmentAgreement: siteLocationIds.length > 0,
            childNames: childrenByCustomer.get(household.id) ?? [],
            contactNames: contactsByCustomer.get(household.id) ?? [],
            programs: placementsByCustomer.get(household.id)?.programs ?? [],
            rooms: placementsByCustomer.get(household.id)?.rooms ?? [],
        });
    }

    phase("assemble");
    return { subjects, scope, truncated, scanCap };
}

/**
 * The sites each household's enrolments sit at.
 *
 * `child_enrollment_agreements.customer_id` is NULLABLE — `resolveBillableSourceHouseholdId` exists
 * because of it, and takes the same second hop this does. An agreement that names only the child is
 * still that household's enrolment, and dropping it would silently place a family at org scope and
 * then hide them from the site they actually attend.
 */
async function readAgreementSites(
    supabase: SupabaseClient,
    orgId: string,
    customerIds: string[],
): Promise<Map<string, Set<string>>> {
    const byCustomer = new Map<string, Set<string>>();
    const add = (customerId: string, siteLocationId: string | null) => {
        const site = typeof siteLocationId === "string" ? siteLocationId.trim() : "";
        if (!customerId || !site) return;
        const set = byCustomer.get(customerId) ?? new Set<string>();
        set.add(site);
        byCustomer.set(customerId, set);
    };

    if (customerIds.length === 0) return byCustomer;

    const direct = await readInBatches<{ customer_id: string | null; site_location_id: string | null }>(
        "enrolment sites",
        customerIds,
        (batch) =>
            supabase
                .from("child_enrollment_agreements")
                .select("customer_id, site_location_id")
                .eq("org_id", orgId)
                .in("customer_id", batch),
    );
    for (const row of direct) add(String(row.customer_id ?? ""), row.site_location_id);

    /*
     * The second hop, for agreements carrying no household id. Bounded by one paged read of exactly
     * those rows rather than by the org's whole agreement history.
     */
    const orphans: Array<{ customer_member_id: string | null; site_location_id: string | null }> = [];
    while (orphans.length < FINANCIAL_SUBJECT_SCAN_CAP) {
        const want = Math.min(PAGE, FINANCIAL_SUBJECT_SCAN_CAP - orphans.length);
        const { data, error } = await supabase
            .from("child_enrollment_agreements")
            .select("customer_member_id, site_location_id")
            .eq("org_id", orgId)
            .is("customer_id", null)
            .order("id", { ascending: true })
            .range(orphans.length, orphans.length + want - 1);
        if (error) {
            throw new Error(`financial subjects: enrolment sites could not be read (${error.message.trim()})`);
        }
        const page = (data ?? []) as Array<{ customer_member_id: string | null; site_location_id: string | null }>;
        for (const row of page) orphans.push(row);
        if (page.length < want) break;
    }
    if (orphans.length === 0) return byCustomer;

    const memberIds = orphans.map((o) => String(o.customer_member_id ?? "")).filter(Boolean);
    const members = await readInBatches<{ id: string; customer_id: string | null }>(
        "enrolment households",
        memberIds,
        (batch) =>
            supabase
                .from("customer_members")
                .select("id, customer_id")
                .eq("org_id", orgId)
                .in("id", batch),
    );
    const customerByMember = new Map(members.map((m) => [String(m.id), String(m.customer_id ?? "")]));
    for (const row of orphans) {
        const customerId = customerByMember.get(String(row.customer_member_id ?? "")) ?? "";
        add(customerId, row.site_location_id);
    }
    return byCustomer;
}

// ── THE QUEUE FACETS ────────────────────────────────────────────────────────────────────────────

const named = (v: unknown): string => (v != null ? String(v).trim() : "");

/** An embedded `persons` row, however PostgREST chose to shape it. Never a guess at a name. */
function personName(embedded: unknown): string {
    const one = Array.isArray(embedded) ? embedded[0] : embedded;
    if (!one || typeof one !== "object") return "";
    const row = one as { first_name?: unknown; last_name?: unknown };
    return [named(row.first_name), named(row.last_name)].filter(Boolean).join(" ");
}

/** Deduplicated, ordered, and never containing an empty string. */
function uniqueNames(values: Iterable<string>): string[] {
    return [...new Set([...values].map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * The children on each household, from `customer_members`.
 *
 * The durable household composer puts a child's identity on the member row, which is why this is
 * the child list and `customer_persons` below is the adult one. Inactive members are excluded: a
 * child who has left is not who an operator is looking for when they type a name today.
 */
async function readChildNames(
    supabase: SupabaseClient,
    orgId: string,
    customerIds: string[],
): Promise<Map<string, string[]>> {
    const out = new Map<string, Set<string>>();
    if (customerIds.length === 0) return new Map();
    const rows = await readInBatches<{
        customer_id: string | null;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        is_active: boolean | null;
    }>("household children", customerIds, (batch) =>
        supabase
            .from("customer_members")
            .select("customer_id, display_name, first_name, last_name, is_active")
            .eq("org_id", orgId)
            .in("customer_id", batch),
    );
    for (const row of rows) {
        if (row.is_active === false) continue;
        const customerId = named(row.customer_id);
        if (!customerId) continue;
        const name =
            named(row.display_name) || [named(row.first_name), named(row.last_name)].filter(Boolean).join(" ");
        if (!name) continue;
        const set = out.get(customerId) ?? new Set<string>();
        set.add(name);
        out.set(customerId, set);
    }
    return new Map([...out].map(([k, v]) => [k, uniqueNames(v)]));
}

/**
 * The responsible adults on each household, from `customer_persons`.
 *
 * The predicate is BORROWED, not restated: `resolvePayerCandidates` already decided that an ended
 * or inactive relationship is history and that the canonical `child` role type is the subject
 * rather than a contact. Writing those three rules again here is how two surfaces end up
 * disagreeing about who is on a household.
 */
async function readContactNames(
    supabase: SupabaseClient,
    orgId: string,
    customerIds: string[],
): Promise<Map<string, string[]>> {
    const out = new Map<string, Set<string>>();
    if (customerIds.length === 0) return new Map();
    const rows = await readInBatches<{
        customer_id: string | null;
        role_type: string | null;
        status: string | null;
        end_date: string | null;
        /*
         * PostgREST types an embedded relation as an ARRAY here, and as an object where the
         * relationship is provably to-one. Accepting both and normalising once is cheaper than
         * being wrong about which, and a contact whose name cannot be read is simply not a name
         * the queue can be searched by.
         */
        persons: unknown;
    }>("household contacts", customerIds, (batch) =>
        supabase
            .from("customer_persons")
            .select("customer_id, role_type, status, end_date, persons(first_name, last_name)")
            .eq("org_id", orgId)
            .in("customer_id", batch),
    );
    for (const row of rows) {
        const customerId = named(row.customer_id);
        if (!customerId) continue;
        if (named(row.end_date)) continue;
        if (named(row.status).toLowerCase() === "inactive") continue;
        if (named(row.role_type).toLowerCase() === "child") continue;
        const name = personName(row.persons);
        if (!name) continue;
        const set = out.get(customerId) ?? new Set<string>();
        set.add(name);
        out.set(customerId, set);
    }
    return new Map([...out].map(([k, v]) => [k, uniqueNames(v)]));
}

/**
 * Placements that are STILL TRUE — the canonical program and room relationships.
 *
 * `child_placements` carries history by construction (`supersedes_placement_id` is a column), so
 * "which room is this family in" is a question about the rows that have not ended, been superseded
 * or been cancelled. Filtering the queue by a room a family left in June would be a filter that
 * answers a question nobody asked.
 *
 * The join is placement → household via the member, because a placement names the child.
 */
const CURRENT_PLACEMENT_STATUSES = new Set(["planned", "active", "ending"]);

async function readCurrentPlacements(
    supabase: SupabaseClient,
    orgId: string,
    customerIds: string[],
): Promise<Map<string, { programs: FinancialSubjectFacet[]; rooms: FinancialSubjectFacet[] }>> {
    const empty = new Map<string, { programs: FinancialSubjectFacet[]; rooms: FinancialSubjectFacet[] }>();
    if (customerIds.length === 0) return empty;

    /* Household → its member ids, so a placement naming a child can be attributed to the account. */
    const memberRows = await readInBatches<{ id: string; customer_id: string | null }>(
        "placement members",
        customerIds,
        (batch) =>
            supabase.from("customer_members").select("id, customer_id").eq("org_id", orgId).in("customer_id", batch),
    );
    const customerByMember = new Map<string, string>();
    for (const row of memberRows) {
        const memberId = named(row.id);
        const customerId = named(row.customer_id);
        if (memberId && customerId) customerByMember.set(memberId, customerId);
    }
    if (customerByMember.size === 0) return empty;

    const placements = await readInBatches<{
        customer_member_id: string | null;
        program_category_id: string | null;
        room_location_id: string | null;
        status: string | null;
    }>("current placements", [...customerByMember.keys()], (batch) =>
        supabase
            .from("child_placements")
            .select("customer_member_id, program_category_id, room_location_id, status")
            .eq("org_id", orgId)
            .in("customer_member_id", batch),
    );

    const programIds = new Set<string>();
    const roomIds = new Set<string>();
    const live: Array<{ customerId: string; programId: string; roomId: string }> = [];
    const programByMember = new Map<string, string>();
    for (const row of placements) {
        if (!CURRENT_PLACEMENT_STATUSES.has(named(row.status).toLowerCase())) continue;
        const memberId = named(row.customer_member_id);
        const customerId = customerByMember.get(memberId) ?? "";
        if (!customerId) continue;
        const programId = named(row.program_category_id);
        const roomId = named(row.room_location_id);
        if (programId) {
            programIds.add(programId);
            programByMember.set(memberId, programId);
        }
        if (roomId) roomIds.add(roomId);
        live.push({ customerId, programId, roomId });
    }

    /*
     * ── A PLACED CHILD'S PROGRAM, THEN A PRE-ENROLLED CHILD'S DESIRED ONE ──────────────────────
     *
     * `child_placements.program_category_id` is nullable, and a child who is enrolling has not been
     * placed at all — their program lives on the enrolment participation's metadata. The scheduling
     * route already settled that precedence and named the canonical owner in as many words
     * ("`process_instances.metadata.program_category_id` — the canonical owner, not OCM"), so this
     * takes the same two steps in the same order instead of deciding it a second time.
     *
     * Without it the Program filter is empty on a tenant whose placements carry a room and no
     * program — which is exactly the state the census found, so this is the difference between a
     * working control and one that never appears.
     */
    const unplacedProgramMembers = [...customerByMember.keys()].filter((id) => !programByMember.has(id));
    if (unplacedProgramMembers.length) {
        const instances = await readInBatches<{ subject_id: string | null; metadata: unknown }>(
            "enrolment program intent",
            unplacedProgramMembers,
            (batch) =>
                supabase
                    .from("process_instances")
                    .select("subject_id, metadata")
                    .eq("org_id", orgId)
                    .eq("process_key", ENROLLMENT_PROCESS_KEY)
                    .in("subject_id", batch),
        );
        for (const row of instances) {
            const memberId = named(row.subject_id);
            const customerId = customerByMember.get(memberId) ?? "";
            if (!customerId || programByMember.has(memberId)) continue;
            const meta = (row.metadata ?? {}) as { program_category_id?: unknown };
            const programId = named(meta.program_category_id);
            if (!programId) continue;
            programByMember.set(memberId, programId);
            programIds.add(programId);
            live.push({ customerId, programId, roomId: "" });
        }
    }

    if (live.length === 0) return empty;

    /*
     * CONFIGURATION OWNS THE WORDS. A raw id never reaches a filter an operator reads.
     *
     * The columns are BORROWED from the operational read model's own label resolvers rather than
     * guessed: a program is `location_program_categories.label` falling back to its `key`, and a
     * room is `locations.label`. This was written as `locations.name` on the first pass — a column
     * that does not exist — and because the facet read is deliberately tolerant, the error arrived
     * as an empty Room filter rather than as a failure. Hence the warning below: a facet that
     * cannot be read must stay non-fatal AND must stop being silent.
     */
    const programLabels = new Map<string, string>();
    if (programIds.size) {
        const rows = await readInBatches<{ id: string; label: string | null; key: string | null }>(
            "program categories",
            [...programIds],
            (batch) =>
                supabase
                    .from("location_program_categories")
                    .select("id, label, key")
                    .eq("org_id", orgId)
                    .in("id", batch),
        );
        for (const row of rows) programLabels.set(named(row.id), named(row.label) || named(row.key));
    }
    const roomLabels = new Map<string, string>();
    if (roomIds.size) {
        const rows = await readInBatches<{ id: string; label: string | null }>("placement rooms", [...roomIds], (batch) =>
            supabase.from("locations").select("id, label").eq("org_id", orgId).in("id", batch),
        );
        for (const row of rows) roomLabels.set(named(row.id), named(row.label));
    }

    const byCustomer = new Map<string, { programs: Map<string, string>; rooms: Map<string, string> }>();
    for (const row of live) {
        const entry = byCustomer.get(row.customerId) ?? { programs: new Map(), rooms: new Map() };
        const programLabel = programLabels.get(row.programId);
        if (row.programId && programLabel) entry.programs.set(row.programId, programLabel);
        const roomLabel = roomLabels.get(row.roomId);
        if (row.roomId && roomLabel) entry.rooms.set(row.roomId, roomLabel);
        byCustomer.set(row.customerId, entry);
    }

    const facets = (m: Map<string, string>): FinancialSubjectFacet[] =>
        [...m].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
    return new Map([...byCustomer].map(([k, v]) => [k, { programs: facets(v.programs), rooms: facets(v.rooms) }]));
}

/** Re-exported so callers batching alongside this module use one batch size, not two. */
export { ID_BATCH };
