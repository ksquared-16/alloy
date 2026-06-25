/**
 * Business Process perspective metadata (Configuration Runtime Phase 2).
 * Stored on stage save as `perspectives_v1` — persistence wiring deferred to Phase 2B.
 */

export type PerspectiveConfigV1 = {
    queue_key: string;
    label: string;
    mission: string;
    visible_in_rail: boolean;
    display_order: number;
};

export type PerspectivesV1Metadata = {
    version: 1;
    perspectives: PerspectiveConfigV1[];
};

export const PERSPECTIVES_V1_METADATA_KEY = "perspectives_v1" as const;
