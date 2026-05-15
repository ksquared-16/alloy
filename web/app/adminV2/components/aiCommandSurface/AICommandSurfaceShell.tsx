"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { usePathname } from "next/navigation";
import { neutral, derived, brand, semantic, palette } from "@/styles/tokens/colors";
import type { JobOverviewPlannerSuccess, JobOverviewPlannerFailure } from "@/lib/agent/planner/jobOverviewPlannerTypes";
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
import { dispatchAiActivityRefresh } from "@/app/adminV2/components/aiActivity/RecentAiActionsStrip";
import TaskAssistOpportunityWorkspace from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import {
  extractTaskAssistEntitySearchQuery,
  looksLikeAmbientOnlyCommand,
} from "@/lib/agent/taskAssist/taskAssistCommandBarResolution";
import {
  buildTaskAssistCommandBootstrap,
  parseTaskAssistCommandIntent,
  type TaskAssistCommandBootstrap,
  type TaskAssistCommandIntent,
} from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import type { TaskAssistEntitySearchCandidate } from "@/lib/agent/taskAssist/taskAssistEntitySearchTypes";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
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

type ResponseModel = {
  kind: ResponseKind;
  headline: string;
  subline?: string;
  confidence: AIStatusBadge;
  /** Command text submitted for this response (preview); unchanged by apply. */
  submittedCommand?: string;
  plannerOk?: JobOverviewPlannerSuccess | null;
  plannerErr?: JobOverviewPlannerFailure | null;
  structuredOverrideJson?: string;
  applyResultJson?: string;
  errorDetailJson?: string;
};

const BAR_MAX_WIDTH = 840;
const COLLAPSED_MIN_H = 36;
const EXPANDED_MAX_H = 320;
/** Delay before auto-collapsing the panel after a successful Apply. */
const POST_APPLY_COLLAPSE_MS = 1800;
/** How long to show the compact “saved” strip after auto-collapse. */
const SUCCESS_STRIP_MS = 5200;

function safeJson(x: unknown): string {
  return JSON.stringify(x, null, 2);
}

