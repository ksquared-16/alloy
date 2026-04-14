"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { neutral, derived, brand, semantic, palette } from "@/styles/tokens/colors";

/** Section accents + tints — AdminV2 command surface (tokens + semantic mixes only). */
const CMD = {
  border: 2,
  padL: 10,
  accentPine: brand.secondary,
  accentGreen: semantic.success,
  accentAmber: semantic.warning,
  bgFound: derived.kpiBandBusinessWash,
  bgChanges: derived.kpiBandBusinessLight,
  bgUnresolved: `color-mix(in srgb, ${semantic.warning} 5%, ${neutral.surface})`,
  bgNoop: derived.inspectorCommandRailWash,
  /** Primary body — Midnight Forge forward (slate-700/800 feel vs gray-500) */
  textBody: neutral.textPrimary,
  textSupporting: "rgba(39, 63, 82, 0.78)",
  textLabel: "rgba(39, 63, 82, 0.52)",
} as const;
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

type ResponseModel = {
  kind: ResponseKind;
  headline: string;
  subline?: string;
  confidence: AIStatusBadge;
  /** Present for preview success. */
  plannerOk?: JobOverviewPlannerSuccess | null;
  /** Present for preview failure. */
  plannerErr?: JobOverviewPlannerFailure | null;
  /** Present for preview success (apply payload). */
  structuredOverrideJson?: string;
  /** Present for apply result JSON. */
  applyResultJson?: string;
  /** Friendly error line for the main panel (JSON stays in advanced). */
  errorDetailJson?: string;
};

const BAR_MAX_WIDTH = 840;
const COLLAPSED_MIN_H = 42;
const EXPANDED_MAX_H = 400;

function safeJson(x: unknown): string {
  return JSON.stringify(x, null, 2);
}

function clampExpandedHeightPx(viewportH: number): number {
  // v1: keep the workspace visible behind; internal scroll inside the response body.
  return Math.max(280, Math.min(EXPANDED_MAX_H, Math.round(viewportH * 0.48)));
}

