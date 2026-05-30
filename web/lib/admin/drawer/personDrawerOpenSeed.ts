import {
    PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
} from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { findInquiryChildInOpportunityRecord } from "@/lib/admin/drawer/inquiryChildOpportunityRows";
import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { primaryPersonCardValuesFromRecord } from "@/lib/admin/drawer/primaryPersonCardEdit";
import type { PersonContactCardValues } from "@/lib/admin/drawer/primaryPersonCardEdit";
import { entityDataMatchesDrawer } from "@/lib/admin/drawer/entityDataMatchesDrawer";
import { personDrawerOpenSeedFromPersonRecord } from "@/lib/admin/drawer/personDrawerOpenSeedFromPersonRecord";
import { putDrawerEntitySnapshot, peekDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";

export const PERSON_DRAWER_SEED_SURFACE = "drawer_seed";
export const PERSON_DRAWER_CHILD_OPEN_SOURCE = "opportunity_inquiry_child";

export type PersonDrawerOpenSeed = {
    personId: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    display_name?: string;
    date_of_birth?: string;
    /** Inquiry/OCM placement hints for child header pills before hydrate. */
    program_label?: string;
    location_label?: string;
    placement_status_label?: string;
    opportunity_id?: string;
    opportunity_name?: string;
    /** First-paint drawer chrome before profile joins hydrate. */
    presentation_emphasis?: "child_lifecycle" | "guardian_communication";
};

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s.length > 0 ? s : null;
}

export function personDrawerOpenSeedFromContactValues(
    personId: string,
    values: PersonContactCardValues,
    options?: { presentation_emphasis?: PersonDrawerOpenSeed["presentation_emphasis"] }
): PersonDrawerOpenSeed {
    return {
        personId: personId.trim(),
        first_name: values.first_name || undefined,
        last_name: values.last_name || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        display_name: values.display_name || undefined,
        presentation_emphasis: options?.presentation_emphasis,
    };
}

export function personDrawerDisplayNameFromSeed(seed: PersonDrawerOpenSeed): string {
    const explicit = trimOrNull(seed.display_name);
    if (explicit) return explicit;
    const joined = [seed.first_name, seed.last_name].map((p) => trimOrNull(p)).filter(Boolean).join(" ");
    return joined || "Person";
}

/** Minimal person row for first paint — authoritative hydrate replaces via GET. */
export function buildPersonDrawerSeedRecord(seed: PersonDrawerOpenSeed): Record<string, unknown> {
    const id = seed.personId.trim();
    const first_name = trimOrNull(seed.first_name) ?? "";
    const last_name = trimOrNull(seed.last_name) ?? "";
    const display = personDrawerDisplayNameFromSeed(seed);
    const program_label = trimOrNull(seed.program_label);
    const location_label = trimOrNull(seed.location_label);
    const placement_status_label = trimOrNull(seed.placement_status_label);
    const opportunity_id = trimOrNull(seed.opportunity_id);
    const opportunity_name = trimOrNull(seed.opportunity_name);
    const enrollmentMirrorStub =
        seed.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS &&
        (program_label || location_label || placement_status_label || opportunity_id)
            ? [
                  {
                      id: `drawer-seed-${id}`,
                      program_label,
                      location_label,
                      opportunity_id,
                      opportunity_name,
                      outcome_status_label: placement_status_label,
                  },
              ]
            : undefined;

    return {
        id,
        first_name,
        last_name,
        email: trimOrNull(seed.email) ?? "",
        phone: trimOrNull(seed.phone) ?? "",
        _person_name: display,
        _record_surface: PERSON_DRAWER_SEED_SURFACE,
        ...(trimOrNull(seed.date_of_birth) ? { date_of_birth: trimOrNull(seed.date_of_birth) } : {}),
        ...(seed.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS
            ? { _drawer_presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS }
            : {}),
        ...(seed.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS
            ? { _drawer_presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS }
            : {}),
        ...(enrollmentMirrorStub ? { _enrollment_mirror: enrollmentMirrorStub } : {}),
    };
}

export function isPersonDrawerSeedRecord(record: Record<string, unknown> | null | undefined): boolean {
    return String(record?._record_surface ?? "").trim() === PERSON_DRAWER_SEED_SURFACE;
}

type InquiryChildSeedRowLike = {
    person_id?: string | null;
    customer_member_id?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    desired_program_label?: string | null;
    location_label?: string | null;
    outcome_status_label?: string | null;
};

