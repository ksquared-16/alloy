/**
 * ESTABLISH IMMUTABLE REVISION AUTHORITY OVER A JOURNEY THAT NEVER HAD ONE.
 *
 * ## What this repairs, and what it deliberately is not
 *
 * A journey with no `business_process_revision_id` still RUNS — `resolveProcessInstanceConfiguration`
 * falls back to the live projection — but it cannot produce participant paperwork, because D-96
 * requires the governing requirements of a packet to be immutable. `launchParticipantEnrollment`
 * refuses such a journey, correctly, and that refusal is not weakened anywhere here.
 *
 * This is NOT a stage migration and not a status change. It writes exactly one column, on journeys
 * that are already governed in substance by the very configuration the revision froze, so that what
 * governs them stops being able to change underneath them.
 *
 * ## Why back-pinning is safe HERE, and how that is checked rather than assumed
 *
 * A published revision is a frozen copy of the configuration that was live when it was published.
 * When the department has no unpublished changes, the live projection an unpinned journey reads and
 * the revision payload a pinned one reads are the SAME configuration — so pinning changes nothing
 * about how the journey is interpreted. It only removes the ability for that to drift.
 *
 * That is a claim about the org, so the caller proves it (`configurationMatchesLive`) rather than
 * this module assuming it. And per journey the stage must still EXIST in the revision at the same
 * grain: pinning a child-grain journey to a revision whose stage of that key is family-grain would
 * silently reinterpret its work, which is the reinterpretation this census exists to refuse.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type JourneyPinClassification = "safe_to_pin" | "incompatible" | "terminal_no_pin_needed" | "ambiguous";

export type JourneyPinCandidate = {
    readonly id: string;
    readonly subject_id: string | null;
    readonly subject_type: string | null;
    readonly stage_key: string | null;
    readonly state: string | null;
    readonly classification: JourneyPinClassification;
    readonly reason: string;
};

export type RevisionStage = { readonly key: string; readonly grain: string | null; readonly is_active?: boolean };

/** Terminal journeys need no governing revision: nothing further will be realized from them. */
const TERMINAL_STATES = new Set(["completed", "cancelled", "canceled", "archived", "abandoned", "closed"]);

/**
 * Classify ONE journey against the revision it would be pinned to.
 *
 * Pure, so the census and the dry-run and the apply cannot disagree about what is safe.
 */
export function classifyJourneyForPin(
    journey: { id: string; subject_id: string | null; subject_type: string | null; stage_key: string | null; state: string | null },
    stages: readonly RevisionStage[],
    opts: { readonly configurationMatchesLive: boolean },
): JourneyPinCandidate {
    const base = {
        id: journey.id,
        subject_id: journey.subject_id,
        subject_type: journey.subject_type,
        stage_key: journey.stage_key,
        state: journey.state,
    };
    const state = (journey.state ?? "").trim().toLowerCase();
    if (TERMINAL_STATES.has(state)) {
        return { ...base, classification: "terminal_no_pin_needed", reason: `Journey is ${state}; nothing further is realized from it.` };
    }

    const stageKey = (journey.stage_key ?? "").trim().toLowerCase();
    if (!stageKey) {
        return { ...base, classification: "ambiguous", reason: "Journey names no stage, so the revision cannot be checked against it." };
    }

    const stage = stages.find((s) => s.key.trim().toLowerCase() === stageKey);
    if (!stage) {
        return { ...base, classification: "incompatible", reason: `The published revision has no stage "${stageKey}".` };
    }
    if (stage.is_active === false) {
        return { ...base, classification: "incompatible", reason: `Stage "${stageKey}" is inactive in the published revision.` };
    }

    /*
     * GRAIN IS THE ONE THING THAT SILENTLY REINTERPRETS COMPLETED WORK.
     *
     * A child-grain journey pinned to a revision whose stage of that key is family-grain would have
     * every requirement it has already satisfied re-read against a different subject.
     */
    const subject = (journey.subject_type ?? "").trim().toLowerCase();
    const grain = (stage.grain ?? "").trim().toLowerCase();
    if (subject && grain && subject !== grain) {
        return {
            ...base,
            classification: "incompatible",
            reason: `Journey subject is "${subject}" but the revision's "${stageKey}" stage is ${grain}-grain.`,
        };
    }

    if (!opts.configurationMatchesLive) {
        return {
            ...base,
            classification: "ambiguous",
            reason:
                "The department has unpublished changes, so the revision and the configuration this journey " +
                "has been running under are not known to be the same.",
        };
    }

    return { ...base, classification: "safe_to_pin", reason: `Stage "${stageKey}" matches at ${grain || "unspecified"} grain.` };
}

export type BackPinResult = {
    readonly target_revision_id: string;
    readonly dry_run: boolean;
    readonly candidates: readonly JourneyPinCandidate[];
    readonly counts: Readonly<Record<JourneyPinClassification, number>>;
    readonly pinned: readonly string[];
    readonly already_pinned: number;
};

/**
 * Census, and optionally pin, every unpinned journey of ONE process in ONE org.
 *
 * Idempotent by construction: the census only ever selects journeys whose revision is null, so a
 * second run finds nothing left to do. The write is additionally guarded `is null` so a journey
 * pinned concurrently by anything else is never overwritten.
 */
export async function backPinJourneyRevision(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly processKey: string;
        readonly targetRevisionId: string;
        readonly stages: readonly RevisionStage[];
        readonly configurationMatchesLive: boolean;
        /** Nothing is written unless this is explicitly false. */
        readonly dryRun: boolean;
    },
): Promise<{ ok: true; result: BackPinResult } | { ok: false; error: string }> {
    if (!input.targetRevisionId.trim()) return { ok: false, error: "A target published revision is required." };
    if (input.stages.length === 0) return { ok: false, error: "The target revision declares no stages." };

    const { data, error } = await supabase
        .from("process_instances")
        .select("id, subject_id, subject_type, stage_key, state, business_process_revision_id")
        .eq("org_id", input.orgId)
        .eq("process_key", input.processKey);
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as Array<{
        id: string;
        subject_id: string | null;
        subject_type: string | null;
        stage_key: string | null;
        state: string | null;
        business_process_revision_id: string | null;
    }>;

    const alreadyPinned = rows.filter((r) => (r.business_process_revision_id ?? "").trim()).length;
    const unpinned = rows.filter((r) => !(r.business_process_revision_id ?? "").trim());

    const candidates = unpinned.map((r) =>
        classifyJourneyForPin(r, input.stages, { configurationMatchesLive: input.configurationMatchesLive }),
    );
    const counts = {
        safe_to_pin: 0,
        incompatible: 0,
        terminal_no_pin_needed: 0,
        ambiguous: 0,
    } as Record<JourneyPinClassification, number>;
    for (const c of candidates) counts[c.classification] += 1;

    const pinned: string[] = [];
    if (!input.dryRun) {
        const safe = candidates.filter((c) => c.classification === "safe_to_pin").map((c) => c.id);
        for (const id of safe) {
            const { error: writeError } = await supabase
                .from("process_instances")
                .update({ business_process_revision_id: input.targetRevisionId })
                .eq("org_id", input.orgId)
                .eq("id", id)
                // Never overwrite a pin something else established in the meantime.
                .is("business_process_revision_id", null);
            if (writeError) return { ok: false, error: `${id}: ${writeError.message}` };
            pinned.push(id);
        }
    }

    return {
        ok: true,
        result: {
            target_revision_id: input.targetRevisionId,
            dry_run: input.dryRun,
            candidates,
            counts,
            pinned,
            already_pinned: alreadyPinned,
        },
    };
}
