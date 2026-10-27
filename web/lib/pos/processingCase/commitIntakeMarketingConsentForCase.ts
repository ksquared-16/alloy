/**
 * PROCESSING APPROVE → MARKETING CONSENT (S7 × C1).
 *
 * Runs AFTER `commitApprovedLeadForCase` has committed (or linked) the family. The case's
 * intake consent evidence is handed to Communications' commit authority for the person the
 * lead belongs to — the person created here, or the existing person an operator linked. That
 * authority is the only writer of `communication_preferences` and it never turns an existing
 * opt-out into an opt-in.
 *
 *   - No evidence on the case → `not_applicable`.
 *   - Already committed (a replayed Approve) → the recorded outcome, and NOTHING is written again.
 *   - No resolved person → `no_person`; the evidence stays uncommitted for a later retry.
 *   - Otherwise each channel commits on its own, and the outcome is stamped on the case.
 *
 * Nothing here sends a message, and nothing here can undo the committed lead.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { commitMarketingConsentCaptures } from "@/lib/communications/preferences/intakeMarketingConsent";
import {
    capturesFromIntakeRecord,
    INTAKE_MARKETING_CONSENT_METADATA_KEY,
    readIntakeMarketingConsent,
    type IntakeMarketingConsentCommitOutcome,
    type IntakeMarketingConsentRecord,
} from "@/lib/communications/preferences/intakeMarketingConsentRecord";

export type IntakeMarketingConsentHandoff =
    | { kind: "not_applicable" }
    | { kind: "no_person" }
    | { kind: "committed"; personId: string; outcomes: IntakeMarketingConsentCommitOutcome[]; replayed: boolean }
    | { kind: "failed"; error: string };

async function readCaseMetadata(supabase: SupabaseClient, orgId: string, caseId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from("processing_cases")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("id", caseId)
        .maybeSingle();
    if (error) throw new Error(`processing_cases read: ${error.message}`);
    if (!data) return null;
    const m = (data as { metadata?: unknown }).metadata;
    return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

export async function commitIntakeMarketingConsentForCase(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; personId: string | null; actorUserId: string | null }
): Promise<IntakeMarketingConsentHandoff> {
    const meta = await readCaseMetadata(supabase, args.orgId, args.caseId);
    const record = readIntakeMarketingConsent(meta);
    if (!meta || !record) return { kind: "not_applicable" };
    if (record.committed) {
        return {
            kind: "committed",
            personId: record.committed.person_id,
            outcomes: record.committed.outcomes,
            replayed: true,
        };
    }
    if (!args.personId) return { kind: "no_person" };

    const results = await commitMarketingConsentCaptures(supabase, {
        orgId: args.orgId,
        personId: args.personId,
        captures: capturesFromIntakeRecord(record, { processingCaseId: args.caseId }),
        actorUserId: args.actorUserId,
    });
    const outcomes: IntakeMarketingConsentCommitOutcome[] = results.map((r) =>
        r.ok ? { channel: r.channel, outcome: r.outcome } : { channel: r.channel, outcome: "failed", error: r.error }
    );
    if (outcomes.some((o) => o.outcome === "failed")) {
        // Leave the evidence uncommitted so a retried Approve tries again; C1's writes are idempotent
        // for an opt-in (already_opted_in) and never weaken an opt-out.
        return { kind: "failed", error: outcomes.map((o) => o.error).filter(Boolean).join("; ") || "consent_commit_failed" };
    }

    // Stamp onto the case's CURRENT metadata (re-read, never a stale copy).
    const current = (await readCaseMetadata(supabase, args.orgId, args.caseId)) ?? meta;
    const next: IntakeMarketingConsentRecord = {
        ...(readIntakeMarketingConsent(current) ?? record),
        committed: { person_id: args.personId, committed_at: new Date().toISOString(), outcomes },
    };
    const { error } = await supabase
        .from("processing_cases")
        .update({ metadata: { ...current, [INTAKE_MARKETING_CONSENT_METADATA_KEY]: next } })
        .eq("org_id", args.orgId)
        .eq("id", args.caseId);
    if (error) return { kind: "failed", error: `processing_cases marketing_consent write: ${error.message}` };
    return { kind: "committed", personId: args.personId, outcomes, replayed: false };
}