/** Build child-lifecycle open seed from a resolved inquiry child row. */
export function personDrawerSeedFromInquiryChildRow(
    row: InquiryChildSeedRowLike,
    personId: string
): PersonDrawerOpenSeed {
    const pid = personId.trim();
    const first = trimOrNull(row.first_name);
    const last = trimOrNull(row.last_name);
    const display = trimOrNull(row.display_name);
    return {
        personId: pid,
        first_name: first ?? undefined,
        last_name: last ?? undefined,
        display_name: display ?? undefined,
        date_of_birth: trimOrNull(row.dob) ?? undefined,
        program_label: trimOrNull(row.desired_program_label) ?? undefined,
        location_label: trimOrNull(row.location_label) ?? undefined,
        placement_status_label: trimOrNull(row.outcome_status_label) ?? undefined,
        presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
    };
}

function seedFromInquiryChildMatch(
    opportunityRecord: Record<string, unknown>,
    personId: string
): PersonDrawerOpenSeed | null {
    const match = findInquiryChildInOpportunityRecord(opportunityRecord, { personId });
    if (!match) return null;
    return personDrawerSeedFromInquiryChildRow(
        {
            person_id: trimOrNull(match.person_id),
            customer_member_id: trimOrNull(match.customer_member_id),
            display_name: trimOrNull(match.display_name),
            first_name: trimOrNull(match.first_name),
            last_name: trimOrNull(match.last_name),
            dob: trimOrNull(match.dob),
        },
        personId
    );
}

/** Stamp child-lifecycle first-paint context onto a hydrated or cached person row. */
export function stampChildLifecycleOpenContextOnPersonRecord(
    record: Record<string, unknown>,
    seed: PersonDrawerOpenSeed | null | undefined
): Record<string, unknown> {
    if (!seed || seed.presentation_emphasis !== PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) {
        return record;
    }
    const next: Record<string, unknown> = { ...record };
    next._drawer_presentation_emphasis = PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS;
    if (trimOrNull(seed.first_name) && !trimOrNull(record.first_name)) {
        next.first_name = trimOrNull(seed.first_name);
    }
    if (trimOrNull(seed.last_name) && !trimOrNull(record.last_name)) {
        next.last_name = trimOrNull(seed.last_name);
    }
    if (trimOrNull(seed.display_name)) {
        next._person_name = trimOrNull(seed.display_name);
    }
    if (trimOrNull(seed.date_of_birth) && !trimOrNull(record.date_of_birth ?? record.dob)) {
        next.date_of_birth = trimOrNull(seed.date_of_birth);
    }
    return next;
}

/** Stamp parent/guardian first-paint context onto a hydrated or cached person row. */
export function stampParentGuardianOpenContextOnPersonRecord(
    record: Record<string, unknown>,
    seed: PersonDrawerOpenSeed | null | undefined
): Record<string, unknown> {
    if (!seed || seed.presentation_emphasis !== PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
        return record;
    }
    const next: Record<string, unknown> = { ...record };
    next._drawer_presentation_emphasis = PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS;
    if (trimOrNull(seed.first_name) && !trimOrNull(record.first_name)) {
        next.first_name = trimOrNull(seed.first_name);
    }
    if (trimOrNull(seed.last_name) && !trimOrNull(record.last_name)) {
        next.last_name = trimOrNull(seed.last_name);
    }
    if (trimOrNull(seed.email) && !trimOrNull(record.email)) {
        next.email = trimOrNull(seed.email);
    }
    if (trimOrNull(seed.phone) && !trimOrNull(record.phone)) {
        next.phone = trimOrNull(seed.phone);
    }
    if (trimOrNull(seed.display_name)) {
        next._person_name = trimOrNull(seed.display_name);
    }
    return next;
}

/** Merge parent open seed into drawer snapshot cache (prefetch + cache-hit opens). */
export function cachePersonDrawerParentOpenSeed(
    personId: string,
    seed: PersonDrawerOpenSeed | null | undefined
): Record<string, unknown> | null {
    const pid = personId.trim();
    if (!pid || !seed || seed.personId.trim() !== pid) return null;
    if (seed.presentation_emphasis !== PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) return null;

    const cached = peekDrawerEntitySnapshot("persons", pid);
    if (cached && String(cached.id ?? "").trim() === pid) {
        const stamped = stampParentGuardianOpenContextOnPersonRecord(cached, seed);
        putDrawerEntitySnapshot("persons", pid, stamped);
        return stamped;
    }

    const seedRecord = buildPersonDrawerSeedRecord(seed);
    putDrawerEntitySnapshot("persons", pid, seedRecord);
    return seedRecord;
}

