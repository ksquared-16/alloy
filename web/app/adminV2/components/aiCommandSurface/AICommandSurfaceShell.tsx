"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { neutral, derived, brand, semantic } from "@/styles/tokens/colors";
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
  plannerOk?: JobOverviewPlannerSuccess | null;
  plannerErr?: JobOverviewPlannerFailure | null;
  structuredOverrideJson?: string;
  applyResultJson?: string;
  errorDetailJson?: string;
};

const BAR_MAX_WIDTH = 840;
const COLLAPSED_MIN_H = 36;
const EXPANDED_MAX_H = 320;

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

function OutcomeZone(props: { headline: string; subline?: string; confidence: AIStatusBadge }) {
  const { headline, subline, confidence } = props;
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
          className="rounded-md px-3.5 py-2 text-[12px] font-bold uppercase tracking-wide disabled:opacity-45 disabled:cursor-not-allowed"
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
        >
          Dismiss
        </button>
      ) : null}

      <a
        href="/admin/agent-lab"
        className="text-[10px] underline-offset-2 hover:underline opacity-80"
        style={{ color: CMD.textSupporting }}
      >
        AI Activity
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
        <span aria-hidden className="uppercase">
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

export default function AICommandSurfaceShell() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [commandText, setCommandText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const panelMaxHeight = useMemo(() => clampExpandedHeightPx(viewportH), [viewportH]);

  const detailsBullets = useMemo(() => {
    if (!response) return [];
    return buildDetailsBullets({
      kind: response.kind,
      planner: response.plannerOk ?? null,
      commandText: commandText.trim(),
      errorSubline: response.kind === "error" ? response.subline : undefined,
    });
  }, [response, commandText]);

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const runPreview = useCallback(async () => {
    const t = commandText.trim();
    if (!t) return;

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
    setDetailsOpen(false);
  }, []);

  const refine = useCallback(() => {
    setExpanded(true);
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(commandText.length, commandText.length);
  }, [commandText]);

  const showPanel = expanded && response != null;

  return (
    <SurfaceCard expanded={showPanel}>
      {showPanel && response ? (
        <div
          className="rounded-t-xl overflow-hidden border-b"
          style={{
            maxHeight: panelMaxHeight,
            borderTop: `2px solid ${derived.adminV2AiBarPineBorder}`,
            borderColor: derived.border,
            backgroundColor: neutral.surface,
          }}
        >
          <OutcomeZone headline={response.headline} subline={response.subline} confidence={response.confidence} />

          <div className="space-y-0 px-3 py-2" style={{ backgroundColor: neutral.background }}>
            <AIActionsRow
              kind={response.kind}
              canApply={canApply}
              applying={busy && response.kind === "loading" && Boolean(structuredOverrideJson)}
              applyBlockedByNoop={applyBlockedByNoop}
              applyAnyway={applyAnyway}
              onToggleApplyAnyway={setApplyAnyway}
              onApply={() => void apply()}
              onDismiss={dismiss}
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