function clampExpandedHeightPx(viewportH: number): number {
  return Math.max(220, Math.min(EXPANDED_MAX_H, Math.round(viewportH * 0.42)));
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

function SurfaceCard(props: {
  children: ReactNode;
  expanded: boolean;
  rootRef?: RefObject<HTMLElement | null>;
}) {
  const { children, expanded, rootRef } = props;
  return (
    <footer
      ref={rootRef}
      data-adminv2-ai-command-surface
      role="contentinfo"
      aria-label="AI command surface"
      className="w-full flex justify-center px-4"
      style={{
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
          href="/adminV2/ai-activity"
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

type TaskAssistResolveState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ambient_confirm"; entityId: string; label: string }
  | { kind: "pick"; candidates: TaskAssistEntitySearchCandidate[] }
  | { kind: "confirm_one"; candidate: TaskAssistEntitySearchCandidate }
  | { kind: "none"; message: string };

export default function AICommandSurfaceShell() {
  const pathname = usePathname();
  const routePathRef = useRef(pathname);
  const postApplyCollapseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successStripRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shellRootRef = useRef<HTMLElement | null>(null);

  const globalAssistant = useGlobalAssistantOptional();
  const taskAssistUiEnabled = isTaskAssistV1UiEnabled();
  const taskAssistBarMode =
    Boolean(taskAssistUiEnabled) && Boolean(globalAssistant) && globalAssistant!.commandSurfaceMode === "task_assist";
  const taskAssistWorkspaceVisible =
    taskAssistBarMode &&
    globalAssistant!.currentContext?.entity_type === "opportunities" &&
    Boolean(globalAssistant!.currentContext?.entity_id);

  const [taskAssistResolve, setTaskAssistResolve] = useState<TaskAssistResolveState>({ kind: "idle" });
  const [taskAssistPendingIntent, setTaskAssistPendingIntent] = useState<TaskAssistCommandIntent | null>(null);
  const [taskAssistCommandBootstrap, setTaskAssistCommandBootstrap] = useState<TaskAssistCommandBootstrap | null>(null);
  const [taskAssistBootstrapKey, setTaskAssistBootstrapKey] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [commandText, setCommandText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showSuccessStrip, setShowSuccessStrip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [applyAnyway, setApplyAnyway] = useState(false);
  const [viewportH, setViewportH] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 900);

  const [response, setResponse] = useState<ResponseModel | null>(null);
  const [structuredOverrideJson, setStructuredOverrideJson] = useState<string>("");

  const clearPostApplyTimer = useCallback(() => {
    if (postApplyCollapseRef.current) {
      clearTimeout(postApplyCollapseRef.current);
      postApplyCollapseRef.current = null;
    }
  }, []);

  const clearSuccessStripTimer = useCallback(() => {
    if (successStripRef.current) {
      clearTimeout(successStripRef.current);
      successStripRef.current = null;
    }
  }, []);

  const collapsePanel = useCallback(() => {
    clearPostApplyTimer();
    setExpanded(false);
    setAdvancedOpen(false);
    setDetailsOpen(false);
  }, [clearPostApplyTimer]);

  const applyTaskAssistCandidate = useCallback(
    (c: TaskAssistEntitySearchCandidate, intent?: TaskAssistCommandIntent | null) => {
      if (!globalAssistant) return;
      const effectiveIntent = intent ?? taskAssistPendingIntent;
      globalAssistant.setAssistantContext({
        entity_type: "opportunities",
        entity_id: c.entity_id,
        label: c.label,
        source_surface: "command_bar",
      });
      if (effectiveIntent) {
        setTaskAssistCommandBootstrap(buildTaskAssistCommandBootstrap(effectiveIntent));
        setTaskAssistBootstrapKey(`${c.entity_id}-${Date.now()}`);
      }
      setTaskAssistResolve({ kind: "idle" });
    },
    [globalAssistant, taskAssistPendingIntent],
  );

  const taskAssistIntentSummary = useCallback((intent: TaskAssistCommandIntent | null): string | null => {
    if (!intent || intent.intent_type === "unknown") return null;
    const ch = intent.channel_hint ? ` · ${intent.channel_hint.toUpperCase()}` : "";
    switch (intent.intent_type) {
      case "draft_message":
        return `Draft message${ch}`;
      case "schedule_message":
        return `Schedule send${ch}${intent.timing_hint_text ? ` · ${intent.timing_hint_text}` : ""}`;
      case "create_reminder":
        return `Reminder / task${intent.timing_hint_text ? ` · ${intent.timing_hint_text}` : ""}`;
      default:
        return null;
    }
  }, []);

  const runTaskAssistResolve = useCallback(async () => {
    if (!taskAssistBarMode || !globalAssistant) return;
    const cmd = commandText.trim();
    if (!cmd) return;
    setTaskAssistResolve({ kind: "loading" });
    try {
      const parsed = parseTaskAssistCommandIntent(cmd);
      setTaskAssistPendingIntent(parsed);

      if (parsed.workflow_blocked) {
        setTaskAssistResolve({
          kind: "none",
          message: parsed.warnings[0] ?? "That sounds like Workflow Assist, not Task Assist.",
        });
        return;
      }

      if (
        looksLikeAmbientOnlyCommand(cmd) &&
        globalAssistant.currentContext?.entity_type === "opportunities" &&
        globalAssistant.currentContext.entity_id
      ) {
        setTaskAssistResolve({
          kind: "ambient_confirm",
          entityId: globalAssistant.currentContext.entity_id,
          label: globalAssistant.currentContext.label,
        });
        return;
      }
      const qFromIntent = parsed.search_text_hint?.trim() ?? "";
      const qExtract = qFromIntent.length >= 2 ? qFromIntent : extractTaskAssistEntitySearchQuery(cmd);
      const qEff = (qExtract.length >= 2 ? qExtract : cmd).trim();
      const res = await fetchTaskAssistEntitySearch({ q: qEff, entity_type: "all" });
      const j = await readJson<{
        ok?: boolean;
        candidates?: TaskAssistEntitySearchCandidate[];
        message?: string;
      }>(res);
      if (!res.ok || j.ok === false) {
        setTaskAssistResolve({
          kind: "none",
          message: typeof j.message === "string" && j.message.trim() ? j.message : "Could not search right now.",
        });
        return;
      }
      let list = Array.isArray(j.candidates) ? j.candidates : [];
      const ctxOpp =
        globalAssistant.currentContext?.entity_type === "opportunities" && globalAssistant.currentContext.entity_id ?
          globalAssistant.currentContext
        : null;
      if (ctxOpp && !looksLikeAmbientOnlyCommand(cmd)) {
        const chip: TaskAssistEntitySearchCandidate = {
          entity_type: "opportunities",
          entity_id: ctxOpp.entity_id,
          label: ctxOpp.label || "Current opportunity",
          subtitle: "From drawer / ambient context — pick if this is who you mean",
          confidence: "high",
          source: "opportunity_name",
          matched_fields: ["ambient_context"],
        };
        list = [chip, ...list.filter((c) => c.entity_id !== ctxOpp.entity_id)];
      }
      if (list.length === 0) {
        setTaskAssistResolve({
          kind: "none",
          message: "Could not find a matching family or opportunity. Try another name or open the record in the drawer.",
        });
        return;
      }
      if (list.length === 1) {
        setTaskAssistResolve({ kind: "confirm_one", candidate: list[0]! });
        return;
      }
      setTaskAssistResolve({ kind: "pick", candidates: list });
    } catch {
      setTaskAssistResolve({ kind: "none", message: "Search failed. Try again." });
    }
  }, [commandText, globalAssistant, taskAssistBarMode]);

  const activePlanner = response?.plannerOk ?? null;
  const applyBlockedByNoop = shouldBlockSemanticNoopApply({
    previewRoute: "v1",
    semanticPlanner: activePlanner,
    applySemanticNoopAnyway: applyAnyway,
  });

  const canApply = Boolean(structuredOverrideJson) && !applyBlockedByNoop && (response?.kind === "action_preview" || response?.kind === "no_op" || response?.kind === "unresolved_only");

  const panelMaxHeight = useMemo(() => clampExpandedHeightPx(viewportH), [viewportH]);

  const detailsBullets = useMemo(() => {
    if (!response) return [];
    return buildDetailsBullets({
      kind: response.kind,
      planner: response.plannerOk ?? null,
      commandText: response.submittedCommand ?? "",
      errorSubline: response.kind === "error" ? response.subline : undefined,
    });
  }, [response]);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => {
      clearPostApplyTimer();
      clearSuccessStripTimer();
    };
  }, [clearPostApplyTimer, clearSuccessStripTimer]);

  useEffect(() => {
    if (routePathRef.current !== pathname) {
      routePathRef.current = pathname;
      setShowSuccessStrip(false);
      clearSuccessStripTimer();
      collapsePanel();
      globalAssistant?.setCommandSurfaceMode("job_overview");
      setTaskAssistResolve({ kind: "idle" });
      setTaskAssistPendingIntent(null);
      setTaskAssistCommandBootstrap(null);
      setTaskAssistBootstrapKey(null);
    }
  }, [pathname, collapsePanel, clearSuccessStripTimer, globalAssistant]);

  useEffect(() => {
    const onFocusBar = (ev: Event) => {
      const detail = (ev as CustomEvent<AdminV2FocusCommandBarDetail>).detail ?? {};
      shellRootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (detail.preferMode && globalAssistant) {
        globalAssistant.setCommandSurfaceMode(detail.preferMode);
      }
    };
    window.addEventListener(ADMIN_V2_FOCUS_COMMAND_BAR, onFocusBar as EventListener);
    return () => window.removeEventListener(ADMIN_V2_FOCUS_COMMAND_BAR, onFocusBar as EventListener);
  }, [globalAssistant]);

  useEffect(() => {
    const jobPanelOpen = expanded && response != null;
    const listenEsc = jobPanelOpen || taskAssistBarMode;
    if (!listenEsc || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (taskAssistResolve.kind !== "idle" && taskAssistResolve.kind !== "loading") {
          setTaskAssistResolve({ kind: "idle" });
          return;
        }
        if (taskAssistResolve.kind === "loading") {
          setTaskAssistResolve({ kind: "idle" });
          return;
        }
        if (taskAssistBarMode && globalAssistant) {
          globalAssistant.setCommandSurfaceMode("job_overview");
        } else {
          collapsePanel();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded, response, busy, collapsePanel, taskAssistBarMode, globalAssistant, taskAssistResolve.kind]);

  const runPreview = useCallback(async () => {
    if (taskAssistBarMode) return;
    const submitted = commandText.trim();
    if (!submitted) return;

    setCommandText("");
    queueMicrotask(() => {
      inputRef.current?.focus();
    });

    setShowSuccessStrip(false);
    clearSuccessStripTimer();
    clearPostApplyTimer();
    setExpanded(true);
    setBusy(true);
    setAdvancedOpen(false);
    setDetailsOpen(false);
    setApplyAnyway(false);
    setStructuredOverrideJson("");
    setResponse({
      kind: "loading",
      headline: "Working on your request…",
      confidence: "in_progress",
      subline: "Building preview…",
      submittedCommand: submitted,
    });

    try {
      const cfg = await loadCurrentJobOverviewConfig();
      const prev = runOverviewLayoutSemanticPreview(submitted, cfg);
      if (!prev.ok) {
        setResponse({
          kind: "error",
          headline: "Couldn’t build a preview",
          subline: prev.error,
          confidence: "error",
          submittedCommand: submitted,
          plannerErr: prev.planner,
          errorDetailJson: safeJson(prev.planner),
        });
        return;
      }

      const planner = prev.planner;
      const { headline, subline, kind } = headlineForPreview(planner);
      const structuredJson = safeJson(prev.structured_override);
      setStructuredOverrideJson(structuredJson);
      setResponse({
        kind,
        headline,
        subline,
        confidence: statusFromPlanner(planner),
        submittedCommand: submitted,
        plannerOk: planner,
        structuredOverrideJson: structuredJson,
      });
    } catch (e) {
      setResponse({
        kind: "error",
        headline: "Preview failed",
        subline: e instanceof Error ? e.message : "Request failed",
        confidence: "error",
        submittedCommand: submitted,
        errorDetailJson: safeJson({ message: e instanceof Error ? e.message : String(e) }),
      });
    } finally {
      setBusy(false);
      queueMicrotask(() => {
        inputRef.current?.focus();
      });
    }
  }, [commandText, clearPostApplyTimer, clearSuccessStripTimer, taskAssistBarMode]);

  const apply = useCallback(async () => {
    if (taskAssistBarMode) return;
    if (!structuredOverrideJson) return;
    if (applyBlockedByNoop) return;

    const auditMessage = response?.submittedCommand?.trim() || "AdminV2 AI command surface";

    clearPostApplyTimer();
    setBusy(true);
    setAdvancedOpen(false);
    setDetailsOpen(false);
    setResponse((r) =>
      r
        ? {
            ...r,
            kind: "loading",
            headline: "Working on your request…",
            subline: "Applying…",
            confidence: "in_progress",
          }
        : {
            kind: "loading",
            headline: "Working on your request…",
            subline: "Applying…",
            confidence: "in_progress",
          }
    );

    try {
      const ids = newIds();
      const structured_override = JSON.parse(structuredOverrideJson) as unknown;
      const res = await fetch("/api/admin/agent/v1/record-overview-layout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: ids.request_id,
          correlation_id: ids.correlation_id,
          message: auditMessage,
          structured_override,
        }),
      });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        clearPostApplyTimer();
        setResponse((r) =>
          r
            ? {
                ...r,
                kind: "error",
                headline: "Apply failed",
                subline: `HTTP ${res.status}`,
                confidence: "error",
                plannerOk: activePlanner,
                structuredOverrideJson,
                errorDetailJson: safeJson(data),
              }
            : r
        );
        return;
      }
      setResponse((r) =>
        r
          ? {
              ...r,
              kind: "applied_success",
              headline: "Changes applied",
              subline: "Saved.",
              confidence: "applied",
              applyResultJson: safeJson(data),
              plannerOk: activePlanner,
              structuredOverrideJson,
            }
          : r
      );
      dispatchAiActivityRefresh();
      clearPostApplyTimer();
      postApplyCollapseRef.current = setTimeout(() => {
        postApplyCollapseRef.current = null;
        setExpanded(false);
        setAdvancedOpen(false);
        setDetailsOpen(false);
        setShowSuccessStrip(true);
        clearSuccessStripTimer();
        successStripRef.current = setTimeout(() => {
          successStripRef.current = null;
          setShowSuccessStrip(false);
        }, SUCCESS_STRIP_MS);
      }, POST_APPLY_COLLAPSE_MS);
    } catch (e) {
      clearPostApplyTimer();
      setResponse((r) =>
        r
          ? {
              ...r,
              kind: "error",
              headline: "Apply failed",
              subline: e instanceof Error ? e.message : "Request failed",
              confidence: "error",
              plannerOk: activePlanner,
              structuredOverrideJson,
              errorDetailJson: safeJson({ message: e instanceof Error ? e.message : String(e) }),
            }
          : r
      );
    } finally {
      setBusy(false);
      queueMicrotask(() => {
        inputRef.current?.focus();
      });
    }
  }, [structuredOverrideJson, applyBlockedByNoop, activePlanner, response?.submittedCommand, clearPostApplyTimer, clearSuccessStripTimer, taskAssistBarMode]);

  const refine = useCallback(() => {
    setExpanded(true);
    inputRef.current?.focus();
    const len = commandText.length;
    queueMicrotask(() => {
      inputRef.current?.setSelectionRange(len, len);
    });
  }, [commandText]);

  const showJobPanel = !taskAssistBarMode && expanded && response != null;
  const surfaceExpanded = showJobPanel || showSuccessStrip || taskAssistBarMode;

  return (
    <SurfaceCard expanded={surfaceExpanded} rootRef={shellRootRef}>
      {!taskAssistBarMode && showSuccessStrip && !expanded && response?.kind === "applied_success" ? (
        <div
          className="mb-0 flex items-center justify-between gap-2 rounded-t-lg px-3 py-1.5"
          style={{
            backgroundColor: derived.kpiBandBusinessWash,
            borderBottom: `1px solid ${derived.border}`,
          }}
        >
          <span className="min-w-0 text-[11px] leading-snug" style={{ color: CMD.textBody }}>
            Job overview layout saved.
          </span>
          <button
            type="button"
            className="shrink-0 text-[11px] font-semibold"
            style={{ color: brand.secondary }}
            onClick={() => setExpanded(true)}
          >
            Show
          </button>
        </div>
      ) : null}

      {taskAssistUiEnabled && globalAssistant ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-alloy-stone/15 px-3 py-2"
          style={{ backgroundColor: neutral.surface }}
          data-adminv2-command-surface-mode-tabs="true"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: CMD.textLabel }}>
            Mode
          </span>
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
              globalAssistant.commandSurfaceMode === "task_assist"
                ? "bg-alloy-midnight/90 text-white"
                : "border border-alloy-stone/25 text-alloy-midnight/75"
            }`}
            title="Task Assist — find an opportunity from the bar, then draft / save / schedule (no auto-send)"
            onClick={() => globalAssistant.setCommandSurfaceMode("task_assist")}
          >
            Task Assist
          </button>
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
              globalAssistant.commandSurfaceMode === "job_overview"
                ? "bg-alloy-midnight/90 text-white"
                : "border border-alloy-stone/25 text-alloy-midnight/75"
            }`}
            onClick={() => globalAssistant.setCommandSurfaceMode("job_overview")}
          >
            Job layout
          </button>
          {globalAssistant.currentContext?.label ? (
            <span className="min-w-0 max-w-[min(280px,40vw)] truncate text-[10px]" style={{ color: CMD.textSupporting }}>
              Context: {globalAssistant.currentContext.label}
            </span>
          ) : null}
        </div>
      ) : null}

      {taskAssistBarMode ? (
        <div
          className="max-h-[min(52vh,440px)] overflow-y-auto border-b"
          style={{ borderColor: derived.border, backgroundColor: neutral.surface }}
          data-adminv2-task-assist-command-tray="true"
        >
          {taskAssistResolve.kind === "loading" ? (
            <div className="px-3 py-2 text-[12px]" style={{ color: CMD.textSupporting }}>
              Searching…
            </div>
          ) : null}
          {taskAssistResolve.kind === "ambient_confirm" ? (
            <div className="space-y-2 border-b px-3 py-2" style={{ borderColor: derived.border }} data-adminv2-task-assist-ambient-confirm="true">
              <div className="text-[12px] font-semibold" style={{ color: CMD.textBody }}>
                Use current opportunity?
              </div>
              <div className="text-[11px]" style={{ color: CMD.textSupporting }}>
                {taskAssistResolve.label}
              </div>
              {taskAssistIntentSummary(taskAssistPendingIntent) ? (
                <div className="text-[10px]" style={{ color: CMD.textLabel }} data-adminv2-task-assist-intent-summary="true">
                  Next: {taskAssistIntentSummary(taskAssistPendingIntent)} — confirm target, then review in the workspace (no auto-send).
                </div>
              ) : null}
              <button
                type="button"
                className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[12px] font-semibold text-white"
                onClick={() =>
                  applyTaskAssistCandidate(
                    {
                      entity_type: "opportunities",
                      entity_id: taskAssistResolve.entityId,
                      label: taskAssistResolve.label,
                      subtitle: null,
                      confidence: "high",
                      source: "opportunity_name",
                      matched_fields: ["ambient_pronoun"],
                    },
                    taskAssistPendingIntent,
                  )
                }
              >
                Confirm target
              </button>
            </div>
          ) : null}
          {taskAssistResolve.kind === "confirm_one" ? (
            <div className="space-y-2 border-b px-3 py-2" style={{ borderColor: derived.border }} data-adminv2-task-assist-single-confirm="true">
              <div className="text-[12px] font-semibold" style={{ color: CMD.textBody }}>
                Confirm Task Assist target
              </div>
              <div className="text-[11px]" style={{ color: CMD.textBody }}>
                {taskAssistResolve.candidate.label}
              </div>
              {taskAssistResolve.candidate.subtitle ? (
                <div className="text-[10px]" style={{ color: CMD.textSupporting }}>
                  {taskAssistResolve.candidate.subtitle}
                </div>
              ) : null}
              {taskAssistIntentSummary(taskAssistPendingIntent) ? (
                <div className="text-[10px]" style={{ color: CMD.textLabel }} data-adminv2-task-assist-intent-summary="true">
                  Next: {taskAssistIntentSummary(taskAssistPendingIntent)} — confirm target, then review in the workspace (no auto-send).
                </div>
              ) : null}
              <button
                type="button"
                className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[12px] font-semibold text-white"
                onClick={() => applyTaskAssistCandidate(taskAssistResolve.candidate, taskAssistPendingIntent)}
              >
                Confirm target
              </button>
            </div>
          ) : null}
          {taskAssistResolve.kind === "pick" ? (
            <div className="border-b px-2 py-2" style={{ borderColor: derived.border }} data-adminv2-task-assist-candidates="true">
              <div className="px-1 pb-1 text-[11px] font-semibold" style={{ color: CMD.textLabel }}>
                Pick an opportunity
              </div>
              <ul className="space-y-1">
                {taskAssistResolve.candidates.map((c) => (
                  <li key={c.entity_id}>
                    <button
                      type="button"
                      data-adminv2-task-assist-candidate-row="true"
                      className="flex w-full flex-col rounded-md border px-2 py-1.5 text-left text-[11px] hover:bg-alloy-stone/[0.06]"
                      style={{ borderColor: derived.border, color: CMD.textBody }}
                      onClick={() => setTaskAssistResolve({ kind: "confirm_one", candidate: c })}
                    >
                      <span className="font-semibold">{c.label}</span>
                      {c.subtitle ? <span style={{ color: CMD.textSupporting }}>{c.subtitle}</span> : null}
                      <span className="text-[10px]" style={{ color: CMD.textLabel }}>
                        {c.matched_fields.join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {taskAssistResolve.kind === "none" ? (
            <div className="border-b px-3 py-2 text-[12px]" style={{ borderColor: derived.border, color: semantic.warning }} data-adminv2-task-assist-no-match="true">
              {taskAssistResolve.message}
            </div>
          ) : null}
          {taskAssistWorkspaceVisible && globalAssistant?.currentContext ? (
            <TaskAssistOpportunityWorkspace
              entityId={globalAssistant.currentContext.entity_id}
              active
              source_surface="command_bar"
              command_bootstrap={taskAssistCommandBootstrap}
              command_bootstrap_key={taskAssistBootstrapKey}
              className="mb-0 border-0 bg-transparent px-2 py-2 shadow-none"
            />
          ) : taskAssistResolve.kind === "idle" && !taskAssistWorkspaceVisible ? (
            <div className="px-3 py-2 text-[11px] leading-snug" style={{ color: CMD.textSupporting }}>
              Describe who to contact (e.g. a family name) and press <strong className="font-semibold">Enter</strong> or{" "}
              <strong className="font-semibold">Find target</strong> — then confirm before drafting. No auto-send.
            </div>
          ) : null}
        </div>
      ) : null}

      {showJobPanel && response ? (
        <div
          className="rounded-t-xl overflow-hidden border-b"
          style={{
            maxHeight: panelMaxHeight,
            borderTop: `2px solid ${derived.adminV2AiBarPineBorder}`,
            borderColor: derived.border,
            backgroundColor: neutral.surface,
          }}
        >
          <OutcomeZone
            headline={response.headline}
            subline={response.subline}
            confidence={response.confidence}
            submittedCommand={response.submittedCommand}
          />

          <div className="space-y-0 px-3 py-2" style={{ backgroundColor: neutral.background }}>
            <AIActionsRow
              kind={response.kind}
              canApply={canApply}
              applying={busy && response.kind === "loading" && Boolean(structuredOverrideJson)}
              applyBlockedByNoop={applyBlockedByNoop}
              applyAnyway={applyAnyway}
              onToggleApplyAnyway={setApplyAnyway}
              onApply={() => void apply()}
              onDismiss={collapsePanel}
              onRefine={refine}
            />

            {response.kind !== "loading" ? (
              <DetailsToggle open={detailsOpen} onToggle={() => setDetailsOpen((o) => !o)} bullets={detailsBullets} />
            ) : null}

            {response.kind !== "loading" &&
            (response.plannerOk || structuredOverrideJson || response.errorDetailJson || response.applyResultJson) ? (
              <AdvancedDrawer
                open={advancedOpen}
                onToggle={() => setAdvancedOpen((o) => !o)}
                planner={response.plannerOk ?? null}
                structuredOverrideJson={structuredOverrideJson}
                applyResultJson={response.kind === "applied_success" ? response.applyResultJson : undefined}
                errorDetailJson={response.kind === "error" ? response.errorDetailJson : undefined}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={`flex items-end gap-2 ${surfaceExpanded ? "mt-0" : "mt-2"}`}>
        <div
          className={`flex-1 min-w-0 border-2 bg-white px-3 py-2 ${
            surfaceExpanded ? "rounded-b-xl rounded-t-none border-t border-t-[rgba(0,0,0,0.06)]" : "rounded-2xl px-3.5 py-2.5"
          }`}
          style={{
            borderColor: derived.adminV2AiInputPineRing,
            boxShadow:
              surfaceExpanded
                ? `inset 0 1px 0 rgba(255,255,255,0.95)`
                : `0 1px 0 rgba(0, 162, 131, 0.06), inset 0 1px 0 rgba(255,255,255,0.9)`,
          }}
        >
          <textarea
            ref={inputRef}
            value={commandText}
            onChange={(e) => {
              const v = e.target.value;
              setCommandText(v);
              if (!taskAssistBarMode && response && v.trim().length > 0) {
                setExpanded(true);
              }
            }}
            onFocus={() => {
              if (!taskAssistBarMode && commandText.trim().length > 0) {
                setExpanded(true);
              }
            }}
            placeholder={
              taskAssistBarMode
                ? "e.g. “Text the Smith family about missing forms” — Enter finds matching opportunities (no auto-send)."
                : "Command: configure job overview… (e.g. “make the overview more customer-focused”)"
            }
            className="w-full resize-none bg-transparent outline-none text-sm leading-snug"
            rows={1}
            style={{ color: neutral.textPrimary }}
            aria-label="AI command input"
            onKeyDown={(e) => {
              if (taskAssistBarMode) {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!busy && taskAssistResolve.kind !== "loading") void runTaskAssistResolve();
                }
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!busy) void runPreview();
              }
            }}
          />
          <div className="mt-0.5 text-[10px] leading-tight" style={{ color: CMD.textSupporting }}>
            {taskAssistBarMode
              ? "Enter or Find target searches records — confirm before drafting. Job layout preview is disabled."
              : "Job overview only · Enter to preview"}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {taskAssistBarMode ? (
            <button
              type="button"
              data-adminv2-task-assist-find-target="true"
              disabled={busy || taskAssistResolve.kind === "loading" || !commandText.trim()}
              onClick={() => void runTaskAssistResolve()}
              className="shrink-0 rounded-xl px-3.5 py-2.5 text-xs font-bold tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: palette.midnightForge,
                color: neutral.surface,
                letterSpacing: "0.12em",
              }}
            >
              {taskAssistResolve.kind === "loading" ? "Searching…" : "Find target"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || !commandText.trim() || taskAssistBarMode}
            onClick={() => void runPreview()}
            className="shrink-0 rounded-xl px-3.5 py-2.5 text-xs font-bold tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: brand.secondary,
              color: neutral.surface,
              letterSpacing: "0.14em",
              boxShadow: `0 2px 8px rgba(0, 162, 131, 0.35)`,
            }}
          >
            {busy ? "Working…" : "Preview"}
          </button>
        </div>
      </div>
    </SurfaceCard>
  );
}
