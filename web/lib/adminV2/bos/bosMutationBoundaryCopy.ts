/**
 * Standard mutation-boundary language (BOS UX Cards 15–17).
 * Distinguishes recommendation, preview, approval, apply, and execution.
 */

import { RECOMMENDATION_ONLY_CONFIG_COPY } from "@/lib/adminV2/bos/bosGovernanceCopy";

export const MUTATION_BOUNDARY_PREVIEW_ONLY = "Preview only — does not send or apply.";
export const MUTATION_BOUNDARY_COPY_ONLY = "Copy only — does not send.";
export const MUTATION_BOUNDARY_ENHANCED_DRAFT =
    "Enhanced draft (preview only) — review and copy; does not send.";
export const MUTATION_BOUNDARY_APPLIES_THROUGH_COMMS =
    "Sends through Communications when you confirm Send now or Schedule send.";
export const MUTATION_BOUNDARY_APPROVAL_REQUIRED = "Approval required before changes take effect.";
export const MUTATION_BOUNDARY_REVIEW_REQUIRED = "Review required — no changes are live yet.";
export const MUTATION_BOUNDARY_RECOMMENDATION_ONLY = RECOMMENDATION_ONLY_CONFIG_COPY;
export const MUTATION_BOUNDARY_CONFIG_NOT_LIVE =
    "No configuration changes are live until you review, approve, and apply.";
export const MUTATION_BOUNDARY_CONFIG_APPROVED_PENDING_APPLY =
    "Approved in Settings. Apply when you are ready to make this change live.";
export const MUTATION_BOUNDARY_WORKFLOW_DISABLED_DRAFT =
    "Creates a disabled workflow draft. Nothing runs until an admin enables it after apply.";
export const MUTATION_BOUNDARY_TASK_ASSIST_SEND =
    "Nothing sends until you confirm Send now or schedule.";
export const MUTATION_BOUNDARY_TASK_ASSIST_SCHEDULE =
    "Nothing sends until you confirm Schedule send or Send now. Pick a future send time for scheduling.";
export const MUTATION_BOUNDARY_TASK_ASSIST_REMINDER =
    "Creates an operational task on this record when you confirm — not a family message.";
export const MUTATION_BOUNDARY_TASK_ASSIST_DRAFT_SAVE =
    "Saves a review copy only — approve and send separately through Communications.";
