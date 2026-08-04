/**
 * A4 — subjectless operational residue, plus the subject rules A1–A3 were missing.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md §4ter
 *
 * Pure. Every function here answers "may this row go, and on what stated grounds", and each returns
 * a reason alongside the verdict. The rule this module exists to enforce is that there is no fourth
 * category: a row is DELETE, PRESERVE-with-reason, or it aborts the run.
 */

export type ResidueVerdict = "delete" | "preserve" | "ambiguous";

export type ResidueDecision = {
    id: string;
    verdict: ResidueVerdict;
    reason: string;
};

// ---------------------------------------------------------------------------------------------
// Communication threads
// ---------------------------------------------------------------------------------------------

/**
 * Subject types a thread may canonically carry.
 *
 * Thread selection used to follow `opportunities` only, so a thread hung off a deleted PERSON
 * survived with its messages — visible in Communications with nothing behind it.
 */
export const CANONICAL_THREAD_SUBJECTS = ["opportunities", "persons", "customers"] as const;

/**
 * Synthetic subjects produced by staging/QA validation runs.
 *
 * These are NOT reusable test infrastructure — the ids are fabricated (`b0000001-0000-…`) and the
 * metadata is per-run fixture state. Treating them as infrastructure would leave live-looking
 * conversations in the operator's inbox after a certification reset.
 */
export const SYNTHETIC_THREAD_SUBJECTS = [
    "staging_live_validation",
    "staging_resend_smoke",
    "communications_unknown",
] as const;

export function classifyThread(
    thread: { id: string; primary_entity_type?: string | null; primary_entity_id?: string | null },
    deleted: { opportunityIds: Set<string>; personIds: Set<string>; customerIds: Set<string> },
): ResidueDecision {
    const type = (thread.primary_entity_type ?? "").trim();
    const subjectId = (thread.primary_entity_id ?? "").trim();

    if (!type) {
        return { id: thread.id, verdict: "delete", reason: "thread has no subject type at all" };
    }
    if ((SYNTHETIC_THREAD_SUBJECTS as readonly string[]).includes(type)) {
        return { id: thread.id, verdict: "delete", reason: `synthetic validation subject "${type}"` };
    }
    if (!(CANONICAL_THREAD_SUBJECTS as readonly string[]).includes(type)) {
        // A subject type nobody has classified. Silently keeping it hides residue; silently
        // deleting it invents authority. Neither is acceptable.
        return { id: thread.id, verdict: "ambiguous", reason: `unrecognised thread subject type "${type}"` };
    }

    const set =
        type === "opportunities" ? deleted.opportunityIds : type === "persons" ? deleted.personIds : deleted.customerIds;
    if (subjectId && set.has(subjectId)) {
        return { id: thread.id, verdict: "delete", reason: `subject ${type}/${subjectId} is being deleted` };
    }
    return { id: thread.id, verdict: "preserve", reason: `subject ${type}/${subjectId || "(none)"} survives the reset` };
}

// ---------------------------------------------------------------------------------------------
// Workflow events
// ---------------------------------------------------------------------------------------------

/**
 * Event subjects that are CONFIGURATION, whose history survives with the configuration.
 *
 * Deleting these would falsify the audit trail of config that the reset deliberately preserves —
 * a tenant claiming its programs were never published. Verification asserts the exact expected
 * count for these rather than tolerating "some rows remain".
 */
export const CONFIG_EVENT_SUBJECTS = [
    "program",
    "gl_accounts",
    /**
     * The reset's own audit event. It is the record that the baseline was established, written by
     * `certification_reset_execute` itself — deleting it on a later run would erase the provenance
     * of the very tenant state being certified. Preserved for the same reason program history is.
     */
    "certification_reset",
] as const;

/** Event subjects that are operational and follow their deleted subject. */
export const OPERATIONAL_EVENT_SUBJECTS = [
    "opportunities",
    "opportunity",
    "opportunity_customer_members",
    "customers",
    "persons",
    "child",
    "customer_members",
    "child_placements",
    "child_enrollment_agreements",
    "documents",
    "form_submissions",
    "form_packet_sessions",
    "tour_bookings",
    "schedule_assignments",
    "communications_unknown",
    "staging_resend_smoke",
    "staging_live_validation",
] as const;

