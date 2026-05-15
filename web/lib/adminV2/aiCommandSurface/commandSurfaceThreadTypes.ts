import type { JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import type { TaskAssistCommandBootstrap, TaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import type { TaskAssistCompactAction } from "@/lib/agent/taskAssist/taskAssistCompactActionCard";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
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
                    /** draft = auto-propose compact review card; workspace = full Task Assist surface */
                    uiPhase: "draft" | "workspace";
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
    | { kind: "error"; text: string };
