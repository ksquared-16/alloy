import type { AuthoringInput } from "@/lib/operationalExpectations/intake/authoringTypes";
import type { ExpectationQueryRow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import type { OperatingCalendarEntryDraft } from "@/lib/operatingCalendar/operatingCalendarVocabulary";

export const ORG = "00000000-0000-4000-8000-0000000000a1";
export const OTHER_ORG = "00000000-0000-4000-8000-0000000000b2";
export const SITE_A = "00000000-0000-4000-8000-00000000000a";
export const SITE_B = "00000000-0000-4000-8000-00000000000b";
export const ROOM_A1 = "00000000-0000-4000-8000-0000000000a1".replace(/a1$/, "c1");
export const ACTOR = "00000000-0000-4000-8000-0000000000ff";
export const LA = "America/Los_Angeles";
export const NY = "America/New_York";

let seq = 0;
let clock = Date.parse("2026-10-01T00:00:00Z");

/** The row the ledger would store for an act — what the RPC writes, minus the bookkeeping. */
export function rowFrom(
    input: AuthoringInput,
    opts: { orgId?: string; root?: string | null; id?: string } = {},
): ExpectationQueryRow {
    seq += 1;
    clock += 60_000;
    const id = opts.id ?? `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
    const transition =
        input.verb === "revise" ? "revision" : input.verb === "correct" ? "correction" : input.verb === "cancel" ? "cancellation" : null;
    return {
        id,
        org_id: opts.orgId ?? ORG,
        lineage_root_id: opts.root ?? (input.verb === "create" ? id : null),
        supersedes_expectation_id: input.predecessorId ?? null,
        verb: input.verb,
        transition_type: transition,
        modality: input.modality,
        author_class: "human",
        authority_key: input.authority.authorityKey,
        standing: "proposed",
        subject_kind: input.subjects[0]!.kind,
        subject_ref: input.subjects,
        condition: input.condition as unknown as Record<string, unknown>,
        valid_from: input.temporalFrame.validFrom,
        valid_to: input.temporalFrame.validTo ?? null,
        authored_at: new Date(clock).toISOString(),
    };
}

export function draft(over: Partial<OperatingCalendarEntryDraft>): OperatingCalendarEntryDraft {
    return {
        scope: "location",
        locationId: SITE_A,
        name: "Entry",
        designation: "closure",
        effect: "closed",
        fromDate: "2026-12-25",
        toDate: "2026-12-25",
        startTime: null,
        endTime: null,
        reasonKey: null,
        note: null,
        ...over,
    };
}

export function common(timezone = LA, key = `k-${seq + 1}`) {
    return { idempotencyKey: key, actorUserId: ACTOR, orgId: ORG, timezone };
}
