"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { neutral, derived, brand, semantic, palette } from "@/styles/tokens/colors";
import type { JobOverviewPlannerSuccess, JobOverviewPlannerFailure } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import { runOverviewLayoutSemanticPreview } from "@/lib/admin/agentLab/overviewLayoutSemanticAssistant";
import { shouldBlockSemanticNoopApply } from "@/lib/admin/agentLab/semanticOverviewNoopSummary";
import {
  badgeLabel,
  confidenceFromPlanner,
  headlineForPreview,
  type AIConfidence,
  type ResponseKind,
} from "@/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel";

type ResponseModel = {
  kind: ResponseKind;
  headline: string;
  subline?: string;
  confidence: AIConfidence;
  /** Present for preview success. */
  plannerOk?: JobOverviewPlannerSuccess | null;
  /** Present for preview failure. */
  plannerErr?: JobOverviewPlannerFailure | null;
  /** Present for preview success (apply payload). */
  structuredOverrideJson?: string;
  /** Present for apply result JSON. */
  applyResultJson?: string;
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

function SurfaceCard(props: { children: React.ReactNode; expanded: boolean }) {
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

function AIResponseHeader(props: { headline: string; subline?: string; confidence: AIConfidence }) {
  const { headline, subline, confidence } = props;
  const badgeBg =
    confidence === "clear_match"
      ? "rgba(0, 162, 131, 0.14)"
      : confidence === "partial_match"
        ? "rgba(188, 67, 0, 0.12)"
        : "rgba(188, 67, 0, 0.09)";
  const badgeText =
    confidence === "clear_match"
      ? semantic.success
      : confidence === "partial_match"
        ? semantic.warning
        : palette.juniperEmber;
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
        aria-label={`Confidence: ${badgeLabel(confidence)}`}
      >
        {badgeLabel(confidence)}
      </div>
    </div>
  );
}

function AIUnderstoodSection(props: { planner: JobOverviewPlannerSuccess; commandText: string }) {
  const { planner, commandText } = props;
  return (
    <div className="mt-3">
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: derived.inspectorSectionMuted }}>
        What I understood
      </div>
      <div className="mt-2 grid gap-2 text-xs" style={{ color: neutral.textPrimary }}>
        <div className="rounded-lg border bg-white/85 p-2.5" style={{ borderColor: derived.border }}>
          <div className="font-medium" style={{ color: neutral.textPrimary }}>
            Command
          </div>
          <div className="mt-0.5 font-mono text-[11px]" style={{ color: derived.textSecondary }}>
            {commandText}
          </div>
        </div>
        <div className="rounded-lg border bg-white/85 p-2.5" style={{ borderColor: derived.border }}>
          <div className="font-medium">Parsed intent</div>
          <pre className="mt-1 overflow-auto font-mono text-[11px] leading-relaxed" style={{ color: derived.textSecondary }}>
            {safeJson(planner.parsed_intent)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function AIChangeSummarySection(props: { planner?: JobOverviewPlannerSuccess | null; kind: ResponseKind; applyResultJson?: string }) {
  const { planner, kind, applyResultJson } = props;
  const title =
    kind === "applied_success"
      ? "What happened"
      : kind === "no_op" || kind === "unresolved_only"
        ? "What will change"
        : "What will change";
  return (
    <div className="mt-3">
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: derived.inspectorSectionMuted }}>
        {title}
      </div>
      <div className="mt-2 rounded-lg border bg-white/85 p-2.5 text-xs" style={{ borderColor: derived.border, color: derived.textSecondary }}>
        {kind === "applied_success" ? (
          <pre className="overflow-auto font-mono text-[11px] leading-relaxed">{applyResultJson ?? ""}</pre>
        ) : planner ? (
          planner.effective_layout_change ? (
            <pre className="overflow-auto font-mono text-[11px] leading-relaxed">{safeJson(planner.diff_summary)}</pre>
          ) : (
            <div>
              No meaningful layout diff is proposed. Applying would mainly bump the stored config version / audit trail.
            </div>
          )
        ) : (
          <div>—</div>
        )}
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
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: derived.inspectorSectionMuted }}>
        What I couldn’t place
      </div>
      <div className="mt-2 rounded-lg border bg-white/85 p-2.5 text-xs" style={{ borderColor: derived.border, color: neutral.textPrimary }}>
        <ul className="list-disc pl-4 space-y-1">
          {unresolved.map((u) => (
            <li key={`${u.concept_id}:${u.phrase_matched}`}>
              <span className="font-mono text-[11px]" style={{ color: neutral.textPrimary }}>
                {u.concept_id}
              </span>{" "}
              — <span style={{ color: derived.textSecondary }}>{u.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AIAdvancedDetailsDrawer(props: { open: boolean; onToggle: () => void; planner?: JobOverviewPlannerSuccess | null; structuredOverrideJson?: string }) {
  const { open, onToggle, planner, structuredOverrideJson } = props;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold"
        style={{
          borderColor: derived.border,
          backgroundColor: derived.inspectorRailWash,
          color: neutral.textPrimary,
        }}
      >
        <span>Advanced details</span>
        <span aria-hidden style={{ color: derived.textSecondary }}>
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open ? (
        <div className="mt-2 grid gap-2">
          {planner?.rationale?.length ? (
            <div className="rounded-lg border bg-white/85 p-2.5 text-xs" style={{ borderColor: derived.border }}>
              <div className="font-semibold mb-1" style={{ color: neutral.textPrimary }}>
                Rationale
              </div>
              <ul className="list-disc pl-4 space-y-1" style={{ color: derived.textSecondary }}>
                {planner.rationale.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {planner ? (
            <div className="rounded-lg border bg-white/85 p-2.5 text-xs" style={{ borderColor: derived.border }}>
              <div className="font-semibold mb-1" style={{ color: neutral.textPrimary }}>
                Diff summary
              </div>
              <pre className="overflow-auto font-mono text-[11px] leading-relaxed" style={{ color: derived.textSecondary }}>
                {safeJson(planner.diff_summary)}
              </pre>
            </div>
          ) : null}
          {structuredOverrideJson ? (
            <div className="rounded-lg border bg-white/85 p-2.5 text-xs" style={{ borderColor: derived.border }}>
              <div className="font-semibold mb-1" style={{ color: neutral.textPrimary }}>
                structured_override (v1 apply payload)
              </div>
              <pre className="overflow-auto font-mono text-[11px] leading-relaxed" style={{ color: derived.textSecondary }}>
                {structuredOverrideJson}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
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
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: derived.border,
            backgroundColor: derived.inspectorRailWash,
            color: derived.textSecondary,
          }}
        >
          No-op preview: applying is optional and will create a version/audit entry even if the layout shape is unchanged.
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRefine}
        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
        style={{ borderColor: derived.border, backgroundColor: "rgba(255,255,255,0.86)", color: neutral.textPrimary }}
      >
        Refine request
      </button>
      <a
        href="/admin/agent-lab"
        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
        style={{ borderColor: derived.border, backgroundColor: "rgba(255,255,255,0.86)", color: neutral.textPrimary }}
        title="Temporary bridge: opens internal AI Activity scaffolding (Agent Config Lab)"
      >
        Open AI Activity
      </a>
      {showApplyAnyway ? (
        <label
          className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold"
          style={{ borderColor: derived.border, backgroundColor: "rgba(255,255,255,0.86)", color: neutral.textPrimary }}
        >
          <input
            type="checkbox"
            checked={applyAnyway}
            onChange={(e) => onToggleApplyAnyway(e.target.checked)}
            aria-label="Apply anyway"
          />
          <span>Apply anyway</span>
          {applyBlockedByNoop && !applyAnyway ? (
            <span className="text-[11px]" style={{ color: derived.textSecondary }}>
              (enables Apply)
            </span>
          ) : null}
        </label>
      ) : null}
      </div>
    </div>
  );
}

function AIPrimaryActionsRow(props: {
  canApply: boolean;
  onApply: () => void;
  onDismiss: () => void;
  applying: boolean;
}) {
  const { canApply, onApply, onDismiss, applying } = props;
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-lg border px-3 py-2 text-xs font-semibold"
        style={{ borderColor: derived.border, backgroundColor: "rgba(255,255,255,0.86)", color: neutral.textPrimary }}
      >
        Dismiss
      </button>
      {!canApply ? (
        <div className="text-[11px] text-right leading-snug" style={{ color: derived.textSecondary }}>
          Apply is disabled because this preview has no effective layout diff. Use “Apply anyway” if you really want a version/audit entry.
        </div>
      ) : null}
      <button
        type="button"
        disabled={!canApply || applying}
        onClick={onApply}
        className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: brand.secondary,
          color: neutral.surface,
          letterSpacing: "0.14em",
          boxShadow: `0 2px 8px rgba(0, 162, 131, 0.25)`,
        }}
      >
        {applying ? "Applying…" : "Apply"}
      </button>
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
      confidence: "clear_match",
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
          confidence: "blocked",
          plannerErr: prev.planner,
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
        confidence: confidenceFromPlanner(planner),
        plannerOk: planner,
        structuredOverrideJson: structuredJson,
      });
    } catch (e) {
      setResponse({
        kind: "error",
        headline: "Preview failed",
        subline: e instanceof Error ? e.message : "Request failed",
        confidence: "blocked",
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
            confidence: r.confidence,
          }
        : {
            kind: "loading",
            headline: "Working on your request…",
            subline: "Applying the job overview update.",
            confidence: "clear_match",
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
          confidence: "blocked",
          applyResultJson: safeJson(data),
          plannerOk: activePlanner,
          structuredOverrideJson,
        });
        return;
      }
      setResponse({
        kind: "applied_success",
        headline: "Changes applied",
        subline: "Review full history and audit details in AI Activity.",
        confidence: "clear_match",
        applyResultJson: safeJson(data),
        plannerOk: activePlanner,
        structuredOverrideJson,
      });
    } catch (e) {
      setResponse({
        kind: "error",
        headline: "Apply failed",
        subline: e instanceof Error ? e.message : "Request failed",
        confidence: "blocked",
        plannerOk: activePlanner,
        structuredOverrideJson,
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
              <>
                <AIUnderstoodSection planner={response.plannerOk} commandText={commandText.trim()} />
                <AIChangeSummarySection planner={response.plannerOk} kind={response.kind} />
                <AIUnresolvedSection planner={response.plannerOk} />
              </>
            ) : null}

            {response.kind === "error" ? (
              <div
                className="mt-3 rounded-lg border p-2.5 text-xs"
                style={{
                  borderColor: derived.border,
                  backgroundColor: derived.inspectorRailWash,
                }}
              >
                <div className="font-semibold" style={{ color: neutral.textPrimary }}>
                  Error details
                </div>
                <pre className="mt-1 overflow-auto font-mono text-[11px] leading-relaxed" style={{ color: derived.textSecondary }}>
                  {response.applyResultJson ?? (response.plannerErr ? safeJson(response.plannerErr) : "")}
                </pre>
              </div>
            ) : null}

            <AISuggestedActionsRow
              kind={response.kind}
              applyBlockedByNoop={applyBlockedByNoop}
              applyAnyway={applyAnyway}
              onToggleApplyAnyway={setApplyAnyway}
              onRefine={refine}
            />

            <AIPrimaryActionsRow
              canApply={canApply}
              applying={busy && response.kind === "loading" && Boolean(structuredOverrideJson)}
              onApply={() => void apply()}
              onDismiss={dismiss}
            />

            {(response.plannerOk || structuredOverrideJson) ? (
              <AIAdvancedDetailsDrawer
                open={advancedOpen}
                onToggle={() => setAdvancedOpen((o) => !o)}
                planner={response.plannerOk ?? null}
                structuredOverrideJson={structuredOverrideJson}
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