export function classifyWorkflowEvent(event: { id: string; entity_type?: string | null }): ResidueDecision {
    const type = (event.entity_type ?? "").trim();
    if ((CONFIG_EVENT_SUBJECTS as readonly string[]).includes(type)) {
        return { id: event.id, verdict: "preserve", reason: `configuration history for "${type}"` };
    }
    if ((OPERATIONAL_EVENT_SUBJECTS as readonly string[]).includes(type)) {
        return { id: event.id, verdict: "delete", reason: `operational subject "${type}"` };
    }
    if (!type) {
        return { id: event.id, verdict: "delete", reason: "event has no subject type" };
    }
    return { id: event.id, verdict: "ambiguous", reason: `unclassified workflow event subject "${type}"` };
}

// ---------------------------------------------------------------------------------------------
// A4 — subjectless operational rows
// ---------------------------------------------------------------------------------------------

/**
 * Tables A4 may touch, and what a NULL subject means in each.
 *
 * An allowlist, deliberately. "Delete the remaining rows of every operational table" is the rule
 * this contract exists to avoid — it would reach reusable definitions the moment a new table
 * appeared. Every entry here was checked against hosted row shape.
 */
export const A4_TABLES = {
    documents: {
        subjectColumns: ["entity_type", "entity_id"],
        nullMeaning: "an uploaded artifact bound to no record and to no Processing case",
        reusableGuard: "template_key or doc_type set, or generated_from_document_id set",
    },
    contacts: {
        subjectColumns: ["customer_id", "person_id", "vendor_id"],
        nullMeaning: "a compatibility contact row for an identity that no longer exists",
        reusableGuard: "vendor_id set (vendor directory, not operational)",
    },
    form_submissions: {
        subjectColumns: ["opportunity_id", "person_id", "customer_id", "customer_member_id"],
        nullMeaning: "a public-link submission never bound to a subject",
        reusableGuard: "none — definitions are configuration, submissions never are",
    },
    operational_tasks: {
        subjectColumns: ["entity_type", "entity_id"],
        nullMeaning: "a task that can still surface in Work Items with nothing behind it",
        reusableGuard: "none",
    },
} as const;

export type A4Table = keyof typeof A4_TABLES;

/**
 * Is this row genuinely subjectless, and is it safe to remove?
 *
 * `protectedRefIds` are ids something preserved still points at — a subjectless row that is still
 * referenced is NOT residue, it is a dangling reference waiting to be understood.
 */
export function classifySubjectlessRow(
    table: A4Table,
    row: Record<string, unknown>,
    opts: { protectedRefIds?: Set<string>; reusable?: boolean } = {},
): ResidueDecision {
    const id = String(row.id);
    const spec = A4_TABLES[table];

    if (opts.reusable) {
        return { id, verdict: "preserve", reason: `reusable/configuration row (${spec.reusableGuard})` };
    }
    if (opts.protectedRefIds?.has(id)) {
        return { id, verdict: "preserve", reason: "still referenced by a preserved record" };
    }

    const hasSubject = spec.subjectColumns.some((col) => {
        const v = row[col as string];
        return v !== null && v !== undefined && String(v).trim() !== "";
    });
    if (hasSubject) {
        // It has a subject, so it is not A4's business — it should have been reached by an anchor.
        // Reaching here means a traversal is missing, which is a defect, not a deletion candidate.
        return {
            id,
            verdict: "ambiguous",
            reason: `row has a subject (${spec.subjectColumns.join("/")}) but no anchor reached it`,
        };
    }

    return { id, verdict: "delete", reason: spec.nullMeaning };
}

/** Documents that are reusable configuration rather than operational uploads. */
export function isReusableDocument(row: Record<string, unknown>): boolean {
    const s = (v: unknown) => (v == null ? "" : String(v).trim());
    return Boolean(s(row.template_key) || s(row.doc_type) || s(row.generated_from_document_id));
}
