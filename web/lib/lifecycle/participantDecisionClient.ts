"use client";

import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type {
    ParticipantDecisionProgress,
    ParticipantDecisionRowVM,
} from "@/lib/lifecycle/projectParticipantDecisionRows";
import type { ParticipantDecisionAffected } from "@/lib/lifecycle/executeParticipantDecisionForChild";
import type { ParticipantDecisionInputIssue } from "@/lib/lifecycle/applyParticipantDecisionInputs";

const ENDPOINT = "/api/admin/lifecycle-builder/participant-decisions";

export type ParticipantDecisionSurfaceResponse = {
    ok: true;
    configured: boolean;
    template_key?: string;
    progress?: ParticipantDecisionProgress;
    rows?: ParticipantDecisionRowVM[];
    configuration_issues?: string[];
};

export type ParticipantDecisionExecuteResponse =
    | {
          ok: true;
          changed: boolean;
          decision_key: string;
          affected: ParticipantDecisionAffected;
          degraded: string[];
          progress?: ParticipantDecisionProgress;
          rows?: ParticipantDecisionRowVM[];
      }
    | {
          ok: false;
          error: string;
          code?: string;
          input_issues?: ParticipantDecisionInputIssue[];
          affected?: ParticipantDecisionAffected;
          changed?: boolean;
      };

export type ParticipantDecisionScope = {
    opportunityId: string;
    departmentId: string;
    stageKey: string;
    templateKey: string;
};

export async function fetchParticipantDecisionSurface(
    scope: ParticipantDecisionScope,
): Promise<ParticipantDecisionSurfaceResponse> {
    const qs = new URLSearchParams({
        opportunity_id: scope.opportunityId,
        department_id: scope.departmentId,
        stage_key: scope.stageKey,
        template_key: scope.templateKey,
    });
    const res = await fetch(`${ENDPOINT}?${qs.toString()}`, workspaceDataFetchInit());
    const json = (await res.json().catch(() => ({}))) as ParticipantDecisionSurfaceResponse & {
        error?: string;
    };
    if (!res.ok) throw new Error(json.error ?? "Could not load child paths");
    return json;
}

export async function executeParticipantDecision(
    scope: ParticipantDecisionScope,
    params: {
        decisionKey: string;
        customerMemberId: string;
        processInstanceId?: string | null;
        participantLabel?: string | null;
        inputValues?: Record<string, unknown>;
    },
): Promise<ParticipantDecisionExecuteResponse> {
    const res = await fetch(ENDPOINT, {
        ...workspaceDataFetchInit(),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            opportunity_id: scope.opportunityId,
            department_id: scope.departmentId,
            stage_key: scope.stageKey,
            template_key: scope.templateKey,
            decision_key: params.decisionKey,
            // The child, explicitly. Both components travel when known — the runtime uses the
            // durable subject and never infers one from the other.
            customer_member_id: params.customerMemberId,
            process_instance_id: params.processInstanceId ?? null,
            participant_label: params.participantLabel ?? null,
            input_values: params.inputValues ?? {},
        }),
    });
    const json = (await res.json().catch(() => ({}))) as ParticipantDecisionExecuteResponse & {
        error?: string;
    };
    if (!res.ok) {
        return {
            ok: false,
            error: json.error ?? "Could not record this decision",
            code: (json as { code?: string }).code,
            input_issues: (json as { input_issues?: ParticipantDecisionInputIssue[] }).input_issues,
            affected: (json as { affected?: ParticipantDecisionAffected }).affected,
            changed: (json as { changed?: boolean }).changed,
        };
    }
    return json;
}
