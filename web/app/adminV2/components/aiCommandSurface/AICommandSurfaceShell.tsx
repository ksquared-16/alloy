"use client";

import { ADMIN_AI_ACTIVITY_HREF } from "@/lib/admin/canonicalAdminRoutes";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ADMINV2_COMMAND_SURFACE_Z } from "@/components/admin/Drawer";
import { neutral, derived, brand, semantic } from "@/styles/tokens/colors";
import type { JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import { runOverviewLayoutSemanticPreview } from "@/lib/admin/agentLab/overviewLayoutSemanticAssistant";
import { shouldBlockSemanticNoopApply } from "@/lib/admin/agentLab/semanticOverviewNoopSummary";
import {
  badgeLabel,
  formatDiffSummaryHuman,
  formatIntentSummary,
  headlineForPreview,
  statusFromPlanner,
  type AIStatusBadge,
  type ResponseKind,
} from "@/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel";
import OperationalActiveRecordChip from "@/app/adminV2/components/bos/OperationalActiveRecordChip";
import {
  BosRailAttentionSection,
  BosRailComposer,
  BosRailConversationPreview,
  BosRailHeader,
  BosRailStarterCards,
} from "@/app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation";
import {
  JobLayoutOperationalProposalCard,
  type JobLayoutCardUiState,
} from "@/app/adminV2/components/aiCommandSurface/JobLayoutOperationalProposalCard";
import { dispatchAiActivityRefresh } from "@/app/adminV2/components/aiActivity/RecentAiActionsStrip";
import {
  activeOpportunityFromContext,
  buildActiveOpportunitySearchCandidate,
  shouldShortCircuitTaskAssistEntitySearch,
  usingActiveRecordNoticeText,
} from "@/lib/adminV2/bos/activeOperationalContext";
import { operationalContextSwitchNoticeText } from "@/lib/adminV2/bos/operationalContextSwitchNotice";
import { fetchAdminV2Sidecar } from "@/lib/adminV2/adminV2SidecarSession";
import {
    fetchWorkflowsNavKpis,
    fetchWorkflowsNavRuns7d,
    fetchWorkflowsNavSummary,
} from "@/lib/adminV2/workflowsNavSessionCache";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { useEntityLabelsOptional } from "@/contexts/EntityLabelsContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { resolveBosCommandSurfaceContextLabel } from "@/lib/adminV2/bos/bosCommandSurfaceContextPresentation";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
  buildTaskAssistCommandBootstrap,
  parseTaskAssistCommandIntent,
  type TaskAssistCommandBootstrap,
  type TaskAssistCommandIntent,
} from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import {
  WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE,
  buildWorkflowAssistReadCardPayload,
  workflowAssistErrorEnvelope,
  type WorkflowAssistErrorEnvelopeV1,
  type WorkflowAssistReadCardPayloadV1,
  type WorkflowAssistReadIntentV1,
  type WorkflowAssistThreadMutationHandlersV1,
} from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type {
  ConfigLayoutAssistCapabilitiesV1,
  ConfigLayoutAssistTraceV1,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistTypes";
import type {
  ConfigLayoutAssistFieldSetupDraftV1,
  ConfigLayoutAssistReadySummaryV1,
  ConfigLayoutAssistSectionOptionV1,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistFieldSetup";
import type { ConfigLayoutAssistFieldSetupConfirmPayload } from "@/app/adminV2/components/aiCommandSurface/ConfigLayoutAssistFieldSetupCard";
import { CONFIG_ASSIST_NEW_SECTION_VALUE } from "@/lib/agent/configLayoutAssist/configLayoutAssistFieldSetup";
import { parseConfigLayoutAssistIntent } from "@/lib/agent/configLayoutAssist/configLayoutAssistIntent";
import { configProposalReviewHrefForId } from "@/lib/agent/configLayoutAssist/configLayoutAssistReviewNavigation";
import type { ConfigProposalReviewDebugLog } from "@/lib/agent/configLayoutAssist/configLayoutAssistReviewNavigation";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { adminV2CommitNavigation } from "@/lib/adminV2/shellNavigation";
import {
  buildWorkflowAssistCreateProposeFromIntent,
  parseDaysBeforeTour,
  type WorkflowAssistCreateIntentV1,
  type WorkflowAssistCreateProposeBuildV1,
} from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import {
  extractExplainEntitySearchQuery,
  pickExplainEntityCandidate,
} from "@/lib/agent/workflowAssist/workflowAssistExplainEntityLookup";
import {
  buildWorkflowAssistEditDescriptionProposeBody,
  buildWorkflowAssistEditRenameProposeBody,
  buildWorkflowAssistPauseProposeBody,
  WORKFLOW_ASSIST_DESCRIPTION_NOTE_DEFAULT,
  workflowAssistRenameFallbackName,
} from "@/lib/agent/workflowAssist/workflowAssistEditFromReadV1";
import type { WorkflowAssistProposeRequestV1, WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { dedupeTaskAssistEntitySearchCandidates } from "@/lib/agent/taskAssist/taskAssistEntitySearchDedupe";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
import {
  buildWorkflowAssistExplainCardPayload,
  type WorkflowAssistExplainResponseV1,
} from "@/lib/agent/workflowAssist/workflowAssistExplainV1";
import { buildWorkflowOperationalTraceV1 } from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceBuilder";
import { buildWorkflowAssistExplainFromTraceV1 } from "@/lib/agent/workflowAssist/workflowAssistExplainFromTraceV1";
import type { WorkflowOperationalTraceV1 } from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceV1";
import {
  commandSurfaceEntitySearchQuery,
  routeCommandSurface,
  type CommandSurfaceRouteResult,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import { buildCommandSurfaceRoutingNotice } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRoutingCopy";
import {
  CAPABILITY_GATE_CHECKING_LABEL,
  COMMAND_SURFACE_SEARCHING_NOTICE,
  resolveCommandSurfaceRailStarterSuggestions,
  COMMAND_SURFACE_RAIL_THREAD_PANEL_MIN_HEIGHT_COLLAPSED_PX,
  COMMAND_SURFACE_RAIL_THREAD_SCROLL_MIN_HEIGHT_PX,
  COMMAND_SURFACE_THREAD_PANEL_MIN_HEIGHT_COLLAPSED_PX,
  COMMAND_SURFACE_THREAD_SCROLL_MIN_HEIGHT_PX,
  resolveCommandSurfaceThreadStatusLabel,
  shouldAppendCommandSurfaceRoutingNotice,
  shouldShowInlineThreadBusyIndicator,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceShellLayout";
import { resolveBosRailAttentionPresentation } from "@/lib/bos/bosRailAttentionPresentation";
import { resolveBosPolicyDenial } from "@/lib/adminV2/bos/bosGovernanceCopy";
import type { BosExecutionReceiptPresentation } from "@/lib/adminV2/bos/bosExecutionReceipt";
import {
  buildJobLayoutAppliedReceipt,
  buildJobLayoutFailedReceipt,
  configApplyOutcomeToExecutionReceipt,
} from "@/lib/adminV2/bos/bosExecutionReceipt";
import {
  buildConfigAssistApplyOutcomeFromApi,
  type ConfigAssistApplyApiPayload,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistApplyPresentation";
import {
  appendThreadTurn,
  createEmptyThreadState,
  newThreadTurnId,
  patchTaskAssistActionCard,
  toggleActionCardExpanded,
  updateThreadTurn,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadState";
import { appendActionCardTurnWithBosMetadata } from "@/lib/bos/commandSurfaceBosWire";
import type {
  CommandSurfaceThreadState,
  CommandSurfaceThreadTurn,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadTypes";
import CommandSurfaceThread from "@/app/adminV2/components/aiCommandSurface/CommandSurfaceThread";
import { shouldForceCommandSurfaceScrollToBottom } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadScroll";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import { formatTaskAssistEntitySearchNoMatchMessage } from "@/lib/agent/taskAssist/taskAssistEntitySearchVariants";
import { taskAssistFollowUpNoticeText } from "@/lib/agent/taskAssist/taskAssistCompactActionCard";
import { taskAssistCandidateListPrompt } from "@/lib/agent/taskAssist/taskAssistOrchestratorCopy";
import {
  clarificationPromptText,
  mergeClarificationIntoIntent,
  needsMessageGoalClarification,
  reminderClarificationKind,
  type TaskAssistClarificationKind,
} from "@/lib/agent/taskAssist/taskAssistClarification";
import { primaryTaskAssistEntitySearchToken } from "@/lib/agent/taskAssist/taskAssistEntitySearchVariants";
import { fetchTaskAssistEntitySearch, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
  ADMIN_V2_FOCUS_COMMAND_BAR,
  type AdminV2FocusCommandBarDetail,
} from "@/lib/adminV2/aiCommandSurface/adminV2CommandBarEvents";

const CMD = {
  textBody: neutral.textPrimary,
  textSupporting: "rgba(39, 63, 82, 0.78)",
  textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

/** Deterministic create proposal for “Propose new disabled workflow (template)” from read cards. */
const WORKFLOW_ASSIST_CREATE_PROPOSE_BODY = {
  version: 1 as const,
  proposal_kind: "create_workflow" as const,
  draft: {
    name: "Assist draft (disabled)",
    description:
      "Template starter only — not production-ready. Uses generic opportunity trigger placeholders. In Automations: review name, event/entity, conditions, actions, then enable manually.",
    event_type: "opportunity_status_changed",
    entity_type: "opportunity",
  },
} satisfies WorkflowAssistProposeRequestV1;

const BAR_MAX_WIDTH = 840;
const EXPANDED_MAX_H = 320;

function safeJson(x: unknown): string {
  return JSON.stringify(x, null, 2);
}

function clampExpandedHeightPx(viewportH: number): number {
  return Math.max(220, Math.min(EXPANDED_MAX_H, Math.round(viewportH * 0.42)));
}

function appendCommandSurfaceRoutingNoticeTurn(
  prev: CommandSurfaceThreadState,
  routed: CommandSurfaceRouteResult,
  activeRecordLabel?: string | null
): CommandSurfaceThreadState {
  if (!shouldAppendCommandSurfaceRoutingNotice(routed)) return prev;
  const text = buildCommandSurfaceRoutingNotice({ route: routed, activeRecordLabel });
  if (!text) return prev;
  return appendThreadTurn(prev, { kind: "assistant_notice", text, noticeRole: "routing" });
}

function lastThreadPreviewText(turns: CommandSurfaceThreadTurn[]): string | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!;
    if (turn.kind === "user_message") return turn.text.trim() || null;
    if (turn.kind === "assistant_notice") return turn.text.trim() || null;
    if (turn.kind === "error") return turn.text.trim() || null;
    if (turn.kind === "workflow_notice") return "Workflow Assist";
    if (turn.kind === "policy_denial") return turn.denial.headline;
    if (turn.kind === "execution_receipt") return turn.receipt.headline;
    if (turn.kind === "workflow_assist_read") return "Workflow assist";
    if (turn.kind === "candidate_results") return turn.candidates[0]?.label?.trim() || null;
    if (turn.kind === "target_confirmed") return turn.candidate.label?.trim() || null;
    if (turn.kind === "action_card") {
      if (turn.card.type === "task_assist") return turn.card.entityLabel?.trim() || null;
      if (turn.card.type === "job_layout") return turn.card.headline?.trim() || "Job layout";
      if (turn.card.type === "workflow_assist_proposal") return "Workflow Assist proposal";
      if (turn.card.type === "config_layout_assist_field_setup") return "Field setup";
      if (turn.card.type === "config_layout_assist_ready") return "Ready to apply";
      if (turn.card.type === "config_layout_assist_proposal") return "Configuration proposal";
    }
  }
  return null;
}

function newIds(): { request_id: string; correlation_id: string } {
  return { request_id: crypto.randomUUID(), correlation_id: crypto.randomUUID() };
}

/** Pine wash = positive path; Ember wash = gaps / unsupported / error. */
function outcomeWash(confidence: AIStatusBadge): { bg: string; isEmber: boolean } {
  const pine = derived.adminV2AiBarPineWash;
  const ember = `color-mix(in srgb, ${semantic.warning} 10%, ${neutral.surface})`;
  switch (confidence) {
    case "ready":
    case "applied":
    case "up_to_date":
    case "in_progress":
      return { bg: pine, isEmber: false };
    case "partial":
    case "gaps_only":
    case "error":
      return { bg: ember, isEmber: true };
    default:
      return { bg: neutral.background, isEmber: false };
  }
}

function outcomeBadgeStyles(confidence: AIStatusBadge, isEmberWash: boolean) {
  if (isEmberWash) {
    return {
      bg: "rgba(188, 67, 0, 0.12)",
      color: semantic.warning,
    };
  }
  return {
    bg: "rgba(0, 162, 131, 0.14)",
    color: semantic.success,
  };
}

/** Max 3 bullets for Details toggle — no paragraphs. */
function buildDetailsBullets(params: {
  kind: ResponseKind;
  planner: JobOverviewPlannerSuccess | null;
  commandText: string;
  errorSubline?: string;
}): string[] {
  const { kind, planner, commandText, errorSubline } = params;
  const out: string[] = [];

  const q = commandText.trim();
  if (q) {
    out.push(q.length > 88 ? `${q.slice(0, 85)}…` : q);
  }

  if (kind === "applied_success") {
    out.push("Layout saved to the job overview.");
    return out.slice(0, 3);
  }

  if (kind === "error" && errorSubline) {
    out.push(errorSubline);
    return out.slice(0, 3);
  }

  if (!planner) {
    return out.slice(0, 3);
  }

  if (!q) {
    const intents = formatIntentSummary(planner.parsed_intent);
    if (intents[0]) out.push(intents[0]);
  }

  if (planner.effective_layout_change) {
    const diffLines = formatDiffSummaryHuman(planner.diff_summary);
    if (diffLines[0]) out.push(diffLines[0]);
    const u = planner.resolution.unresolved_targets?.[0];
    if (u && out.length < 3) {
      out.push(`Not placed: ${u.concept_id} — ${u.reason}`);
    }
  } else {
    const un = planner.resolution.unresolved_targets ?? [];
    if (un.length) {
      out.push("No layout diff — unsupported asks.");
      if (un[0] && out.length < 3) out.push(`${un[0].concept_id}: ${un[0].reason}`);
    } else {
      out.push("No layout diff — already matches.");
    }
  }

  return out.filter(Boolean).slice(0, 3);
}

async function loadCurrentJobOverviewConfig(): Promise<unknown> {
  const res = await fetch("/api/admin/record-overview-layouts?entity_type=job&surface=overview", {
    credentials: "include",
  });
  const data = (await res.json()) as { layout?: { config?: unknown }; error?: string; message?: string };
  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
  }
  return data.layout?.config ?? {};
}

export type AICommandSurfacePresentation = "bottom" | "rail";

function SurfaceCard(props: {
  children: ReactNode;
  expanded: boolean;
  presentation?: AICommandSurfacePresentation;
  rootRef?: RefObject<HTMLElement | null>;
}) {
  const { children, expanded, presentation = "bottom", rootRef } = props;
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);

  if (presentation === "rail") {
    return (
      <footer
        ref={rootRef}
        data-adminv2-ai-command-surface
        data-adminv2-command-surface-layer="rail"
        data-command-surface-presentation="rail"
        role="contentinfo"
        aria-label="Orchestrator assistant"
        className="pointer-events-auto relative flex h-full w-full min-h-0 flex-1 flex-col"
        style={{
          backgroundColor: neutral.surface,
          background: neutral.surface,
        }}
      >
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">{children}</div>
      </footer>
    );
  }

  const footer = (
    <footer
      ref={rootRef}
      data-adminv2-ai-command-surface
      data-adminv2-command-surface-layer="global"
      data-command-surface-presentation="bottom"
      role="contentinfo"
      aria-label="Orchestrator assistant"
      className="pointer-events-auto fixed inset-x-0 bottom-2 flex w-full justify-center px-4"
      style={{
        zIndex: ADMINV2_COMMAND_SURFACE_Z,
        paddingTop: expanded ? 8 : 10,
        paddingBottom: 8,
        background: `linear-gradient(180deg, ${derived.adminV2AiBarPineWash} 0%, ${neutral.surface} 38%, ${neutral.surface} 100%)`,
        borderTop: `2px solid ${derived.adminV2AiBarPineBorder}`,
        boxShadow: `0 -2px 10px rgba(0, 162, 131, 0.05)`,
      }}
    >
      <div className="w-full" style={{ maxWidth: BAR_MAX_WIDTH }}>
        {children}
      </div>
    </footer>
  );

  if (!portalReady) return footer;
  return createPortal(footer, document.body);
}

function OutcomeZone(props: { headline: string; subline?: string; confidence: AIStatusBadge; submittedCommand?: string }) {
  const { headline, subline, confidence, submittedCommand } = props;
  const { bg, isEmber } = outcomeWash(confidence);
  const badge = outcomeBadgeStyles(confidence, isEmber);
  const oneLine = subline?.split("\n")[0]?.trim();

  return (
    <div className="px-3 py-3" style={{ backgroundColor: bg }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold leading-tight tracking-tight" style={{ color: CMD.textBody }}>
            {headline}
          </div>
          {oneLine ? (
            <div className="mt-1 text-[12px] leading-snug line-clamp-2" style={{ color: CMD.textSupporting }}>
              {oneLine}
            </div>
          ) : null}
        </div>
        <div
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{
            backgroundColor: badge.bg,
            color: badge.color,
            border: `1px solid ${derived.border}`,
          }}
          aria-label={`Status: ${badgeLabel(confidence)}`}
        >
          {badgeLabel(confidence)}
        </div>
      </div>
      {submittedCommand ? (
        <div
          className="mt-2 border-t pt-2 text-[12px] leading-snug"
          style={{ borderColor: isEmber ? "rgba(188, 67, 0, 0.15)" : "rgba(0, 162, 131, 0.15)" }}
        >
          <span className="font-semibold tracking-wide text-[10px]" style={{ color: CMD.textLabel }}>
            Your request
          </span>
          <p className="mt-0.5 line-clamp-3" style={{ color: CMD.textBody }} title={submittedCommand}>
            {submittedCommand}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AIActionsRow(props: {
  kind: ResponseKind;
  canApply: boolean;
  applying: boolean;
  applyBlockedByNoop: boolean;
  applyAnyway: boolean;
  onToggleApplyAnyway: (v: boolean) => void;
  onApply: () => void;
  onDismiss: () => void;
  onRefine: () => void;
}) {
  const {
    kind,
    canApply,
    applying,
    applyBlockedByNoop,
    applyAnyway,
    onToggleApplyAnyway,
    onApply,
    onDismiss,
    onRefine,
  } = props;
  const showApplyAnyway = kind === "no_op" || kind === "unresolved_only";
  const showApply = kind !== "loading" && kind !== "applied_success" && kind !== "error";

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {showApply ? (
        <button
          type="button"
          disabled={!canApply || applying}
          onClick={onApply}
          className="rounded-md px-3.5 py-2 text-[12px] font-bold tracking-wide disabled:opacity-45 disabled:cursor-not-allowed"
          style={{
            backgroundColor: brand.secondary,
            color: neutral.surface,
            letterSpacing: "0.05em",
          }}
        >
          {applying ? "Applying…" : "Apply"}
        </button>
      ) : null}

      {kind !== "loading" ? (
        <button
          type="button"
          onClick={onRefine}
          className="rounded-md border px-3 py-2 text-[12px] font-semibold"
          style={{ borderColor: derived.border, backgroundColor: neutral.surface, color: CMD.textBody }}
        >
          Refine
        </button>
      ) : null}

      {showApplyAnyway ? (
        <label className="inline-flex cursor-pointer items-center gap-1 text-[10px]" style={{ color: CMD.textSupporting }}>
          <input
            type="checkbox"
            className="h-3 w-3 shrink-0 rounded border"
            style={{ borderColor: derived.border }}
            checked={applyAnyway}
            onChange={(e) => onToggleApplyAnyway(e.target.checked)}
            aria-label="Apply without layout diff"
          />
          <span>
            Apply anyway
            {applyBlockedByNoop && !applyAnyway ? <span className="opacity-80"> · unlocks Apply</span> : null}
          </span>
        </label>
      ) : null}

      {kind !== "loading" ? (
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] font-medium underline-offset-2 hover:underline ml-auto sm:ml-0"
          style={{ color: CMD.textSupporting }}
          title="Collapse panel (Esc)"
        >
          Collapse
        </button>
      ) : null}

      <a
        href={ADMIN_AI_ACTIVITY_HREF}
        className="text-[10px] underline-offset-2 hover:underline opacity-70"
        style={{ color: CMD.textSupporting }}
        title="Full audit log (recent actions are above the command bar)"
      >
        Full log
      </a>
    </div>
  );
}

function DetailsToggle(props: {
  open: boolean;
  onToggle: () => void;
  bullets: string[];
}) {
  const { open, onToggle, bullets } = props;
  if (bullets.length === 0) return null;

  return (
    <div className="mt-2 border-t pt-2" style={{ borderColor: derived.border }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left text-[11px] font-semibold"
        style={{ color: CMD.textLabel }}
      >
        <span>Details</span>
        <span aria-hidden className="text-[10px]">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12px] leading-snug" style={{ color: CMD.textBody }}>
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AdvancedDrawer(props: {
  open: boolean;
  onToggle: () => void;
  planner?: JobOverviewPlannerSuccess | null;
  structuredOverrideJson?: string;
  applyResultJson?: string;
  errorDetailJson?: string;
}) {
  const { open, onToggle, planner, structuredOverrideJson, applyResultJson, errorDetailJson } = props;
  const hasJson =
    planner || structuredOverrideJson || applyResultJson || errorDetailJson;
  if (!hasJson) return null;

  return (
    <div className="mt-2 border-t pt-2" style={{ borderColor: derived.border }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-md border border-dashed px-2 py-1.5 text-[10px] font-medium"
        style={{
          borderColor: derived.border,
          backgroundColor: neutral.surface,
          color: CMD.textSupporting,
        }}
      >
        <span>Advanced (JSON)</span>
        <span aria-hidden>
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open ? (
        <div className="mt-2 grid max-h-[min(200px,35vh)] gap-2 overflow-y-auto pr-1">
          {planner ? (
            <pre className="rounded border p-2 font-mono text-[10px] leading-relaxed" style={{ borderColor: derived.border, backgroundColor: neutral.background, color: CMD.textSupporting }}>
              {safeJson(planner.parsed_intent)}
            </pre>
          ) : null}
          {planner ? (
            <pre className="rounded border p-2 font-mono text-[10px] leading-relaxed" style={{ borderColor: derived.border, backgroundColor: neutral.background, color: CMD.textSupporting }}>
              {safeJson(planner.diff_summary)}
            </pre>
          ) : null}
          {structuredOverrideJson ? (
            <pre className="rounded border p-2 font-mono text-[10px] leading-relaxed" style={{ borderColor: derived.border, backgroundColor: neutral.background, color: CMD.textSupporting }}>
              {structuredOverrideJson}
            </pre>
          ) : null}
          {applyResultJson ? (
            <pre className="rounded border p-2 font-mono text-[10px] leading-relaxed" style={{ borderColor: derived.border, backgroundColor: neutral.background, color: CMD.textSupporting }}>
              {applyResultJson}
            </pre>
          ) : null}
          {errorDetailJson ? (
            <pre className="rounded border p-2 font-mono text-[10px] leading-relaxed" style={{ borderColor: derived.border, backgroundColor: neutral.background, color: CMD.textSupporting }}>
              {errorDetailJson}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AICommandSurfaceShell({
  presentation = "bottom",
}: {
  presentation?: AICommandSurfacePresentation;
}) {
  const shellRootRef = useRef<HTMLElement | null>(null);
  const adminDrawer = useAdminDrawerOptional();

  const globalAssistant = useGlobalAssistantOptional();
  const { labels: entityLabelMap } = useEntityLabelsOptional();
  const opportunitySingular = entityLabelMap.opportunities?.singular ?? "Lead";
  const siteFilter = useWorkspaceSiteFilter();
  const selectedSiteId = siteFilter?.selectedSiteId ?? null;
  const taskAssistUiEnabled = isTaskAssistV1UiEnabled();

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [commandText, setCommandText] = useState("");
  const [localThread, setLocalThread] = useState<CommandSurfaceThreadState>(() => createEmptyThreadState());
  const [localJobCardUi, setLocalJobCardUi] = useState<
    Record<
      string,
      {
        advancedOpen: boolean;
        detailsOpen: boolean;
        applyAnyway: boolean;
        applying: boolean;
      }
    >
  >({});
  const [localThreadExpanded, setLocalThreadExpanded] = useState(true);

  const thread = globalAssistant?.commandSurfaceThread ?? localThread;
  const setThread = globalAssistant?.setCommandSurfaceThread ?? setLocalThread;

  const appendExecutionReceipt = useCallback(
    (receipt: BosExecutionReceiptPresentation) => {
      setThread((prev) => appendThreadTurn(prev, { kind: "execution_receipt", receipt }));
    },
    [setThread]
  );
  const jobCardUi = globalAssistant?.commandSurfaceJobCardUi ?? localJobCardUi;
  const setJobCardUi = globalAssistant?.setCommandSurfaceJobCardUi ?? setLocalJobCardUi;
  const threadExpanded = globalAssistant?.commandSurfaceThreadExpanded ?? localThreadExpanded;
  const setThreadExpanded = globalAssistant?.setCommandSurfaceThreadExpanded ?? setLocalThreadExpanded;
  const clearConversation = globalAssistant?.clearCommandSurfaceConversation ?? (() => {
    setLocalThread(createEmptyThreadState());
    setLocalJobCardUi({});
  });

  const [busy, setBusy] = useState(false);
  const [workflowAssistMutationCapable, setWorkflowAssistMutationCapable] = useState<boolean | null>(null);
  const [configLayoutAssistCaps, setConfigLayoutAssistCaps] = useState<ConfigLayoutAssistCapabilitiesV1 | null>(
    null
  );
  const [viewportH, setViewportH] = useState(900);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const pendingClarificationRef = useRef<{
    candidate: TaskAssistEntitySearchCandidate;
    intent: TaskAssistCommandIntent;
    awaiting: TaskAssistClarificationKind;
  } | null>(null);
  const prevOperationalEntityIdRef = useRef<string | null>(null);

  const activeOperationalEntityId =
    globalAssistant?.currentContext?.entity_type === "opportunities" ?
      (globalAssistant.currentContext.entity_id?.trim() || null)
      : null;

  const panelMaxHeight = useMemo(() => clampExpandedHeightPx(viewportH), [viewportH]);

  /** Card 2 — subtle notice when operational context switches records (not on first seed). */
  useEffect(() => {
    if (!globalAssistant) return;
    const ctx = globalAssistant.currentContext;
    const nextId = ctx?.entity_type === "opportunities" ? (ctx.entity_id?.trim() || null) : null;
    const prevId = prevOperationalEntityIdRef.current;
    if (prevId && nextId && prevId !== nextId && ctx?.label?.trim()) {
      setThread((p) =>
        appendThreadTurn(p, {
          kind: "assistant_notice",
          text: operationalContextSwitchNoticeText(ctx.label),
          noticeRole: "context_boundary",
        })
      );
    }
    prevOperationalEntityIdRef.current = nextId;
  }, [globalAssistant, globalAssistant?.currentContext?.entity_id, globalAssistant?.currentContext?.label, setThread]);

  const proceedToTaskAssistAction = useCallback(
    (
      candidate: TaskAssistEntitySearchCandidate,
      intent: TaskAssistCommandIntent,
      bootstrapOverride?: TaskAssistCommandBootstrap | null,
      opts?: { communicationHandoff?: boolean }
    ) => {
      if (!globalAssistant) return;
      globalAssistant.setAssistantContext({
        entity_type: "opportunities",
        entity_id: candidate.entity_id,
        label: candidate.label,
        source_surface: "command_bar",
      });
      const bootstrap =
        bootstrapOverride ??
        (intent
            ? buildTaskAssistCommandBootstrap(intent)
            : buildTaskAssistCommandBootstrap({
                intent_type: "draft_message",
                channel_hint: null,
                timing_hint_text: null,
                message_goal_text: null,
                search_text_hint: null,
                confidence: "low",
                warnings: [],
                workflow_blocked: false,
              }));
      const locationLabel = candidate.disambiguation?.location_name ?? null;
      const isReminderIntent = intent?.intent_type === "create_reminder";
      const messageIntent =
        !isReminderIntent &&
        (intent?.intent_type === "draft_message" ||
          intent?.intent_type === "schedule_message" ||
          Boolean(intent?.message_goal_text?.trim()) ||
          Boolean(bootstrap.synthesized_draft));
      const uiPhase: "draft" | "workspace" | "reminder" = isReminderIntent ? "reminder" : messageIntent ? "draft" : "workspace";
      const noticeText =
        opts?.communicationHandoff && bootstrap.synthesized_draft
            ? "Suggested message ready for review."
            : taskAssistFollowUpNoticeText(candidate, locationLabel, intent);
      setThread((prev) => {
        let next = appendThreadTurn(prev, {
          kind: "assistant_notice",
          text: noticeText,
        });
        next = appendThreadTurn(next, {
          kind: "action_card",
          card: {
            type: "task_assist",
            entityId: candidate.entity_id,
            entityLabel: candidate.label,
            locationLabel,
            bootstrap,
            bootstrapKey: `${candidate.entity_id}-${Date.now()}`,
            expanded: uiPhase === "workspace",
            uiPhase,
            chosenAction: null,
            showMoreOptions: false,
          },
        });
        return next;
      });
    },
    [globalAssistant, setThread]
  );

  const runWorkflowAssistExplainForEntity = useCallback(
    async (
      submitted: string,
      intent: WorkflowAssistReadIntentV1,
      candidate: TaskAssistEntitySearchCandidate
    ) => {
      const appendRead = (args: {
        payload: WorkflowAssistReadCardPayloadV1 | null;
        error: WorkflowAssistErrorEnvelopeV1 | null;
      }) => {
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "workflow_assist_read",
            submittedCommand: submitted,
            intent,
            payload: args.payload,
            error: args.error,
          })
        );
      };
      try {
        const qs = new URLSearchParams({
          entity_type: "opportunities",
          entity_id: candidate.entity_id,
          range: "30d",
        });
        const exRes = await fetch(`/api/admin/ai/workflow-assist/explain?${qs.toString()}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const exJson = (await exRes.json().catch(() => ({}))) as {
          ok?: boolean;
          explanation?: WorkflowAssistExplainResponseV1;
          trace?: WorkflowOperationalTraceV1;
          message?: string;
          error?: string;
        };
        if (!exRes.ok || !exJson.ok || !exJson.explanation) {
          const msg = exJson.message ?? exJson.error ?? `HTTP ${exRes.status}`;
          appendRead({
            payload: null,
            error: workflowAssistErrorEnvelope(
              exRes.status === 403 ? "forbidden" : "fetch_failed",
              msg,
              exRes.status
            ),
          });
          return;
        }
        appendRead({
          payload: buildWorkflowAssistExplainCardPayload(exJson.explanation, exJson.trace),
          error: null,
        });
      } catch (e) {
        appendRead({
          payload: null,
          error: workflowAssistErrorEnvelope(
            "fetch_failed",
            e instanceof Error ? e.message : "Workflow Assist explain failed."
          ),
        });
      }
    },
    [setThread]
  );

  const confirmTaskAssistTarget = useCallback(
    (
      _turnId: string,
      candidate: TaskAssistEntitySearchCandidate,
      intent: TaskAssistCommandIntent | null,
      workflowExplain?: { submittedCommand: string; intent: WorkflowAssistReadIntentV1 } | null
    ) => {
      if (workflowExplain) {
        void runWorkflowAssistExplainForEntity(workflowExplain.submittedCommand, workflowExplain.intent, candidate);
        return;
      }
      if (!globalAssistant || !intent) return;
      if (needsMessageGoalClarification(intent)) {
        pendingClarificationRef.current = { candidate, intent, awaiting: "message_goal" };
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "task_clarification",
            clarificationKind: "message_goal",
            candidate,
            intent,
          })
        );
        return;
      }
      const remKind = reminderClarificationKind(intent);
      if (remKind) {
        pendingClarificationRef.current = { candidate, intent, awaiting: remKind };
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "task_clarification",
            clarificationKind: remKind,
            candidate,
            intent,
          })
        );
        return;
      }
      proceedToTaskAssistAction(candidate, intent);
    },
    [globalAssistant, proceedToTaskAssistAction, runWorkflowAssistExplainForEntity, setThread]
  );

  const onClarificationChip = useCallback(
    (
      _turnId: string,
      candidate: TaskAssistEntitySearchCandidate,
      intent: TaskAssistCommandIntent,
      kind: TaskAssistClarificationKind,
      payload: { goalText?: string; timingText?: string; custom?: boolean }
    ) => {
      if (payload.custom) {
        pendingClarificationRef.current = { candidate, intent, awaiting: kind };
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "assistant_notice",
            text: clarificationPromptText(kind),
          })
        );
        return;
      }
      let merged = mergeClarificationIntoIntent(intent, {
        goalText: payload.goalText,
        timingText: payload.timingText,
      });
      if (kind === "message_goal" && needsMessageGoalClarification(merged)) return;
      if (kind === "reminder_what") {
        const nextKind = reminderClarificationKind(merged);
        if (nextKind) {
          pendingClarificationRef.current = { candidate, intent: merged, awaiting: nextKind };
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "task_clarification",
              clarificationKind: nextKind,
              candidate,
              intent: merged,
            })
          );
          return;
        }
      }
      pendingClarificationRef.current = null;
      proceedToTaskAssistAction(candidate, merged);
    },
    [proceedToTaskAssistAction, setThread]
  );

  const onToggleTaskAssistMoreOptions = useCallback(
    (turnId: string) => {
      setThread((prev) => patchTaskAssistActionCard(prev, turnId, { showMoreOptions: true }));
    },
    [setThread]
  );

  const runTaskAssistRoute = useCallback(
    async (cmd: string, intent: TaskAssistCommandIntent | null, slots: ReturnType<typeof routeCommandSurface>["slots"]) => {
      if (!globalAssistant || !taskAssistUiEnabled) {
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "policy_denial",
            denial: resolveBosPolicyDenial("task_assist_unavailable"),
          })
        );
        return;
      }

      const activeOpp = activeOpportunityFromContext(globalAssistant.currentContext);
      const effectiveIntent = intent ?? parseTaskAssistCommandIntent(cmd);

      if (shouldShortCircuitTaskAssistEntitySearch({ command: cmd, activeOpportunity: activeOpp })) {
        const chip = buildActiveOpportunitySearchCandidate(activeOpp!);
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "assistant_notice",
            text: usingActiveRecordNoticeText(activeOpp!.label),
          })
        );
        if (needsMessageGoalClarification(effectiveIntent)) {
          pendingClarificationRef.current = { candidate: chip, intent: effectiveIntent, awaiting: "message_goal" };
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "task_clarification",
              clarificationKind: "message_goal",
              candidate: chip,
              intent: effectiveIntent,
            })
          );
          return;
        }
        const remKind = reminderClarificationKind(effectiveIntent);
        if (remKind) {
          pendingClarificationRef.current = { candidate: chip, intent: effectiveIntent, awaiting: remKind };
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "task_clarification",
              clarificationKind: remKind,
              candidate: chip,
              intent: effectiveIntent,
            })
          );
          return;
        }
        proceedToTaskAssistAction(chip, effectiveIntent);
        return;
      }

      const qEff = commandSurfaceEntitySearchQuery(cmd, slots, intent);
      setThread((prev) =>
        appendThreadTurn(prev, {
          kind: "assistant_notice",
          text: COMMAND_SURFACE_SEARCHING_NOTICE,
          noticeRole: "searching",
        })
      );
      try {
        const res = await fetchTaskAssistEntitySearch({
          q: qEff,
          entity_type: "all",
          workspace_site_id: selectedSiteId,
        });
        const j = await readJson<{
          ok?: boolean;
          candidates?: TaskAssistEntitySearchCandidate[];
          message?: string;
        }>(res);
        if (!res.ok || j.ok === false) {
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "error",
              text: typeof j.message === "string" && j.message.trim() ? j.message : "Could not search right now.",
            })
          );
          return;
        }
        let list = dedupeTaskAssistEntitySearchCandidates(Array.isArray(j.candidates) ? j.candidates : []);
        if (list.length === 0) {
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "error",
              text: formatTaskAssistEntitySearchNoMatchMessage(qEff),
            })
          );
          return;
        }
        const fuzzyOnly =
          list.length === 1 && list[0]!.matched_fields.some((f) => f === "fuzzy_match");
        if (fuzzyOnly) {
          const c = list[0]!;
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "fuzzy_entity_suggestion",
              candidate: c,
              queryToken: primaryTaskAssistEntitySearchToken(qEff),
              intent,
            })
          );
          return;
        }
        const intro = taskAssistCandidateListPrompt(list.length);
        setThread((prev) => {
          let next = appendThreadTurn(prev, { kind: "assistant_notice", text: intro });
          next = appendThreadTurn(next, { kind: "candidate_results", candidates: list, intent });
          return next;
        });
      } catch {
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "error",
            text: "Search failed. Try again.",
          })
        );
      }
    },
    [globalAssistant, proceedToTaskAssistAction, selectedSiteId, setThread, taskAssistUiEnabled]
  );

  const runJobLayoutRoute = useCallback(async (submitted: string) => {
    const cardTurnId = newThreadTurnId();
    try {
      const cfg = await loadCurrentJobOverviewConfig();
      const prev = runOverviewLayoutSemanticPreview(submitted, cfg);
      if (!prev.ok) {
        setThread((t) =>
          appendThreadTurn(t, {
            kind: "error",
            text: prev.error ?? "Could not build a preview.",
          })
        );
        return;
      }
      const planner = prev.planner;
      const { headline, subline, kind } = headlineForPreview(planner);
      const structuredJson = safeJson(prev.structured_override);
      setThread((t) =>
        appendThreadTurn(t, {
          id: cardTurnId,
          kind: "action_card",
          card: {
            type: "job_layout",
            submittedCommand: submitted,
            headline,
            subline,
            confidence: statusFromPlanner(planner),
            responseKind: kind,
            plannerOk: planner,
            structuredOverrideJson: structuredJson,
            expanded: kind === "action_preview",
          },
        })
      );
      setJobCardUi((u) => ({
        ...u,
        [cardTurnId]: { advancedOpen: false, detailsOpen: false, applyAnyway: false, applying: false },
      }));
    } catch (e) {
      setThread((t) =>
        appendThreadTurn(t, {
          kind: "error",
          text: e instanceof Error ? e.message : "Preview failed.",
        })
      );
    }
  }, []);

  const runWorkflowAssistRoute = useCallback(
    async (submitted: string, intent: WorkflowAssistReadIntentV1) => {
      const ambientEntity =
        globalAssistant?.currentContext?.entity_type === "opportunities" && globalAssistant.currentContext.entity_id ?
          {
            entity_type: "opportunities" as const,
            entity_id: globalAssistant.currentContext.entity_id,
          }
          : null;

      const isExplain = intent.sub_intent === "explain_v0" || intent.sub_intent === "explain_v1";
      const needsSummary = !isExplain;
      const needsRuns = intent.sub_intent === "failed_runs_last_7d";

      const appendRead = (args: {
        payload: WorkflowAssistReadCardPayloadV1 | null;
        error: WorkflowAssistErrorEnvelopeV1 | null;
      }) => {
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "workflow_assist_read",
            submittedCommand: submitted,
            intent,
            payload: args.payload,
            error: args.error,
          })
        );
      };

      try {
        if (isExplain) {
          if (!ambientEntity) {
            const nameQ = extractExplainEntitySearchQuery(submitted);
            if (nameQ) {
              try {
                const res = await fetchTaskAssistEntitySearch({
                  q: nameQ,
                  entity_type: "all",
                  workspace_site_id: selectedSiteId,
                });
                const j = await readJson<{
                  ok?: boolean;
                  candidates?: TaskAssistEntitySearchCandidate[];
                }>(res);
                if (res.ok && j.ok !== false) {
                  const list = dedupeTaskAssistEntitySearchCandidates(
                    Array.isArray(j.candidates) ? j.candidates : []
                  );
                  const picked = pickExplainEntityCandidate(list);
                  if (picked.kind === "single") {
                    await runWorkflowAssistExplainForEntity(submitted, intent, picked.candidate);
                    return;
                  }
                  if (picked.kind === "multiple") {
                    setThread((prev) => {
                      let next = appendThreadTurn(prev, {
                        kind: "assistant_notice",
                        text: `I found several records matching “${nameQ}”. Which opportunity should I explain workflows for?`,
                      });
                      next = appendThreadTurn(next, {
                        kind: "candidate_results",
                        candidates: list.filter((c) => c.entity_type === "opportunities").slice(0, 8),
                        intent: null,
                        workflowExplain: { submittedCommand: submitted, intent },
                      });
                      return next;
                    });
                    return;
                  }
                }
              } catch {
                /* fall through to insufficient-context trace */
              }
            }
            const trace = buildWorkflowOperationalTraceV1({
              entity_type: "",
              entity_id: "",
              normalized_entity_type: "",
              range: "30d",
              workflow_id_filter: null,
              event_type_filter: null,
              events: [],
              workflows: [],
              runs: [],
              conditions_by_workflow: {},
              actions_by_run: {},
            });
            const explanation = buildWorkflowAssistExplainFromTraceV1(
              { version: 1, entity_type: "", entity_id: "", range: "30d" },
              trace
            );
            appendRead({
              payload: buildWorkflowAssistExplainCardPayload(explanation, trace),
              error: null,
            });
            return;
          }
          const qs = new URLSearchParams({
            entity_type: ambientEntity.entity_type,
            entity_id: ambientEntity.entity_id,
            range: "30d",
          });
          const exRes = await fetch(`/api/admin/ai/workflow-assist/explain?${qs.toString()}`, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          const exJson = (await exRes.json().catch(() => ({}))) as {
            ok?: boolean;
            explain_engine?: number;
            explanation?: WorkflowAssistExplainResponseV1;
            trace?: WorkflowOperationalTraceV1;
            message?: string;
            error?: string;
          };
          if (!exRes.ok || !exJson.ok || !exJson.explanation) {
            const msg = exJson.message ?? exJson.error ?? `HTTP ${exRes.status}`;
            appendRead({
              payload: null,
              error: workflowAssistErrorEnvelope(
                exRes.status === 403 ? "forbidden" : "fetch_failed",
                msg,
                exRes.status
              ),
            });
            return;
          }
          appendRead({
            payload: buildWorkflowAssistExplainCardPayload(exJson.explanation, exJson.trace),
            error: null,
          });
          return;
        }

        let summaryJson: unknown = { workflows: [] };

        if (needsSummary) {
          const sRes = await fetchWorkflowsNavSummary();
          summaryJson = await sRes.json().catch(() => ({}));
          if (!sRes.ok) {
            const msg =
              typeof (summaryJson as { error?: string }).error === "string" ?
                (summaryJson as { error: string }).error
                : `HTTP ${sRes.status}`;
            appendRead({
              payload: null,
              error: workflowAssistErrorEnvelope(
                sRes.status === 403 ? "forbidden" : "fetch_failed",
                msg,
                sRes.status
              ),
            });
            return;
          }
        }

        let runs7dJson: unknown | null = null;
        let kpisJson: unknown | null = null;
        if (needsRuns) {
          const [runsRes, kpisRes] = await Promise.all([
            fetchWorkflowsNavRuns7d(),
            fetchWorkflowsNavKpis(),
          ]);
          runs7dJson = await runsRes.json().catch(() => ({}));
          kpisJson = await kpisRes.json().catch(() => ({}));
          if (!runsRes.ok) {
            const msg =
              typeof (runs7dJson as { error?: string }).error === "string" ?
                (runs7dJson as { error: string }).error
                : `HTTP ${runsRes.status}`;
            appendRead({
              payload: null,
              error: workflowAssistErrorEnvelope(
                runsRes.status === 403 ? "forbidden" : "fetch_failed",
                msg,
                runsRes.status
              ),
            });
            return;
          }
        }

        const built = buildWorkflowAssistReadCardPayload(intent, summaryJson, runs7dJson, kpisJson, ambientEntity);
        if (!built.ok) {
          appendRead({ payload: null, error: built.error });
          return;
        }
        appendRead({ payload: built.payload, error: null });
      } catch (e) {
        appendRead({
          payload: null,
          error: workflowAssistErrorEnvelope(
            "fetch_failed",
            e instanceof Error ? e.message : "Workflow Assist request failed."
          ),
        });
      }
    },
    [globalAssistant, runWorkflowAssistExplainForEntity, selectedSiteId, setThread]
  );

  const runConfigLayoutAssistProposePersisted = useCallback(
    async (cmd: string) => {
      const res = await fetch("/api/admin/ai/config-layout-assist/propose", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ command: cmd, persist: true }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        proposal?: ConfigurationProposalV1;
        trace?: ConfigLayoutAssistTraceV1;
        persisted_proposal_id?: string | null;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j.ok || !j.proposal || !j.trace) {
        throw new Error(j.message ?? j.error ?? `HTTP ${res.status}`);
      }
      setThread((prev) =>
        appendActionCardTurnWithBosMetadata(prev, {
          type: "config_layout_assist_proposal",
          proposal: j.proposal as ConfigurationProposalV1,
          trace: j.trace as ConfigLayoutAssistTraceV1,
          persistedProposalId: j.persisted_proposal_id ?? null,
        })
      );
    },
    [setThread]
  );

  const runConfigLayoutAssistFieldSetup = useCallback(
    async (cmd: string) => {
      const res = await fetch("/api/admin/ai/config-layout-assist/field-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        draft?: ConfigLayoutAssistFieldSetupDraftV1;
        section_options?: ConfigLayoutAssistSectionOptionV1[];
        intro_message?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j.ok || !j.draft || !j.section_options) {
        throw new Error(j.message ?? j.error ?? `HTTP ${res.status}`);
      }
      const draft = j.draft;
      const sectionOptions = j.section_options;
      const introMessage = j.intro_message?.trim() ?? "";
      setThread((prev) => {
        let next = prev;
        if (introMessage) {
          next = appendThreadTurn(next, { kind: "assistant_notice", text: introMessage });
        }
        return appendThreadTurn(next, {
          kind: "action_card",
          card: {
            type: "config_layout_assist_field_setup",
            introMessage,
            draft,
            sectionOptions,
          },
        });
      });
    },
    [setThread]
  );

  const runConfigLayoutAssistRoute = useCallback(
    async (cmd: string) => {
      try {
        const intent = parseConfigLayoutAssistIntent(cmd);
        if (intent.kind === "create_field" && intent.field_label?.trim()) {
          await runConfigLayoutAssistFieldSetup(cmd);
          return;
        }
        await runConfigLayoutAssistProposePersisted(cmd);
      } catch (e) {
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "error",
            text:
              e instanceof Error
                ? e.message
                : "Configuration Assist request failed.",
          })
        );
      }
    },
    [runConfigLayoutAssistFieldSetup, runConfigLayoutAssistProposePersisted, setThread]
  );

  const confirmConfigLayoutFieldSetup = useCallback(
    async (cmd: string, payload: ConfigLayoutAssistFieldSetupConfirmPayload) => {
      setBusy(true);
      try {
        const res = await fetch("/api/admin/ai/config-layout-assist/field-setup/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            command: cmd,
            field_type: payload.field_type,
            required: payload.required,
            section_key: payload.section_key,
            section_is_new: payload.section_key === CONFIG_ASSIST_NEW_SECTION_VALUE,
            new_section_label: payload.new_section_label,
          }),
        });
        const j = (await res.json()) as {
          ok?: boolean;
          proposal?: ConfigurationProposalV1;
          trace?: ConfigLayoutAssistTraceV1;
          persisted_proposal_id?: string | null;
          ready_summary?: ConfigLayoutAssistReadySummaryV1;
          message?: string;
          error?: string;
        };
        if (!res.ok || !j.ok || !j.proposal || !j.trace || !j.persisted_proposal_id || !j.ready_summary) {
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "error",
              text: j.message ?? j.error ?? "Could not save field setup.",
            })
          );
          return;
        }
        const proposal = j.proposal;
        const trace = j.trace;
        const persistedProposalId = j.persisted_proposal_id;
        const readySummary = j.ready_summary;
        setThread((prev) =>
          appendActionCardTurnWithBosMetadata(prev, {
            type: "config_layout_assist_ready",
            proposal,
            trace,
            persistedProposalId,
            readySummary,
          })
        );
      } catch (e) {
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "error",
            text: e instanceof Error ? e.message : "Field setup confirmation failed.",
          })
        );
      } finally {
        setBusy(false);
      }
    },
    [setThread]
  );

  const approveAndApplyConfigProposal = useCallback(
    async (proposalId: string) => {
      const readyTurn = thread.turns.find(
        (t) =>
          t.kind === "action_card" &&
          t.card.type === "config_layout_assist_ready" &&
          t.card.persistedProposalId === proposalId
      );
      const proposal =
        readyTurn?.kind === "action_card" && readyTurn.card.type === "config_layout_assist_ready" ?
          readyTurn.card.proposal
        : null;

      setBusy(true);
      try {
        const transition = async (to_state: string) => {
          const res = await fetch(
            `/api/admin/config-layout-assist/proposals/${encodeURIComponent(proposalId)}/state`,
            {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to_state }),
            }
          );
          const j = (await res.json()) as { ok?: boolean; message?: string };
          if (!res.ok || !j.ok) {
            throw new Error(j.message ?? `Could not move proposal to ${to_state}`);
          }
        };
        await transition("reviewed");
        await transition("approved");
        const applyRes = await fetch(
          `/api/admin/config-layout-assist/proposals/${encodeURIComponent(proposalId)}/apply`,
          { method: "POST", credentials: "include", headers: { Accept: "application/json" } }
        );
        const applyJ = (await applyRes.json()) as ConfigAssistApplyApiPayload;
        if (proposal) {
          const outcome = buildConfigAssistApplyOutcomeFromApi(proposal, applyJ);
          const receipt = configApplyOutcomeToExecutionReceipt(outcome);
          setThread((prev) => appendThreadTurn(prev, { kind: "execution_receipt", receipt }));
          if (!applyRes.ok || !applyJ.ok) {
            return;
          }
        } else if (!applyRes.ok || !applyJ.ok) {
          throw new Error(applyJ.message ?? applyJ.error ?? "Apply failed");
        } else {
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "execution_receipt",
              receipt: configApplyOutcomeToExecutionReceipt({
                headline: "Applied",
                summary: "Configuration apply completed.",
                rows: [],
                partialFailure: false,
                showLayoutIntegrityLink: false,
              }),
            })
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Approve and apply failed.";
        if (proposal) {
          const outcome = buildConfigAssistApplyOutcomeFromApi(proposal, {
            ok: false,
            message: msg,
          });
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "execution_receipt",
              receipt: configApplyOutcomeToExecutionReceipt(outcome),
            })
          );
        } else {
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "error",
              text: msg,
            })
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [setThread, thread.turns]
  );

  const proposeWorkflowAssistBody = useCallback(
    async (
      body: WorkflowAssistProposeRequestV1,
      createInterpreted?: WorkflowAssistCreateProposeBuildV1["interpreted"],
      scopeLabels?: WorkflowAssistCreateProposeBuildV1["scope_labels"],
      enrich?: {
        source_command?: string;
        template_id?: WorkflowAssistCreateIntentV1["template_id"];
        lead_days_before_tour?: number | null;
      }
    ) => {
      const res = await fetch("/api/admin/ai/workflow-assist/propose", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          ...body,
          ...(scopeLabels ? { scope_labels: scopeLabels } : {}),
          ...(enrich?.source_command ? { source_command: enrich.source_command } : {}),
          ...(enrich?.template_id ? { template_id: enrich.template_id } : {}),
          ...(enrich?.lead_days_before_tour != null ?
            { lead_days_before_tour: enrich.lead_days_before_tour }
            : {}),
          ...(createInterpreted ?
            {
              interpreted: {
                trigger_label: createInterpreted.trigger_label,
                actions_label: createInterpreted.actions_label,
                unknowns: createInterpreted.unknowns,
              },
            }
            : {}),
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        suggestion?: WorkflowAssistSuggestionV1;
        error?: string;
        message?: string;
      };
      const suggestion = j.suggestion;
      if (!res.ok || !j.ok || !suggestion) {
        const msg = j.message ?? j.error ?? `HTTP ${res.status}`;
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "error",
            text: `Workflow Assist could not build a proposal: ${msg}`,
          })
        );
        return;
      }
      setThread((prev) =>
        appendActionCardTurnWithBosMetadata(prev, {
          type: "workflow_assist_proposal",
          suggestion,
          createInterpreted,
        })
      );
    },
    [setThread]
  );

  const runWorkflowAssistCreateRoute = useCallback(
    async (submitted: string, createIntent: WorkflowAssistCreateIntentV1) => {
      const ws = globalAssistant?.workspaceScope;
      const built = buildWorkflowAssistCreateProposeFromIntent(createIntent, submitted, {
        scope:
          ws ?
            {
              department_id: ws.department_id,
              ...(ws.work_unit_id ? { work_unit_id: ws.work_unit_id } : {}),
            }
            : null,
        scope_labels: {
          department_name: ws?.department_name ?? null,
          work_unit_name: ws?.work_unit_name ?? null,
        },
      });
      await proposeWorkflowAssistBody(built.request, built.interpreted, built.scope_labels, {
        source_command: submitted,
        template_id: createIntent.template_id,
        lead_days_before_tour: parseDaysBeforeTour(submitted),
      });
    },
    [globalAssistant?.workspaceScope, proposeWorkflowAssistBody]
  );

  const workflowAssistMutation = useMemo<WorkflowAssistThreadMutationHandlersV1>(
    () => ({
      onProposePause: (workflowId) => proposeWorkflowAssistBody(buildWorkflowAssistPauseProposeBody(workflowId)),
      onProposeRename: async (workflowId, currentName) => {
        const proposed = workflowAssistRenameFallbackName(currentName);
        await proposeWorkflowAssistBody(
          buildWorkflowAssistEditRenameProposeBody({ workflow_id: workflowId, proposed_name: proposed })
        );
      },
      onProposeDescription: async (workflowId) => {
        await proposeWorkflowAssistBody(
          buildWorkflowAssistEditDescriptionProposeBody({
            workflow_id: workflowId,
            proposed_description: WORKFLOW_ASSIST_DESCRIPTION_NOTE_DEFAULT,
          })
        );
      },
      onProposeCreateTemplate: () => proposeWorkflowAssistBody(WORKFLOW_ASSIST_CREATE_PROPOSE_BODY),
    }),
    [proposeWorkflowAssistBody]
  );

  useEffect(() => {
    let cancelled = false;
    const cancelDefer = runWhenAdminV2PrimarySurfaceReady(
      async () => {
        try {
          const res = await fetchAdminV2Sidecar("workflow_assist_capabilities");
          const j = (await res.json()) as { ok?: boolean; can_propose_and_apply_workflow_assist?: boolean };
          if (cancelled) return;
          if (res.ok && j.ok === true && typeof j.can_propose_and_apply_workflow_assist === "boolean") {
            setWorkflowAssistMutationCapable(j.can_propose_and_apply_workflow_assist);
          } else {
            setWorkflowAssistMutationCapable(false);
          }
        } catch {
          if (!cancelled) setWorkflowAssistMutationCapable(false);
        }
      },
      "workflow_assist_capabilities"
    );
    return () => {
      cancelled = true;
      cancelDefer();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cancelDefer = runWhenAdminV2PrimarySurfaceReady(
      async () => {
        try {
          const res = await fetchAdminV2Sidecar("config_layout_assist_capabilities");
          const j = (await res.json()) as { ok?: boolean };
          if (!cancelled && j.ok) setConfigLayoutAssistCaps(j as ConfigLayoutAssistCapabilitiesV1);
        } catch {
          /* non-fatal */
        }
      },
      "config_layout_assist_capabilities"
    );
    return () => {
      cancelled = true;
      cancelDefer();
    };
  }, []);

  const runSubmittedCommandRef = useRef<(cmd: string) => Promise<void>>(async () => { });
  const runBosAssistHandoffRef = useRef<
    (
      cmd: string,
      intent: TaskAssistCommandIntent,
      bootstrap?: TaskAssistCommandBootstrap | null,
      handoffEntity?: { entity_id: string; label: string } | null
    ) => Promise<void>
  >(async () => { });

  const runSubmittedCommand = useCallback(
    async (rawCmd: string) => {
      const cmd = rawCmd.trim();
      if (!cmd || busy) return;

      setThread((prev) => appendThreadTurn(prev, { kind: "user_message", text: cmd }));
      setThreadExpanded(true);

      const pending = pendingClarificationRef.current;
      if (pending) {
        const merged = mergeClarificationIntoIntent(pending.intent, {
          goalText:
            pending.awaiting === "message_goal" || pending.awaiting === "reminder_what" ? cmd : undefined,
          timingText: pending.awaiting === "reminder_when" ? cmd : undefined,
        });
        if (pending.awaiting === "message_goal" && needsMessageGoalClarification(merged)) {
          return;
        }
        if (pending.awaiting === "reminder_what") {
          const nextKind = reminderClarificationKind(merged);
          if (nextKind) {
            pendingClarificationRef.current = { candidate: pending.candidate, intent: merged, awaiting: nextKind };
            setThread((prev) =>
              appendThreadTurn(prev, {
                kind: "task_clarification",
                clarificationKind: nextKind,
                candidate: pending.candidate,
                intent: merged,
              })
            );
            return;
          }
        }
        pendingClarificationRef.current = null;
        proceedToTaskAssistAction(pending.candidate, merged);
        return;
      }

      setBusy(true);

      const routed = routeCommandSurface(cmd, {
        hasAmbientOpportunity:
          globalAssistant?.currentContext?.entity_type === "opportunities" &&
          Boolean(globalAssistant.currentContext.entity_id),
      });

      try {
        setThread((prev) => appendCommandSurfaceRoutingNoticeTurn(prev, routed, globalAssistant?.currentContext?.label));

        switch (routed.route) {
          case "workflow_assist": {
            if (routed.workflowAssistCreateIntent) {
              await runWorkflowAssistCreateRoute(cmd, routed.workflowAssistCreateIntent);
              break;
            }
            const intent = routed.workflowAssistReadIntent;
            if (!intent) {
              setThread((prev) => appendThreadTurn(prev, { kind: "workflow_notice" }));
              break;
            }
            await runWorkflowAssistRoute(cmd, intent);
            break;
          }
          case "clarify":
            setThread((prev) =>
              appendThreadTurn(prev, {
                kind: "assistant_notice",
                text: routed.clarifyMessage ?? "Could you say more about what you'd like to do?",
              })
            );
            break;
          case "config_layout_assist":
            await runConfigLayoutAssistRoute(cmd);
            break;
          case "job_layout":
            await runJobLayoutRoute(cmd);
            break;
          case "task_assist":
            await runTaskAssistRoute(cmd, routed.taskAssistIntent, routed.slots);
            break;
        }
      } finally {
        setBusy(false);
        queueMicrotask(() => inputRef.current?.focus());
      }
    },
    [
      busy,
      globalAssistant,
      runConfigLayoutAssistRoute,
      runJobLayoutRoute,
      proceedToTaskAssistAction,
      runTaskAssistRoute,
      runWorkflowAssistCreateRoute,
      runWorkflowAssistRoute,
      setThread,
    ]
  );

  const runBosAssistHandoff = useCallback(
    async (
      rawCmd: string,
      handoffIntent: TaskAssistCommandIntent,
      handoffBootstrap?: TaskAssistCommandBootstrap | null,
      handoffEntity?: { entity_id: string; label: string } | null
    ) => {
      const cmd = rawCmd.trim();
      if (!cmd || busy || !globalAssistant || !taskAssistUiEnabled) return;

      setThread((prev) => appendThreadTurn(prev, { kind: "user_message", text: cmd }));
      setThreadExpanded(true);
      setBusy(true);

      try {
        const activeOpp =
            activeOpportunityFromContext(globalAssistant.currentContext) ??
            (handoffEntity?.entity_id?.trim()
                ? {
                      entity_id: handoffEntity.entity_id.trim(),
                      label: handoffEntity.label?.trim() || "Current opportunity",
                  }
                : null);
        if (!activeOpp?.entity_id) {
          await runSubmittedCommand(cmd);
          return;
        }
        const chip = buildActiveOpportunitySearchCandidate(activeOpp);
        proceedToTaskAssistAction(chip, handoffIntent, handoffBootstrap ?? null, {
          communicationHandoff: Boolean(handoffBootstrap?.synthesized_draft),
        });
      } finally {
        setBusy(false);
        queueMicrotask(() => inputRef.current?.focus());
      }
    },
    [busy, globalAssistant, proceedToTaskAssistAction, runSubmittedCommand, setThread, taskAssistUiEnabled]
  );

  useEffect(() => {
    runSubmittedCommandRef.current = runSubmittedCommand;
  }, [runSubmittedCommand]);

  useEffect(() => {
    runBosAssistHandoffRef.current = runBosAssistHandoff;
  }, [runBosAssistHandoff]);

  const handleSubmit = useCallback(async () => {
    const cmd = commandText.trim();
    if (!cmd || busy) return;
    setCommandText("");
    await runSubmittedCommand(cmd);
  }, [busy, commandText, runSubmittedCommand]);

  useEffect(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 48;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [threadExpanded]);

  useEffect(() => {
    const el = threadScrollRef.current;
    if (!el || !threadExpanded) return;
    const last = thread.turns[thread.turns.length - 1];
    if (!shouldForceCommandSurfaceScrollToBottom(last, userScrolledUpRef.current)) return;
    const scrollToBottom = () => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom);
    });
  }, [thread.turns, threadExpanded, busy]);

  const applyJobLayoutCard = useCallback(
    async (turnId: string) => {
      const turn = thread.turns.find((t) => t.id === turnId && t.kind === "action_card" && t.card.type === "job_layout");
      if (!turn || turn.kind !== "action_card" || turn.card.type !== "job_layout") return;
      const card = turn.card;
      const ui = jobCardUi[turnId] ?? { advancedOpen: false, detailsOpen: false, applyAnyway: false, applying: false };
      const applyBlockedByNoop = shouldBlockSemanticNoopApply({
        previewRoute: "v1",
        semanticPlanner: card.plannerOk,
        applySemanticNoopAnyway: ui.applyAnyway,
      });
      const canApply =
        Boolean(card.structuredOverrideJson) &&
        !applyBlockedByNoop &&
        (card.responseKind === "action_preview" || card.responseKind === "no_op" || card.responseKind === "unresolved_only");
      if (!canApply) return;

      setJobCardUi((u) => ({ ...u, [turnId]: { ...ui, applying: true } }));
      setBusy(true);
      try {
        const ids = newIds();
        const structured_override = JSON.parse(card.structuredOverrideJson) as unknown;
        const res = await fetch("/api/admin/agent/v1/record-overview-layout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: ids.request_id,
            correlation_id: ids.correlation_id,
            message: card.submittedCommand.trim() || "AdminV2 AI command surface",
            structured_override,
          }),
        });
        const data = (await res.json()) as unknown;
        if (!res.ok) {
          setThread((prev) =>
            appendThreadTurn(prev, {
              kind: "execution_receipt",
              receipt: buildJobLayoutFailedReceipt(`Apply failed (HTTP ${res.status}).`),
            })
          );
          return;
        }
        dispatchAiActivityRefresh();
        setThread((prev) =>
          updateThreadTurn(prev, turnId, {
            kind: "action_card",
            card: {
              ...card,
              headline: "Applied",
              subline: "Job overview layout saved.",
              confidence: "applied",
              responseKind: "applied_success",
            },
          } as Partial<typeof turn>)
        );
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "execution_receipt",
            receipt: buildJobLayoutAppliedReceipt(),
          })
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Apply failed.";
        setThread((prev) =>
          appendThreadTurn(prev, {
            kind: "execution_receipt",
            receipt: buildJobLayoutFailedReceipt(msg),
          })
        );
      } finally {
        setJobCardUi((u) => ({ ...u, [turnId]: { ...ui, applying: false } }));
        setBusy(false);
      }
    },
    [jobCardUi, thread.turns]
  );

  const renderJobLayoutCardActions = useCallback(
    (turnId: string) => {
      const turn = thread.turns.find((t) => t.id === turnId && t.kind === "action_card" && t.card.type === "job_layout");
      if (!turn || turn.kind !== "action_card" || turn.card.type !== "job_layout") return null;
      const card = turn.card;
      const ui: JobLayoutCardUiState = jobCardUi[turnId] ?? {
        advancedOpen: false,
        detailsOpen: false,
        applyAnyway: false,
        applying: false,
      };
      const applyBlockedByNoop = shouldBlockSemanticNoopApply({
        previewRoute: "v1",
        semanticPlanner: card.plannerOk,
        applySemanticNoopAnyway: ui.applyAnyway,
      });
      const canApply =
        Boolean(card.structuredOverrideJson) &&
        !applyBlockedByNoop &&
        (card.responseKind === "action_preview" || card.responseKind === "no_op" || card.responseKind === "unresolved_only");

      return (
        <JobLayoutOperationalProposalCard
          submittedCommand={card.submittedCommand}
          headline={card.headline}
          subline={card.subline}
          responseKind={card.responseKind}
          plannerOk={card.plannerOk}
          structuredOverrideJson={card.structuredOverrideJson}
          expanded
          panelMaxHeight={`${panelMaxHeight}px`}
          ui={ui}
          canApply={canApply}
          applyBlockedByNoop={applyBlockedByNoop}
          onToggleExpand={() => setThread((prev) => toggleActionCardExpanded(prev, turnId))}
          onApply={() => void applyJobLayoutCard(turnId)}
          onDismiss={() => setThread((prev) => toggleActionCardExpanded(prev, turnId))}
          onRefine={() => inputRef.current?.focus()}
          onToggleApplyAnyway={(v) => setJobCardUi((u) => ({ ...u, [turnId]: { ...ui, applyAnyway: v } }))}
          onToggleDetails={() => setJobCardUi((u) => ({ ...u, [turnId]: { ...ui, detailsOpen: !ui.detailsOpen } }))}
          onToggleAdvanced={() => setJobCardUi((u) => ({ ...u, [turnId]: { ...ui, advancedOpen: !ui.advancedOpen } }))}
        />
      );
    },
    [applyJobLayoutCard, jobCardUi, panelMaxHeight, thread.turns]
  );

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onFocusBar = (ev: Event) => {
      const detail = (ev as CustomEvent<AdminV2FocusCommandBarDetail>).detail ?? {};
      shellRootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (detail.preferMode && globalAssistant) {
        globalAssistant.setCommandSurfaceMode(detail.preferMode);
      }
      if (detail.expandThread) {
        setThreadExpanded(true);
      }
      const seed = detail.seedCommand?.trim() ?? "";
      if (detail.autoSubmitSeedCommand && seed) {
        setCommandText("");
        const handoffIntent = detail.taskAssistHandoffIntent ?? null;
        if (handoffIntent) {
          void runBosAssistHandoffRef.current(
            seed,
            handoffIntent,
            detail.taskAssistHandoffBootstrap ?? null,
            detail.handoffEntity ?? null
          );
        } else {
          void runSubmittedCommandRef.current(seed);
        }
      } else if (seed) {
        setCommandText(seed);
      }
      inputRef.current?.focus();
    };
    window.addEventListener(ADMIN_V2_FOCUS_COMMAND_BAR, onFocusBar as EventListener);
    return () => window.removeEventListener(ADMIN_V2_FOCUS_COMMAND_BAR, onFocusBar as EventListener);
  }, [globalAssistant, setThreadExpanded]);

  const hasThread = thread.turns.length > 0;
  const threadPreview = useMemo(() => lastThreadPreviewText(thread.turns), [thread.turns]);
  const surfaceExpanded = hasThread;
  const workflowAssistCapabilitiesPending = workflowAssistMutationCapable === null;
  const workflowAssistMutationsAllowed = workflowAssistMutationCapable === true;
  const workflowAssistMutationBlockedReasonShell =
    workflowAssistMutationCapable === false ? WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE : null;
  const configAssistCapabilitiesPending = configLayoutAssistCaps === null;
  const configAssistCanApproveAndApply =
    configLayoutAssistCaps === null ?
      false
    : Boolean(configLayoutAssistCaps.can_review && configLayoutAssistCaps.can_apply);

  const threadStatusLabel = useMemo(
    () => resolveCommandSurfaceThreadStatusLabel({ busy, turns: thread.turns }),
    [busy, thread.turns]
  );

  const debugReviewNavigation = useCallback<ConfigProposalReviewDebugLog>((message, detail) => {
    if (process.env.NODE_ENV === "development") {
      console.info("[config-assist-review]", message, detail ?? "");
    }
  }, []);

  const onReviewConfigProposal = useCallback(
    (proposalId: string) => {
      debugReviewNavigation("shell handler received id", { proposalId });
      const href = configProposalReviewHrefForId(proposalId);
      debugReviewNavigation("adminV2CommitNavigation", { href });
      adminV2CommitNavigation(href, { closeDrawer: adminDrawer?.closeDrawer });
    },
    [adminDrawer?.closeDrawer, debugReviewNavigation]
  );

  const onWorkflowAssistProposeEdit = useCallback(
    (workflowId: string) => {
      void proposeWorkflowAssistBody(
        buildWorkflowAssistEditDescriptionProposeBody({
          workflow_id: workflowId,
          proposed_description:
            "Assist: review reminder timing, audience, and message copy before enabling.",
        })
      );
    },
    [proposeWorkflowAssistBody]
  );

  const threadScrollMaxClass =
    presentation === "rail" ? "max-h-[min(28vh,200px)]" : "max-h-[min(52vh,440px)]";
  const threadPanelMinHeightCollapsedPx =
    presentation === "rail"
      ? COMMAND_SURFACE_RAIL_THREAD_PANEL_MIN_HEIGHT_COLLAPSED_PX
      : COMMAND_SURFACE_THREAD_PANEL_MIN_HEIGHT_COLLAPSED_PX;
  const threadScrollMinHeightPx =
    presentation === "rail"
      ? COMMAND_SURFACE_RAIL_THREAD_SCROLL_MIN_HEIGHT_PX
      : COMMAND_SURFACE_THREAD_SCROLL_MIN_HEIGHT_PX;

  const pickStarterSuggestion = useCallback((text: string) => {
    setCommandText(text);
    inputRef.current?.focus();
  }, []);

  const bosContextDisplayLine = useMemo(
    () =>
      resolveBosCommandSurfaceContextLabel({
        currentContext: globalAssistant?.currentContext ?? null,
        workspaceScope: globalAssistant?.workspaceScope ?? null,
        surfaceOperationalLabel: globalAssistant?.surfaceOperationalLabel ?? null,
        opportunitySingular,
      }),
    [
      globalAssistant?.currentContext,
      globalAssistant?.workspaceScope,
      globalAssistant?.surfaceOperationalLabel,
      opportunitySingular,
    ]
  );

  const bosRailStarterSuggestions = useMemo(
    () =>
      resolveCommandSurfaceRailStarterSuggestions({
        hasWorkUnitScope: Boolean(globalAssistant?.workspaceScope?.work_unit_id?.trim()),
        hasOpportunityContext: globalAssistant?.currentContext?.entity_type === "opportunities",
        opportunitySingular,
      }),
    [globalAssistant?.workspaceScope?.work_unit_id, globalAssistant?.currentContext, opportunitySingular]
  );

  const bosRailAttention = useMemo(
    () =>
      adminDrawer ?
        resolveBosRailAttentionPresentation({
          drawer: adminDrawer.drawerVmRender,
          currentContext: globalAssistant?.currentContext ?? null,
        })
      :   null,
    [adminDrawer, globalAssistant?.currentContext]
  );

  const onBosRailAttentionCta = useCallback(() => {
    const prompt = bosRailAttention?.ctaPrompt ?? "What needs attention?";
    pickStarterSuggestion(prompt);
  }, [bosRailAttention?.ctaPrompt, pickStarterSuggestion]);

  return (
    <SurfaceCard expanded={surfaceExpanded} presentation={presentation} rootRef={shellRootRef}>
      {presentation === "rail" ?
        <>
          <BosRailHeader contextDisplayLine={bosContextDisplayLine} statusLabel={threadStatusLabel} />
          <div className="bos-rail-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <BosRailAttentionSection attention={bosRailAttention} onCta={onBosRailAttentionCta} />
            {hasThread ? null : (
              <BosRailStarterCards suggestions={bosRailStarterSuggestions} onPick={pickStarterSuggestion} />
            )}
            {hasThread ?
              <div
                className="mx-3 mb-2 overflow-hidden rounded-lg border"
                style={{ borderColor: derived.border, backgroundColor: neutral.surface }}
                data-command-surface-thread-panel="true"
              >
                {threadExpanded ?
                  <div
                    ref={threadScrollRef}
                    className={`${threadScrollMaxClass} overflow-y-auto`}
                    style={{ minHeight: `${threadScrollMinHeightPx}px` }}
                  >
                    {shouldShowInlineThreadBusyIndicator({ busy, turns: thread.turns }) ?
                      <div
                        className="px-3 py-2 text-[11px]"
                        style={{ color: CMD.textSupporting }}
                        data-command-surface-inline-busy="true"
                        aria-hidden
                      >
                        {threadStatusLabel ?? "Processing…"}
                      </div>
                    :   null}
                    <CommandSurfaceThread
                      turns={thread.turns}
                      busy={busy}
                      activeOperationalEntityId={activeOperationalEntityId}
                      onPickCandidate={(turnId, candidate, intent) => confirmTaskAssistTarget(turnId, candidate, intent)}
                      onConfirmCandidate={confirmTaskAssistTarget}
                      onConfirmFuzzySuggestion={(_turnId, candidate, intent) => confirmTaskAssistTarget("", candidate, intent)}
                      onClarificationChip={onClarificationChip}
                      onToggleActionCard={(turnId) => setThread((prev) => toggleActionCardExpanded(prev, turnId))}
                      onToggleTaskAssistMoreOptions={onToggleTaskAssistMoreOptions}
                      renderJobLayoutCardActions={renderJobLayoutCardActions}
                      workflowAssistMutation={workflowAssistMutationsAllowed ? workflowAssistMutation : undefined}
                      workflowAssistMutationBlockedReason={workflowAssistMutationBlockedReasonShell}
                      workflowAssistMutationsAllowed={workflowAssistMutationsAllowed}
                      workflowAssistCapabilitiesPending={workflowAssistCapabilitiesPending}
                      onReviewConfigProposal={onReviewConfigProposal}
                      onWorkflowAssistProposeEdit={onWorkflowAssistProposeEdit}
                      debugReviewNavigation={debugReviewNavigation}
                      onConfirmConfigFieldSetup={(command, payload) =>
                        void confirmConfigLayoutFieldSetup(command, payload)
                      }
                      onApproveConfigProposal={(proposalId) => void approveAndApplyConfigProposal(proposalId)}
                      configAssistCanApproveAndApply={configAssistCanApproveAndApply}
                      configAssistCapabilitiesPending={configAssistCapabilitiesPending}
                      onExecutionReceipt={appendExecutionReceipt}
                    />
                  </div>
                :   null}
              </div>
            :   null}
          </div>
          <BosRailConversationPreview
            preview={threadPreview}
            hasThread={hasThread}
            onExpandThread={() => setThreadExpanded(true)}
          />
          <BosRailComposer
            value={commandText}
            busy={busy}
            onChange={setCommandText}
            onSubmit={() => void handleSubmit()}
            inputRef={inputRef}
          />
        </>
      :   null}
      {presentation !== "rail" && hasThread ? (
        <div
          className="rounded-t-xl border border-b-0 overflow-hidden"
          style={{
            borderColor: derived.border,
            backgroundColor: neutral.surface,
            minHeight:
              threadExpanded ?
                undefined
              : `${threadPanelMinHeightCollapsedPx}px`,
          }}
          data-command-surface-thread-panel="true"
        >
          <div
            className="flex items-center gap-2 border-b px-3 py-1.5 min-h-[32px]"
            style={{ borderColor: derived.border, backgroundColor: derived.adminV2AiBarPineWash }}
          >
            <button
              type="button"
              className="text-[10px] font-semibold uppercase tracking-wide shrink-0"
              style={{ color: CMD.textLabel }}
              data-command-surface-thread-toggle="true"
              onClick={() => setThreadExpanded(!threadExpanded)}
              aria-expanded={threadExpanded}
            >
              {threadExpanded ? "Hide" : "Show"} conversation
            </button>
            {!threadExpanded && threadPreview ? (
              <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: CMD.textSupporting }}>
                {threadPreview.length > 72 ? `${threadPreview.slice(0, 69)}…` : threadPreview}
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-[11px]" style={{ color: CMD.textSupporting }}>
                Assistant
              </span>
            )}
            {threadStatusLabel ?
              <span
                className="shrink-0 text-[10px] font-medium tabular-nums"
                style={{ color: CMD.textSupporting }}
                data-command-surface-thread-status="true"
                aria-live="polite"
              >
                {threadStatusLabel}
              </span>
            :   null}
            <button
              type="button"
              className="shrink-0 text-[10px] underline-offset-2 hover:underline"
              style={{ color: CMD.textLabel }}
              data-command-surface-clear="true"
              onClick={() => clearConversation()}
            >
              Clear
            </button>
          </div>
          <OperationalActiveRecordChip
            label={globalAssistant?.currentContext?.label}
            sourceSurface={globalAssistant?.currentContext?.source_surface}
            variant="thread_header"
          />
          {threadExpanded ? (
            <div
              ref={threadScrollRef}
              className={`${threadScrollMaxClass} overflow-y-auto rounded-b-none`}
              style={{ minHeight: `${threadScrollMinHeightPx}px` }}
            >
              {shouldShowInlineThreadBusyIndicator({ busy, turns: thread.turns }) ?
                <div
                  className="px-3 py-2 text-[11px]"
                  style={{ color: CMD.textSupporting }}
                  data-command-surface-inline-busy="true"
                  aria-hidden
                >
                  {threadStatusLabel ?? "Processing…"}
                </div>
              :   null}
              <CommandSurfaceThread
                turns={thread.turns}
                busy={busy}
                activeOperationalEntityId={activeOperationalEntityId}
                onPickCandidate={(turnId, candidate, intent) => confirmTaskAssistTarget(turnId, candidate, intent)}
                onConfirmCandidate={confirmTaskAssistTarget}
                onConfirmFuzzySuggestion={(_turnId, candidate, intent) => confirmTaskAssistTarget("", candidate, intent)}
                onClarificationChip={onClarificationChip}
                onToggleActionCard={(turnId) => setThread((prev) => toggleActionCardExpanded(prev, turnId))}
                onToggleTaskAssistMoreOptions={onToggleTaskAssistMoreOptions}
                renderJobLayoutCardActions={renderJobLayoutCardActions}
                workflowAssistMutation={workflowAssistMutationsAllowed ? workflowAssistMutation : undefined}
                workflowAssistMutationBlockedReason={workflowAssistMutationBlockedReasonShell}
                workflowAssistMutationsAllowed={workflowAssistMutationsAllowed}
                workflowAssistCapabilitiesPending={workflowAssistCapabilitiesPending}
                onReviewConfigProposal={onReviewConfigProposal}
                onWorkflowAssistProposeEdit={onWorkflowAssistProposeEdit}
                debugReviewNavigation={debugReviewNavigation}
                onConfirmConfigFieldSetup={(command, payload) =>
                  void confirmConfigLayoutFieldSetup(command, payload)
                }
                onApproveConfigProposal={(proposalId) => void approveAndApplyConfigProposal(proposalId)}
                configAssistCanApproveAndApply={configAssistCanApproveAndApply}
                configAssistCapabilitiesPending={configAssistCapabilitiesPending}
                onExecutionReceipt={appendExecutionReceipt}
              />
            </div>
          ) : null}
        </div>
      ) : presentation !== "rail" ?
        <OperationalActiveRecordChip
          label={globalAssistant?.currentContext?.label}
          sourceSurface={globalAssistant?.currentContext?.source_surface}
          variant="collapsed_rail"
        />
      :   null}

      {presentation !== "rail" ?
        <div
            className={`flex shrink-0 items-end gap-2 ${hasThread ? "mt-0" : "mt-2"}`}
          >
            <div
              className={`flex-1 min-w-0 border-2 bg-white px-3 py-2 ${
                hasThread ? "rounded-b-xl rounded-t-none border-t border-t-[rgba(39,63,82,0.08)]" : "rounded-2xl px-3.5 py-2.5"
              }`}
              style={{
                borderColor: hasThread ? derived.border : derived.adminV2AiInputPineRing,
                boxShadow: hasThread ?
                  `inset 0 1px 0 rgba(255,255,255,0.95)`
                :   `0 1px 0 rgba(0, 162, 131, 0.06), inset 0 1px 0 rgba(255,255,255,0.9)`,
              }}
            >
              <textarea
                ref={inputRef}
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                placeholder="Talk to Bos"
                className="w-full resize-none bg-transparent outline-none text-sm leading-snug"
                rows={1}
                style={{ color: neutral.textPrimary }}
                aria-label="AI assistant input"
                data-command-surface-input="true"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!busy) void handleSubmit();
                  }
                }}
              />
            </div>
            <button
              type="button"
              data-command-surface-submit="true"
              disabled={busy || !commandText.trim()}
              onClick={() => void handleSubmit()}
              className="shrink-0 rounded-xl px-3.5 py-2.5 text-xs font-bold tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: brand.secondary,
                color: neutral.surface,
                letterSpacing: "0.12em",
                boxShadow: `0 2px 8px rgba(0, 162, 131, 0.35)`,
              }}
            >
              {busy ? "Processing…" : "Ask"}
            </button>
          </div>
      :   null}
    </SurfaceCard>
  );
}
