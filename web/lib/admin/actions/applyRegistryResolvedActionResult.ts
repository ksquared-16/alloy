import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";

export type ApplyRegistryResolvedActionResult =
    | { ok: true; execution_result?: Record<string, unknown> }
    | {
          ok: false;
          error?: string;
          /** Structured preflight from execute API when action blocked. */
          completion_requirements?: RequirementValidationResult;
          action_preflight?: ActionPreflightUiPayload;
      };
