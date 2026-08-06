"use client";

import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type {
    FamilyCloseAffectedChild,
    FamilyCloseBlock,
} from "@/lib/lifecycle/planGovernedFamilyClose";
import type { StageParticipantDecisionInputV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { ParticipantDecisionInputIssue } from "@/lib/lifecycle/applyParticipantDecisionInputs";

const ENDPOINT = "/api/admin/lifecycle-builder/family-close";

export type FamilyCloseScope = {
    opportunityId: string;
    departmentId: string;
    stageKey: string;
    templateKey: string;
};

export type FamilyClosePreview = {
    ok: true;
    configured: boolean;
    label?: string;
    child_outcome_label?: string;
    required_inputs?: StageParticipantDecisionInputV1[];
    allowed?: boolean;
    closing?: FamilyCloseAffectedChild[];
    skipped?: FamilyCloseAffectedChild[];
    blocks?: FamilyCloseBlock[];
    configuration_issue?: string;
};

export type FamilyCloseResult =
    | { ok: true; closed_children: FamilyCloseAffectedChild[]; degraded: string[] }
    | {
          ok: false;
          error: string;
          code?: string;
          blocks?: FamilyCloseBlock[];
          input_issues?: ParticipantDecisionInputIssue[];
          changed?: boolean;
      };

export async function fetchFamilyClosePreview(scope: FamilyCloseScope): Promise<FamilyClosePreview> {
    const qs = new URLSearchParams({
        opportunity_id: scope.opportunityId,
        department_id: scope.departmentId,
        stage_key: scope.stageKey,
        template_key: scope.templateKey,
    });
    const res = await fetch(`${ENDPOINT}?${qs.toString()}`, workspaceDataFetchInit());
    const json = (await res.json().catch(() => ({}))) as FamilyClosePreview & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Could not load close preview");
    return json;
}

export async function executeFamilyClose(
    scope: FamilyCloseScope,
    inputValues: Record<string, unknown>,
): Promise<FamilyCloseResult> {
    const res = await fetch(ENDPOINT, {
        ...workspaceDataFetchInit(),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            opportunity_id: scope.opportunityId,
            department_id: scope.departmentId,
            stage_key: scope.stageKey,
            template_key: scope.templateKey,
            input_values: inputValues,
        }),
    });
    const json = (await res.json().catch(() => ({}))) as FamilyCloseResult & { error?: string };
    if (!res.ok) {
        return {
            ok: false,
            error: json.error ?? "Could not close this family",
            code: (json as { code?: string }).code,
            blocks: (json as { blocks?: FamilyCloseBlock[] }).blocks,
            input_issues: (json as { input_issues?: ParticipantDecisionInputIssue[] }).input_issues,
            changed: (json as { changed?: boolean }).changed,
        };
    }
    return json;
}
