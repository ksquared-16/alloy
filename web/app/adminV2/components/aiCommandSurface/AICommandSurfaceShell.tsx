"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
const COLLAPSED_MIN_H = 56;
const EXPANDED_MAX_H = 520;

function safeJson(x: unknown): string {
  return JSON.stringify(x, null, 2);
}

function clampExpandedHeightPx(viewportH: number): number {
  // v1: keep the workspace visible behind; internal scroll inside the response body.
  return Math.max(320, Math.min(EXPANDED_MAX_H, Math.round(viewportH * 0.55)));
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
        paddingTop: expanded ? 12 : 10,
        paddingBottom: 10,
        background: `linear-gradient(180deg, ${derived.adminV2AiBarPineWash} 0%, ${neutral.surface} 38%, ${neutral.surface} 100%)`,
        borderTop: `2px solid ${derived.adminV2AiBarPineBorder}`,
        boxShadow: `0 -4px 18px rgba(0, 162, 131, 0.07), ${derived.panelShadow}`,
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
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-snug" style={{ color: neutral.textPrimary }}>
          {headline}
        </div>
        {subline ? (
          <div className="mt-1 text-xs leading-snug" style={{ color: derived.textSecondary }}>
            {subline}
          </div>
        ) : null}
      </div>
      <div
        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
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
    <div className="mt-1 space-y-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: derived.inspectorSectionMuted }}>
          Your request
        </div>
        <p className="mt-2 text-sm leading-relaxed pl-3 border-l-2" style={{ borderColor: brand.secondary, color: neutral.textPrimary }}>
          {commandText || "—"}
        </p>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: derived.inspectorSectionMuted }}>
          What we found
        </div>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-snug" style={{ color: derived.textSecondary }}>
          {found.map((line, i) => (
            <li key={i} style={{ color: neutral.textPrimary }}>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AIOutcomeSection(props: { planner?: JobOverviewPlannerSuccess | null; kind: ResponseKind }) {
  const { planner, kind } = props;
  if (!planner && kind !== "applied_success") return null;

  const title =
    kind === "applied_success"
      ? "What happened"
      : kind === "no_op" || kind === "unresolved_only"
        ? "Why nothing will change"
        : "What will change";

  let body: ReactNode;
  if (kind === "applied_success") {
    body = (
      <p className="text-sm leading-relaxed" style={{ color: neutral.textPrimary }}>
        Your job overview layout update was saved. Full response details stay under{" "}
        <span className="font-medium">Technical details</span> if you need to inspect them.
      </p>
    );
  } else if (planner) {
    if (planner.effective_layout_change) {
      const lines = formatDiffSummaryHuman(planner.diff_summary);
      body = (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-snug">
          {lines.map((line, i) => (
            <li key={i} style={{ color: neutral.textPrimary }}>
              {line}
            </li>
          ))}
        </ul>
      );
    } else {
      body = (
        <p className="text-sm leading-relaxed" style={{ color: derived.textSecondary }}>
          The preview matches your current layout, so there is nothing new to write. Applying anyway would only create a
          new version/audit entry with the same shape.
        </p>
      );
    }
  } else {
    body = null;
  }

  return (
    <div className="mt-4">
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: derived.inspectorSectionMuted }}>
        {title}
      </div>
      <div className="mt-2 rounded-xl border px-3 py-2.5" style={{ borderColor: derived.border, backgroundColor: neutral.surface }}>
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
    <div className="mt-4">
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: derived.inspectorSectionMuted }}>
        What we couldn’t place on the overview
      </div>
      <div className="mt-2 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: derived.border, backgroundColor: derived.inspectorRailWash }}>
        <ul className="list-disc space-y-1.5 pl-5 leading-snug">
          {unresolved.map((u) => (
            <li key={`${u.concept_id}:${u.phrase_matched}`} style={{ color: neutral.textPrimary }}>
              <span className="font-medium capitalize">{u.concept_id}</span>
              <span style={{ color: derived.textSecondary }}> — {u.reason}</span>
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
    <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${derived.border}` }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-[11px] font-medium"
        style={{
          borderColor: derived.border,
          backgroundColor: "transparent",
          color: derived.textSecondary,
        }}
      >
        <span>Technical details (for inspection)</span>
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
    line = "Wait for the preview or apply to finish.";
  } else if (kind === "error") {
    line = "Fix the issue or adjust your request, then preview again.";
  } else if (kind === "applied_success") {
    line = "You’re done here, or run another preview to keep iterating.";
  } else if (kind === "action_preview") {
    line = "Review the summary, then apply or refine your wording.";
  } else {
    line = "Refine your request, or apply only if you want a new version for audit.";
  }
  return (
    <div className="mt-4">
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: derived.inspectorSectionMuted }}>
        What you can do next
      </div>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: derived.textSecondary }}>
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
    <div className="mt-3">
      {showNoopNote ? (
        <div
          className="rounded-lg border border-dashed px-3 py-2 text-[11px] leading-snug"
          style={{
            borderColor: derived.border,
            backgroundColor: "transparent",
            color: derived.textSecondary,
          }}
        >
          This preview does not change layout shape. Use{" "}
          <span className="font-semibold" style={{ color: palette.juniperEmber }}>
            Apply anyway
          </span>{" "}
          only if you intentionally want a new saved version / audit entry.
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onRefine}
          className="text-sm font-semibold underline-offset-2 hover:underline"
          style={{ color: palette.alloyBlue }}
        >
          Refine request
        </button>
        {showApplyAnyway ? (
          <label
            className="flex cursor-pointer items-center gap-2 rounded-md border-2 px-3 py-2 text-xs font-semibold"
            style={{
              borderColor: palette.juniperEmber,
              backgroundColor: "rgba(188, 67, 0, 0.06)",
              color: neutral.textPrimary,
            }}
          >
            <input
              type="checkbox"
              checked={applyAnyway}
              onChange={(e) => onToggleApplyAnyway(e.target.checked)}
              aria-label="Apply anyway"
            />
            <span>Apply anyway (exceptional)</span>
            {applyBlockedByNoop && !applyAnyway ? (
              <span className="text-[10px] font-normal" style={{ color: derived.textSecondary }}>
                Required to enable Apply
              </span>
            ) : null}
          </label>
        ) : null}
        <a
          href="/admin/agent-lab"
          className="text-[11px] underline-offset-2 hover:underline ml-auto"
          style={{ color: derived.textSecondary }}
          title="Opens Agent Lab (AI Activity scaffolding)"
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
      className={`mt-5 flex flex-col gap-2 sm:flex-row sm:items-center ${canApply || !showApplyHint ? "sm:justify-end" : "sm:justify-between"}`}
    >
      {showApplyHint ? (
        <p className="order-2 sm:order-1 min-w-0 flex-1 text-[11px] leading-snug sm:max-w-[min(100%,28rem)]" style={{ color: derived.textSecondary }}>
          Apply needs a layout diff, or enable <span className="font-medium">Apply anyway</span> for a no-op version bump.
        </p>
      ) : null}
      <div className="order-1 sm:order-2 flex shrink-0 items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: derived.border, backgroundColor: neutral.surface, color: neutral.textPrimary }}
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={!canApply || applying}
          onClick={onApply}
          className="rounded-lg px-5 py-2.5 text-sm font-bold uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: brand.secondary,
            color: neutral.surface,
            letterSpacing: "0.08em",
            boxShadow: `0 2px 10px rgba(0, 162, 131, 0.28)`,
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
      subline: "Preparing a job overview preview.",
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
            subline: "Applying the job overview update.",
            confidence: "in_progress",
          }
        : {
            kind: "loading",
            headline: "Working on your request…",
            subline: "Applying the job overview update.",
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
        subline: "Saved to the job overview layout.",
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
          className="rounded-2xl border bg-white/80 backdrop-blur-sm"
          style={{
            borderColor: derived.border,
            boxShadow: derived.cardShadow,
            maxHeight: panelMaxHeight,
          }}
        >
          <div
            className="px-4 pt-3 pb-3"
            style={{
              borderBottom: `1px solid ${derived.border}`,
              background: `linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 100%)`,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
            }}
          >
            <AIResponseHeader
              headline={response.headline}
              subline={response.subline}
              confidence={response.confidence}
            />
          </div>

          <div className="px-4 py-3 overflow-auto" style={{ maxHeight: panelMaxHeight - COLLAPSED_MIN_H }}>
            {response.plannerOk ? (
              <AISummarySection planner={response.plannerOk} commandText={commandText.trim()} />
            ) : null}

            <AIOutcomeSection planner={response.plannerOk ?? null} kind={response.kind} />

            {response.plannerOk ? <AIUnresolvedSection planner={response.plannerOk} /> : null}

            {response.kind === "error" ? (
              <div className="mt-4 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: derived.border, backgroundColor: derived.inspectorRailWash }}>
                <p style={{ color: neutral.textPrimary }}>{response.subline ?? "Something went wrong."}</p>
                <p className="mt-1 text-xs" style={{ color: derived.textSecondary }}>
                  Open technical details below if you need the raw response for support or debugging.
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

      <div className="mt-2 flex items-end gap-2">
        <div
          className="flex-1 min-w-0 rounded-2xl px-3.5 py-2.5 border-2 bg-white"
          style={{
            borderColor: derived.adminV2AiInputPineRing,
            boxShadow: `0 1px 0 rgba(0, 162, 131, 0.06), inset 0 1px 0 rgba(255,255,255,0.9)`,
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
          <div className="mt-1 text-[11px]" style={{ color: derived.textSecondary }}>
            Overview configuration assistant (job overview only). Press Enter to preview. No transcript.
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

