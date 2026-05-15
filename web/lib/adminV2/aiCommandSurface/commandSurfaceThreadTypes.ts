import type { JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import type { TaskAssistCommandBootstrap, TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import type { TaskAssistCompactAction } from "@/lib/agent/taskAssist/taskAssistCompactActionCard";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
import type {
    WorkflowAssistErrorEnvelopeV1,
    WorkflowAssistReadCardPayloadV1,
    WorkflowAssistReadIntentV1,
    WorkflowAssistThreadMutationHandlersV1,
} from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import type { WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import type { AIStatusBadge, ResponseKind } from "@/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel";

export type CommandSurfaceThreadTurn =
    | {
          id: string;
          kind: "user_message";
          text: string;
          at: string;
      }
    | {
          id: string;
          kind: "assistant_notice";
          text: string;
          at: string;
      }
    | {
          id: string;
          kind: "candidate_results";
          candidates: TaskAssistEntitySearchCandidate[];
          intent: TaskAssistCommandIntent | null;
          at: string;
      }
    | {
          id: string;
          kind: "target_confirmed";
          candidate: TaskAssistEntitySearchCandidate;
          intent: TaskAssistCommandIntent | null;
          at: string;
      }
    | {
          id: string;
          kind: "action_card";
          card:
              | {
                    type: "task_assist";
                    entityId: string;
                    entityLabel: string;
                    locationLabel?: string | null;
                    bootstrap: TaskAssistCommandBootstrap;
                    bootstrapKey: string;
                    expanded: boolean;
                    /** draft = message compact card; reminder = operational task only; workspace = full Task Assist surface */
                    uiPhase: "draft" | "workspace" | "reminder";
                    chosenAction?: TaskAssistCompactAction | null;
                    showMoreOptions?: boolean;
                }
              | {
                    type: "job_layout";
                    submittedCommand: string;
                    headline: string;
                    subline?: string;
                    confidence: AIStatusBadge;
                    responseKind: ResponseKind;
                    plannerOk: JobOverviewPlannerSuccess | null;
                    structuredOverrideJson: string;
                    expanded: boolean;
                }
              | {
                    type: "workflow_assist_proposal";
                    suggestion: WorkflowAssistSuggestionV1;
                };
          at: string;
      }
    | {
          id: string;
          kind: "workflow_notice";
          at: string;
      }
    | {
          id: string;
          kind: "workflow_assist_read";
          submittedCommand: string;
          intent: WorkflowAssistReadIntentV1;
          payload: WorkflowAssistReadCardPayloadV1 | null;
          error: WorkflowAssistErrorEnvelopeV1 | null;
          at: string;
      }
    | {
          id: string;
          kind: "error";
          text: string;
          at: string;
      };

export type CommandSurfaceThreadState = {
    turns: CommandSurfaceThreadTurn[];
};

/** Turn payload without generated id/at — safe for appendThreadTurn. */
export type CommandSurfaceThreadTurnInput =
    | { kind: "user_message"; text: string }
    | { kind: "assistant_notice"; text: string }
    | {
          kind: "candidate_results";
          candidates: TaskAssistEntitySearchCandidate[];
          intent: TaskAssistCommandIntent | null;
      }
    | {
          kind: "target_confirmed";
          candidate: TaskAssistEntitySearchCandidate;
          intent: TaskAssistCommandIntent | null;
      }
    | {
          kind: "action_card";
          card: Extract<CommandSurfaceThreadTurn, { kind: "action_card" }>["card"];
      }
    | { kind: "workflow_notice" }
    | {
          kind: "workflow_assist_read";
          submittedCommand: string;
          intent: WorkflowAssistReadIntentV1;
          payload: WorkflowAssistReadCardPayloadV1 | null;
          error: WorkflowAssistErrorEnvelopeV1 | null;
      }
    | { kind: "error"; text: string };