/** Merge child open seed into drawer snapshot cache (prefetch + cache-hit opens). */
export function cachePersonDrawerChildOpenSeed(
    personId: string,
    seed: PersonDrawerOpenSeed | null | undefined
): Record<string, unknown> | null {
    const pid = personId.trim();
    if (!pid || !seed || seed.personId.trim() !== pid) return null;
    if (seed.presentation_emphasis !== PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) return null;

    const cached = peekDrawerEntitySnapshot("persons", pid);
    if (cached && String(cached.id ?? "").trim() === pid) {
        const stamped = stampChildLifecycleOpenContextOnPersonRecord(cached, seed);
        putDrawerEntitySnapshot("persons", pid, stamped);
        return stamped;
    }

    const seedRecord = buildPersonDrawerSeedRecord(seed);
    putDrawerEntitySnapshot("persons", pid, seedRecord);
    return seedRecord;
}

/** Build seed from opportunity mirror fields or `_opportunity_persons` row when id matches. */
export function personDrawerSeedFromOpportunityRecord(
    opportunityRecord: Record<string, unknown>,
    personId: string
): PersonDrawerOpenSeed | null {
    const pid = personId.trim();
    if (!pid) return null;

    const inquirySeed = seedFromInquiryChildMatch(opportunityRecord, pid);
    if (inquirySeed) return inquirySeed;

    const primaryId = primaryPersonIdFromOpportunityRecord(opportunityRecord);
    if (primaryId === pid) {
        const values = primaryPersonCardValuesFromRecord(opportunityRecord);
        return personDrawerOpenSeedFromContactValues(pid, values, {
            presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
        });
    }

    const rows = opportunityRecord._opportunity_persons;
    if (Array.isArray(rows)) {
        for (const row of rows) {
            if (!row || typeof row !== "object") continue;
            if (trimOrNull((row as { person_id?: unknown }).person_id) !== pid) continue;
            const name = trimOrNull((row as { name?: unknown }).name);
            const parts = name ? name.split(/\s+/).filter(Boolean) : [];
            return {
                personId: pid,
                first_name: parts[0] ?? "",
                last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
                email: trimOrNull((row as { email?: unknown }).email) ?? undefined,
                phone: trimOrNull((row as { phone?: unknown }).phone) ?? undefined,
                display_name: name ?? undefined,
                presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
            };
        }
    }

    return null;
}

export function applyPersonDrawerOpenSeed(
    personId: string,
    seed: PersonDrawerOpenSeed | null | undefined
): Record<string, unknown> | null {
    if (!seed || seed.personId.trim() !== personId.trim()) return null;
    return buildPersonDrawerSeedRecord(seed);
}

function resolveTransitionOpenSeed(args: {
    personId: string;
    openSeed?: PersonDrawerOpenSeed | null;
    fromPersonRecord?: Record<string, unknown> | null;
    opportunityRecord?: Record<string, unknown> | null;
}): PersonDrawerOpenSeed | null {
    const pid = args.personId.trim();
    if (!pid) return null;
    if (args.openSeed && args.openSeed.personId.trim() === pid) return args.openSeed;
    if (args.opportunityRecord) {
        const fromOpp = personDrawerSeedFromOpportunityRecord(args.opportunityRecord, pid);
        if (fromOpp) return fromOpp;
    }
    if (args.fromPersonRecord) {
        return personDrawerOpenSeedFromPersonRecord(args.fromPersonRecord, pid);
    }
    return null;
}

/** Stamp typed open seed onto cache or build a seed row for drawer transition first paint. */
export function resolvePersonDrawerTransitionSnapshot(args: {
    personId: string;
    openSeed?: PersonDrawerOpenSeed | null;
    fromPersonRecord?: Record<string, unknown> | null;
    opportunityRecord?: Record<string, unknown> | null;
}): Record<string, unknown> | null {
    const pid = args.personId.trim();
    if (!pid) return null;

    const seed = resolveTransitionOpenSeed(args);
    const cached = peekDrawerEntitySnapshot("persons", pid);

    if (seed?.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) {
        const stamped = cachePersonDrawerChildOpenSeed(pid, seed);
        if (stamped) return stamped;
    }
    if (seed?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
        const stamped = cachePersonDrawerParentOpenSeed(pid, seed);
        if (stamped) return stamped;
    }

    if (cached && entityDataMatchesDrawer(cached, pid, "persons")) {
        if (seed?.presentation_emphasis === PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS) {
            return stampChildLifecycleOpenContextOnPersonRecord(cached, seed);
        }
        if (seed?.presentation_emphasis === PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS) {
            return stampParentGuardianOpenContextOnPersonRecord(cached, seed);
        }
        return cached;
    }

    if (seed) {
        const seedRecord = buildPersonDrawerSeedRecord(seed);
        putDrawerEntitySnapshot("persons", pid, seedRecord);
        return seedRecord;
    }

    return null;
}