function newIds(): { request_id: string; correlation_id: string } {
  return { request_id: crypto.randomUUID(), correlation_id: crypto.randomUUID() };
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

function SurfaceCard(props: { children: ReactNode; expanded: boolean }) {
  const { children, expanded } = props;
  return (
    <footer
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

function AIResponseHeader(props: { headline: string; subline?: string; confidence: AIStatusBadge }) {
  const { headline, subline, confidence } = props;
  const badgeBg =
    confidence === "ready" || confidence === "applied"
      ? "rgba(0, 162, 131, 0.14)"
      : confidence === "partial"
        ? "rgba(188, 67, 0, 0.12)"
        : confidence === "up_to_date"
          ? "rgba(39, 63, 82, 0.08)"
          : confidence === "gaps_only"
            ? "rgba(188, 67, 0, 0.1)"
            : confidence === "in_progress"
              ? "rgba(0, 69, 140, 0.08)"
              : confidence === "error"
                ? "rgba(188, 67, 0, 0.12)"
                : "rgba(39, 63, 82, 0.08)";
  const badgeText =
    confidence === "ready" || confidence === "applied"
      ? semantic.success
      : confidence === "partial"
        ? semantic.warning
        : confidence === "up_to_date"
          ? derived.textSecondary
          : confidence === "gaps_only"
            ? semantic.warning
            : confidence === "in_progress"
              ? palette.alloyBlue
              : confidence === "error"
                ? palette.juniperEmber
                : derived.textSecondary;
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-snug" style={{ color: neutral.textPrimary }}>
          {headline}
        </div>
        {subline ? (
          <div className="mt-0.5 text-[11px] leading-snug" style={{ color: CMD.textSupporting }}>
            {subline}
          </div>
        ) : null}
      </div>
      <div
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{
          backgroundColor: badgeBg,
          color: badgeText,
          border: `1px solid ${derived.border}`,
        }}
        aria-label={`Status: ${badgeLabel(confidence)}`}
      >
        {badgeLabel(confidence)}
      </div>
    </div>
  );
}

function AISummarySection(props: { planner: JobOverviewPlannerSuccess; commandText: string }) {
  const { planner, commandText } = props;
  const found = formatIntentSummary(planner.parsed_intent);
  return (
    <div className="mt-0 space-y-2.5">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: CMD.textLabel }}>
          Your request
        </div>
        <div
          className="mt-1 rounded-r-md py-1.5 pr-2"
          style={{
            paddingLeft: CMD.padL,
            borderLeft: `${CMD.border}px solid ${CMD.accentPine}`,
            backgroundColor: derived.kpiBandBusinessLight,
          }}
        >
          <p className="text-[13px] leading-snug font-medium" style={{ color: CMD.textBody }}>
            {commandText || "—"}
          </p>
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: CMD.textLabel }}>
          What we found
        </div>
        <div
          className="mt-1 rounded-r-md py-1.5 pr-2"
          style={{
            paddingLeft: CMD.padL,
            borderLeft: `${CMD.border}px solid ${CMD.accentPine}`,
            backgroundColor: CMD.bgFound,
          }}
        >
          <ul className="list-disc space-y-0.5 pl-3.5 text-[13px] leading-snug" style={{ color: CMD.textBody }}>
            {found.map((line, i) => (
              <li key={i} className="pl-0.5">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AIOutcomeSection(props: { planner?: JobOverviewPlannerSuccess | null; kind: ResponseKind }) {
  const { planner, kind } = props;
  if (!planner && kind !== "applied_success") return null;

  const title =
    kind === "applied_success"
      ? "Result"
      : kind === "no_op" || kind === "unresolved_only"
        ? "No layout change"
        : "Changes:";

  let body: ReactNode;
  if (kind === "applied_success") {
    body = (
      <p className="text-[13px] leading-snug" style={{ color: CMD.textBody }}>
        Saved. Raw response under <span className="font-medium">Technical details</span>.
      </p>
    );
  } else if (planner) {
    if (planner.effective_layout_change) {
      const lines = formatDiffSummaryHuman(planner.diff_summary);
      body = (
        <ul className="list-disc space-y-0.5 pl-3.5 text-[13px] leading-snug">
          {lines.map((line, i) => (
            <li key={i} className="pl-0.5" style={{ color: CMD.textBody }}>
              {line}
            </li>
          ))}
        </ul>
      );
    } else {
      body = (
        <p className="text-[13px] leading-snug" style={{ color: CMD.textSupporting }}>
          No changes needed — layout already matches. Apply anyway only bumps version / audit.
        </p>
      );
    }
  } else {
    body = null;
  }

  const isDiff = Boolean(planner?.effective_layout_change && kind !== "applied_success");
  const isNoopOutcome = Boolean(
    planner && !planner.effective_layout_change && (kind === "no_op" || kind === "unresolved_only")
  );

  return (
    <div className="mt-3">
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: CMD.textLabel }}>
        {title}
      </div>
      <div
        className="mt-1 rounded-r-md py-1.5 pr-2"
        style={{
          paddingLeft: isDiff ? CMD.padL : 10,
          borderLeft: isDiff ? `${CMD.border}px solid ${CMD.accentGreen}` : "none",
          backgroundColor: isDiff ? CMD.bgChanges : isNoopOutcome ? CMD.bgNoop : derived.inspectorRailWash,
        }}
      >
        {body}
      </div>
    </div>
  );
}

function AIUnresolvedSection(props: { planner: JobOverviewPlannerSuccess }) {
  const { planner } = props;
  const unresolved = planner.resolution.unresolved_targets ?? [];
  if (unresolved.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: CMD.textLabel }}>
        Not on the overview
      </div>
      <div
        className="mt-1 rounded-r-md py-1.5 pr-2 text-[13px]"
        style={{
          paddingLeft: CMD.padL,
          borderLeft: `${CMD.border}px solid ${CMD.accentAmber}`,
          backgroundColor: CMD.bgUnresolved,
        }}
      >
        <ul className="list-disc space-y-0.5 pl-3.5 leading-snug">
          {unresolved.map((u) => (
            <li key={`${u.concept_id}:${u.phrase_matched}`} className="pl-0.5">
              <span className="font-medium capitalize" style={{ color: CMD.textBody }}>
                {u.concept_id}
              </span>
              <span style={{ color: CMD.textSupporting }}> — {u.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AIAdvancedDetailsDrawer(props: {
  open: boolean;
  onToggle: () => void;
  planner?: JobOverviewPlannerSuccess | null;
  structuredOverrideJson?: string;
  applyResultJson?: string;
  errorDetailJson?: string;
}) {
  const { open, onToggle, planner, structuredOverrideJson, applyResultJson, errorDetailJson } = props;
  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${derived.border}` }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between rounded-md border border-dashed px-2.5 py-1.5 text-[10px] font-medium"
        style={{
          borderColor: derived.border,
          backgroundColor: "transparent",
          color: CMD.textSupporting,
        }}
      >
        <span>Technical details</span>
        <span aria-hidden className="text-[10px] uppercase tracking-wider">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open ? (
        <div className="mt-2 grid gap-2 max-h-[min(240px,40vh)] overflow-y-auto pr-1">
          {planner ? (
            <div className="rounded-md border p-2 text-[11px]" style={{ borderColor: derived.border, backgroundColor: neutral.surface }}>
              <div className="font-semibold mb-1 opacity-70" style={{ color: derived.textSecondary }}>
                Parsed intent (JSON)
              </div>
              <pre className="overflow-auto font-mono leading-relaxed opacity-90" style={{ color: derived.textSecondary }}>
                {safeJson(planner.parsed_intent)}
              </pre>
            </div>
          ) : null}
          {planner?.rationale?.length ? (
            <div className="rounded-md border p-2 text-[11px]" style={{ borderColor: derived.border, backgroundColor: neutral.surface }}>
              <div className="font-semibold mb-1 opacity-70" style={{ color: derived.textSecondary }}>
                Planner rationale
              </div>
              <ul className="list-disc pl-4 space-y-0.5" style={{ color: derived.textSecondary }}>
                {planner.rationale.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {planner ? (
            <div className="rounded-md border p-2 text-[11px]" style={{ borderColor: derived.border, backgroundColor: neutral.surface }}>
              <div className="font-semibold mb-1 opacity-70" style={{ color: derived.textSecondary }}>
                Diff summary (JSON)
              </div>
              <pre className="overflow-auto font-mono leading-relaxed opacity-90" style={{ color: derived.textSecondary }}>
                {safeJson(planner.diff_summary)}
              </pre>
            </div>
          ) : null}
          {structuredOverrideJson ? (
            <div className="rounded-md border p-2 text-[11px]" style={{ borderColor: derived.border, backgroundColor: neutral.surface }}>
              <div className="font-semibold mb-1 opacity-70" style={{ color: derived.textSecondary }}>
                structured_override (apply payload)
              </div>
              <pre className="overflow-auto font-mono leading-relaxed opacity-90" style={{ color: derived.textSecondary }}>
                {structuredOverrideJson}
              </pre>
            </div>
          ) : null}
          {applyResultJson ? (
            <div className="rounded-md border p-2 text-[11px]" style={{ borderColor: derived.border, backgroundColor: neutral.surface }}>
              <div className="font-semibold mb-1 opacity-70" style={{ color: derived.textSecondary }}>
                Apply response (JSON)
              </div>
              <pre className="overflow-auto font-mono leading-relaxed opacity-90" style={{ color: derived.textSecondary }}>
                {applyResultJson}
              </pre>
            </div>
          ) : null}
          {errorDetailJson ? (
            <div className="rounded-md border p-2 text-[11px]" style={{ borderColor: derived.border, backgroundColor: neutral.surface }}>
              <div className="font-semibold mb-1 opacity-70" style={{ color: derived.textSecondary }}>
                Error detail (JSON)
              </div>
              <pre className="overflow-auto font-mono leading-relaxed opacity-90" style={{ color: derived.textSecondary }}>
                {errorDetailJson}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AIWhatsNextSection(props: { kind: ResponseKind }) {
  const { kind } = props;
  let line: string;
  if (kind === "loading") {
    line = "Hang tight — finishing preview or apply.";
  } else if (kind === "error") {
    line = "Adjust and preview again.";
  } else if (kind === "applied_success") {
    line = "Done — or preview another change.";
  } else if (kind === "action_preview") {
    line = "Apply, or refine the command.";
  } else {
    line = "Refine, or apply for audit-only version bump.";
  }
  return (
    <div className="mt-3 border-t pt-2.5" style={{ borderColor: derived.border }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: CMD.textLabel }}>
        Next
      </div>
      <p className="mt-1 text-[12px] leading-snug font-medium" style={{ color: CMD.textBody }}>
        {line}
      </p>
    </div>
  );
}

function AISuggestedActionsRow(props: {
  kind: ResponseKind;
  applyBlockedByNoop: boolean;
  applyAnyway: boolean;
  onToggleApplyAnyway: (v: boolean) => void;
  onRefine: () => void;
}) {
  const { kind, applyBlockedByNoop, applyAnyway, onToggleApplyAnyway, onRefine } = props;
  const showApplyAnyway = kind === "no_op" || kind === "unresolved_only";
  const showNoopNote = showApplyAnyway;
  return (
    <div className="mt-2">
      {showNoopNote ? (
        <p className="text-[11px] leading-snug" style={{ color: CMD.textSupporting }}>
          No layout diff — check <span className="font-medium" style={{ color: CMD.textBody }}>Apply anyway</span> below
          only for an audit-only save.
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          onClick={onRefine}
          className="text-[12px] font-semibold underline-offset-2 hover:underline"
          style={{ color: palette.alloyBlue }}
        >
          Refine
        </button>
        {showApplyAnyway ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: CMD.textSupporting }}>
            <input
              type="checkbox"
              className="h-3 w-3 shrink-0 rounded border opacity-80"
              style={{ borderColor: derived.border }}
              checked={applyAnyway}
              onChange={(e) => onToggleApplyAnyway(e.target.checked)}
              aria-label="Apply anyway (no layout diff)"
            />
            <span>
              Apply anyway
              {applyBlockedByNoop && !applyAnyway ? (
                <span className="text-[9px] opacity-80"> — enables Apply</span>
              ) : null}
            </span>
          </label>
        ) : null}
        <a
          href="/admin/agent-lab"
          className="text-[10px] underline-offset-2 hover:underline ml-auto opacity-90"
          style={{ color: CMD.textSupporting }}
          title="Agent Lab"
        >
          AI Activity
        </a>
      </div>
    </div>
  );
}

function AIPrimaryActionsRow(props: {
  kind: ResponseKind;
  canApply: boolean;
  onApply: () => void;
  onDismiss: () => void;
  applying: boolean;
}) {
  const { kind, canApply, onApply, onDismiss, applying } = props;
  const showApplyHint =
    !canApply &&
    (kind === "action_preview" || kind === "no_op" || kind === "unresolved_only");
  return (
    <div
      className={`mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-center ${canApply || !showApplyHint ? "sm:justify-end" : "sm:justify-between"}`}
    >
      {showApplyHint ? (
        <p className="order-2 sm:order-1 min-w-0 flex-1 text-[10px] leading-snug sm:max-w-[min(100%,26rem)]" style={{ color: CMD.textSupporting }}>
          Need a diff to apply, or <span className="font-medium" style={{ color: CMD.textBody }}>Apply anyway</span> for
          audit-only.
        </p>
      ) : null}
      <div className="order-1 sm:order-2 flex shrink-0 items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border px-3 py-1.5 text-[12px] font-semibold"
          style={{ borderColor: derived.border, backgroundColor: neutral.surface, color: neutral.textPrimary }}
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={!canApply || applying}
          onClick={onApply}
          className="rounded-md px-4 py-2 text-[12px] font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: brand.secondary,
            color: neutral.surface,
            letterSpacing: "0.06em",
            boxShadow: `0 1px 6px rgba(0, 162, 131, 0.22)`,
          }}
        >
          {applying ? "Applying…" : "Apply"}
        </button>
      </div>
    </div>
  );
}

export default function AICommandSurfaceShell() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [commandText, setCommandText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [applyAnyway, setApplyAnyway] = useState(false);
  const [viewportH, setViewportH] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 900);

  const [response, setResponse] = useState<ResponseModel | null>(null);
  const [structuredOverrideJson, setStructuredOverrideJson] = useState<string>("");

  const activePlanner = response?.plannerOk ?? null;
  const applyBlockedByNoop = shouldBlockSemanticNoopApply({
    previewRoute: "v1",
    semanticPlanner: activePlanner,
    applySemanticNoopAnyway: applyAnyway,
  });

  const canApply = Boolean(structuredOverrideJson) && !applyBlockedByNoop && (response?.kind === "action_preview" || response?.kind === "no_op" || response?.kind === "unresolved_only");

  const panelMaxHeight = useMemo(() => {
    return clampExpandedHeightPx(viewportH);
  }, [viewportH]);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const runPreview = useCallback(async () => {
    const t = commandText.trim();
    if (!t) return;

    // replace-not-stack: wipe prior content and show loading
    setExpanded(true);
    setBusy(true);
    setAdvancedOpen(false);
    setApplyAnyway(false);
    setStructuredOverrideJson("");
    setResponse({
      kind: "loading",
      headline: "Working on your request…",
      confidence: "in_progress",
      subline: "Building preview…",
    });

    try {
      const cfg = await loadCurrentJobOverviewConfig();
      const prev = runOverviewLayoutSemanticPreview(t, cfg);
      if (!prev.ok) {
        setResponse({
          kind: "error",
          headline: "Couldn’t build a preview",
          subline: prev.error,
          confidence: "error",
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
        plannerOk: planner,
        structuredOverrideJson: structuredJson,
      });
    } catch (e) {
      setResponse({
        kind: "error",
        headline: "Preview failed",
        subline: e instanceof Error ? e.message : "Request failed",
        confidence: "error",
        errorDetailJson: safeJson({ message: e instanceof Error ? e.message : String(e) }),
      });
    } finally {
      setBusy(false);
    }
  }, [commandText]);

  const apply = useCallback(async () => {
    if (!structuredOverrideJson) return;
    if (applyBlockedByNoop) return;

    setBusy(true);
    setAdvancedOpen(false);
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
          message: "AdminV2 AI command surface",
          structured_override,
        }),
      });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        setResponse({
          kind: "error",
          headline: "Apply failed",
          subline: `HTTP ${res.status}`,
          confidence: "error",
          plannerOk: activePlanner,
          structuredOverrideJson,
          errorDetailJson: safeJson(data),
        });
        return;
      }
      setResponse({
        kind: "applied_success",
        headline: "Changes applied",
        subline: "Saved.",
        confidence: "applied",
        applyResultJson: safeJson(data),
        plannerOk: activePlanner,
        structuredOverrideJson,
      });
    } catch (e) {
      setResponse({
        kind: "error",
        headline: "Apply failed",
        subline: e instanceof Error ? e.message : "Request failed",
        confidence: "error",
        plannerOk: activePlanner,
        structuredOverrideJson,
        errorDetailJson: safeJson({ message: e instanceof Error ? e.message : String(e) }),
      });
    } finally {
      setBusy(false);
    }
  }, [structuredOverrideJson, applyBlockedByNoop, activePlanner]);

  const dismiss = useCallback(() => {
    setExpanded(false);
    setAdvancedOpen(false);
  }, []);

  const refine = useCallback(() => {
    setExpanded(true);
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(commandText.length, commandText.length);
  }, [commandText]);

  const showPanel = expanded && response != null;

  return (
    <SurfaceCard expanded={showPanel}>
      {showPanel ? (
        <div
          className="rounded-t-xl overflow-hidden"
          style={{
            maxHeight: panelMaxHeight,
            borderTop: `2px solid ${derived.adminV2AiBarPineBorder}`,
            backgroundColor: neutral.surface,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.85)`,
          }}
        >
          <div
            className="px-3 pt-2 pb-2"
            style={{
              borderBottom: `1px solid ${derived.border}`,
              background: `linear-gradient(180deg, ${derived.kpiBandBusinessLight} 0%, ${derived.inspectorCommandRailWash} 55%, ${neutral.surface} 100%)`,
            }}
          >
            <AIResponseHeader
              headline={response.headline}
              subline={response.subline}
              confidence={response.confidence}
            />
          </div>

          <div
            className="px-3 py-2 overflow-auto"
            style={{ maxHeight: panelMaxHeight - COLLAPSED_MIN_H, backgroundColor: neutral.background }}
          >
            {response.plannerOk ? (
              <AISummarySection planner={response.plannerOk} commandText={commandText.trim()} />
            ) : null}

            <AIOutcomeSection planner={response.plannerOk ?? null} kind={response.kind} />

            {response.plannerOk ? <AIUnresolvedSection planner={response.plannerOk} /> : null}

            {response.kind === "error" ? (
              <div className="mt-3 rounded-r-md py-1.5 pr-2 text-[13px]" style={{ paddingLeft: CMD.padL, backgroundColor: CMD.bgNoop }}>
                <p style={{ color: CMD.textBody }}>{response.subline ?? "Something went wrong."}</p>
                <p className="mt-0.5 text-[11px]" style={{ color: CMD.textSupporting }}>
                  Details under Technical details.
                </p>
              </div>
            ) : null}

            <AIWhatsNextSection kind={response.kind} />

            <AISuggestedActionsRow
              kind={response.kind}
              applyBlockedByNoop={applyBlockedByNoop}
              applyAnyway={applyAnyway}
              onToggleApplyAnyway={setApplyAnyway}
              onRefine={refine}
            />

            <AIPrimaryActionsRow
              kind={response.kind}
              canApply={canApply}
              applying={busy && response.kind === "loading" && Boolean(structuredOverrideJson)}
              onApply={() => void apply()}
              onDismiss={dismiss}
            />

            {response.kind !== "loading" &&
            (response.plannerOk || structuredOverrideJson || response.errorDetailJson || response.applyResultJson) ? (
              <AIAdvancedDetailsDrawer
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

      <div className={`flex items-end gap-2 ${showPanel ? "mt-0" : "mt-2"}`}>
        <div
          className={`flex-1 min-w-0 border-2 bg-white px-3 py-2 ${showPanel ? "rounded-b-xl rounded-t-none border-t border-t-[rgba(0,0,0,0.06)]" : "rounded-2xl px-3.5 py-2.5"}`}
          style={{
            borderColor: derived.adminV2AiInputPineRing,
            boxShadow: showPanel ? `inset 0 1px 0 rgba(255,255,255,0.95)` : `0 1px 0 rgba(0, 162, 131, 0.06), inset 0 1px 0 rgba(255,255,255,0.9)`,
          }}
        >
          <textarea
            ref={inputRef}
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            onFocus={() => setExpanded((e) => e || Boolean(response))}
            placeholder="Command: configure job overview… (e.g. “make the overview more customer-focused”)"
            className="w-full resize-none bg-transparent outline-none text-sm leading-snug"
            rows={1}
            style={{ color: neutral.textPrimary }}
            aria-label="AI command input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!busy) void runPreview();
              }
            }}
          />
          <div className="mt-0.5 text-[10px] leading-tight" style={{ color: CMD.textSupporting }}>
            Job overview only · Enter to preview
          </div>
        </div>
        <button
          type="button"
          disabled={busy || !commandText.trim()}
          onClick={() => void runPreview()}
          className="shrink-0 rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
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
    </SurfaceCard>
  );
}

