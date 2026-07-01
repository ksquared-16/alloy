/**
 * Generic Business Process metadata types — process-agnostic.
 *
 * Templates (Enrollment, Billing, etc.) produce config matching these shapes.
 * Generic runtime reads stored metadata only; no template imports here.
 */

/** Opaque subject identifier — template defines meaning (e.g. family_case, payer_obligation). */
export type ProcessTrackSubject = string;

export type ProcessTrackV1 = {
    key: string;
    label: string;
    subject: ProcessTrackSubject;
    sort_order: number;
};

export type ProcessSplitOutcomeV1 = {
    outcome_key: string;
    label: string;
    /** Target stage key in destination track; null = no movement. */
    target_stage_key: string | null;
};

export type ProcessSplitRuleV1 = {
    version: 1;
    from_track_key: string;
    from_stage_key: string;
    into_track_key: string;
    per_subject_outcomes: ProcessSplitOutcomeV1[];
};

export type ProcessTracksV1 = {
    version: 1;
    tracks: ProcessTrackV1[];
    split_rules: ProcessSplitRuleV1[];
};
