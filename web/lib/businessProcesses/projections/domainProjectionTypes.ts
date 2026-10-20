/**
 * BP V2 Slice 2 — domain-backed Work Views: the projection contract.
 *
 * A `domain_projection` process (`process_model_v1`) declares WHICH domain it reads. Each of its Work
 * Views names one registered `projection_key`. A projection is an approved, read-only view over an
 * existing domain read model; configuration only ever SELECTS one. No query, predicate or code is ever
 * carried by tenant configuration.
 *
 * ── ONE COHORT, TWO CONSUMERS ──
 *
 * Counts (`evaluateWorkViewTotalsForGroup`) and rows (`composeWorkUnitProvisioningAnswer`) both call
 * `loadDomainProjectionCohort`, so the membership predicate exists exactly once. `total` is the length
 * of the SAME deduplicated, authorized cohort the rows are sliced from — never a second query.
 *
 * ── THE ROW IS THE RECORD, NOT THE SOURCE ──
 *
 * A row's `subject` is an EXISTING canonical record (child = `customer_members`, person = `persons`,
 * household = `customers`) that the existing durable Focus Panel already resolves. The domain fact that
 * put it in the cohort (an assignment, a charge) rides beside it as `source` — kept, never promoted into
 * a record type, never used as the identity of what opens.
 */

import type { DurableSubjectType } from "@/lib/runtime/focus/durableRecordRoute";
import type { ProcessProjectionDomain } from "@/lib/lifecycle/processModelV1";

export type DomainProjectionSubjectType = DurableSubjectType;

/** The authoritative domain fact behind a row. Identity only — never a record that opens. */
export type DomainProjectionSourceKind = "schedule_assignment" | "charge";

export type DomainProjectionRow = {
    subject: { type: DomainProjectionSubjectType; id: string };
    /** Recognition only. */
    label: string;
    source: {
        kind: DomainProjectionSourceKind;
        /** The representative source row for this subject (the primary assignment, the oldest charge). */
        id: string;
        /** How many in-cohort source facts this subject holds (≥ 1). Rows are per SUBJECT, never per fact. */
        count: number;
        /** Operator-facing state of the representative source, from the domain's own resolver. */
        statusLabel: string;
    };
    /** The site the domain attributes the source to — the input the scope filter already ran on. */
    siteLocationId: string | null;
};

/**
 * Server-resolved access scope. Taken from the request's authorization gate, never from a client.
 * `siteScope: "restricted"` admits only `allowedSiteLocationIds`; a source with no resolvable site is
 * withheld under a restricted scope rather than shown somewhere plausible.
 */
export type DomainProjectionScope = {
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: readonly string[];
};

export type DomainProjectionContext = {
    orgId: string;
    userId: string | null;
    scope: DomainProjectionScope;
};

export type DomainProjectionRefusalCode =
    /** The process is not a domain projection, or names no registered projection for its domain. */
    | "projection_unsupported"
    /** The caller lacks the domain's read capability (e.g. Billing without `fin.read`). */
    | "projection_forbidden"
    /** The domain read failed. Never rendered as an empty list. */
    | "projection_unavailable";

/**
 * What a projection answers. `ok` with zero rows is AUTHORITATIVELY empty; every other outcome is a
 * refusal and must never render as an empty list or a zero count.
 */
export type DomainProjectionCohort =
    | {
          status: "ok";
          domain: ProcessProjectionDomain;
          projectionKey: string;
          /** Deduplicated, authorized, in canonical order. */
          rows: DomainProjectionRow[];
          /** === rows.length. Null when `truncated` — a capped read cannot state a total. */
          total: number | null;
          /** The domain read hit its bound; the cohort is a prefix and `total` is unknown. */
          truncated: boolean;
      }
    | {
          status: "refused";
          code: DomainProjectionRefusalCode;
          message: string;
      };

export type DomainProjectionDefinition = {
    key: string;
    domain: ProcessProjectionDomain;
    label: string;
    /** The record grains this projection may emit. A row of another grain is a defect and is refused. */
    subjectTypes: readonly DomainProjectionSubjectType[];
    load(
        supabase: import("@supabase/supabase-js").SupabaseClient,
        ctx: DomainProjectionContext,
    ): Promise<
        | { ok: true; rows: DomainProjectionRow[]; truncated: boolean }
        | { ok: false; code: DomainProjectionRefusalCode; message: string }
    >;
};
