import type { JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import type { TaskAssistClarificationKind } from "@/lib/agent/taskAssist/taskAssistClarification";
import type { TaskAssistCommandBootstrap, TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import type { TaskAssistCompactAction } from "@/lib/agent/taskAssist/taskAssistCompactActionCard";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
import type {
    WorkflowAssistErrorEnvelopeV1,
    WorkflowAssistReadCardPayloadV1,
    WorkflowAssistReadIntentV1,
    WorkflowAssistThreadMutationHandlersV1,
} from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type {
    ConfigLayoutAssistFieldSetupDraftV1,
    ConfigLayoutAssistReadySummaryV1,
    ConfigLayoutAssistSectionOptionV1,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistFieldSetup";
import type { ConfigLayoutAssistTraceV1 } from "@/lib/agent/configLayoutAssist/configLayoutAssistTypes";
import type { WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import type { AIStatusBadge, ResponseKind } from "@/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel";
import type { BosCapabilityKey } from "@/lib/bos/bosCapability";
import type { BosProposalEnvelopeV1 } from "@/lib/bos/bosProposalEnvelope";

/** Optional BOS metadata on action cards — does not replace native payloads or `agent_key`. */
export type CommandSurfaceCardBosMetadata = {
    capability_key?: BosCapabilityKey;
};

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
          /** Visual boundary when operational context changes (V1 — not full per-record threads). */
          noticeRole?: "default" | "context_boundary";
          at: string;
      }
    | {
          id: string;
          kind: "candidate_results";
          candidates: TaskAssistEntitySearchCandidate[];
          intent: TaskAssistCommandIntent | null;
          workflowExplain?: {
              submittedCommand: string;
              intent: WorkflowAssistReadIntentV1;
          } | null;
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
              | ({
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
                } & CommandSurfaceCardBosMetadata)
              | ({
                    type: "job_layout";
                    submittedCommand: string;
                    headline: string;
                    subline?: string;
                    confidence: AIStatusBadge;
                    responseKind: ResponseKind;
                    plannerOk: JobOverviewPlannerSuccess | null;
                    structuredOverrideJson: string;
                    expanded: boolean;
                } & CommandSurfaceCardBosMetadata)
              | ({
                    type: "workflow_assist_proposal";
                    suggestion: WorkflowAssistSuggestionV1;
                    /** Present for NL create commands — extra proposal UX (not in suggestion hash). */
                    createInterpreted?: import("@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1").WorkflowAssistCreateProposeBuildV1["interpreted"];
                } & CommandSurfaceCardBosMetadata)
              | ({
                    type: "config_layout_assist_proposal";
                    proposal: ConfigurationProposalV1;
                    trace: ConfigLayoutAssistTraceV1;
                    persistedProposalId: string | null;
                } & CommandSurfaceCardBosMetadata)
              | ({
                    type: "config_layout_assist_field_setup";
                    introMessage: string;
                    draft: ConfigLayoutAssistFieldSetupDraftV1;
                    sectionOptions: ConfigLayoutAssistSectionOptionV1[];
                } & CommandSurfaceCardBosMetadata)
              | ({
                    type: "config_layout_assist_ready";
                    proposal: ConfigurationProposalV1;
                    trace: ConfigLayoutAssistTraceV1;
                    persistedProposalId: string;
                    readySummary: ConfigLayoutAssistReadySummaryV1;
                } & CommandSurfaceCardBosMetadata);
          /** Internal thread metadata — not sent to public APIs. */
          bos_envelope?: BosProposalEnvelopeV1 | null;
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
      }
    | {
          id: string;
          kind: "task_clarification";
          clarificationKind: TaskAssistClarificationKind;
          candidate: TaskAssistEntitySearchCandidate;
          intent: TaskAssistCommandIntent;
          at: string;
      }
    | {
          id: string;
          kind: "fuzzy_entity_suggestion";
          candidate: TaskAssistEntitySearchCandidate;
          queryToken: string;
          intent: TaskAssistCommandIntent | null;
          at: string;
      };

export type CommandSurfaceThreadState = {
    turns: CommandSurfaceThreadTurn[];
};

/** Turn payload without generated id/at — safe for appendThreadTurn. */
export type CommandSurfaceThreadTurnInput =
    | { kind: "user_message"; text: string }
    | { kind: "assistant_notice"; text: string; noticeRole?: "default" | "context_boundary" }
    | {
          kind: "candidate_results";
          candidates: TaskAssistEntitySearchCandidate[];
          intent: TaskAssistCommandIntent | null;
          workflowExplain?: {
              submittedCommand: string;
              intent: WorkflowAssistReadIntentV1;
          } | null;
      }
    | {
          kind: "target_confirmed";
          candidate: TaskAssistEntitySearchCandidate;
          intent: TaskAssistCommandIntent | null;
      }
    | {
          kind: "action_card";
          card: Extract<CommandSurfaceThreadTurn, { kind: "action_card" }>["card"];
          bos_envelope?: BosProposalEnvelopeV1 | null;
      }
    | { kind: "workflow_notice" }
    | {
          kind: "workflow_assist_read";
          submittedCommand: string;
          intent: WorkflowAssistReadIntentV1;
          payload: WorkflowAssistReadCardPayloadV1 | null;
          error: WorkflowAssistErrorEnvelopeV1 | null;
      }
    | { kind: "error"; text: string }
    | {
          kind: "task_clarification";
          clarificationKind: TaskAssistClarificationKind;
          candidate: TaskAssistEntitySearchCandidate;
          intent: TaskAssistCommandIntent;
      }
    | {
          kind: "fuzzy_entity_suggestion";
          candidate: TaskAssistEntitySearchCandidate;
          queryToken: string;
          intent: TaskAssistCommandIntent | null;
      };
