"use client";

import { useMemo, useLayoutEffect, useRef, useState, useEffect, type ReactNode } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type {
  CrmCompactRowSemanticSlots,
  QueueItemQuickActionVm,
  QueueItemVm,
  QueueRowPlacementPriorityVm,
  QueueRowPlacementPriorityV2Vm,
  QueueVm,
  WorkUnitQueueCrmFactColumnGridVm,
  WorkUnitQueueCrmFactGroupKind,
  WorkUnitQueueCrmFactGroupVm,
  WorkUnitQueueCrmFactLineVm,
  WorkUnitQueueCrmFactPartVm,
} from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import { logAdminV2QueueRowClick } from "@/lib/debug/adminV2QueueRowClickDebug";
import {
  prefetchOpportunityDrawerOnRowIntent,
  prefetchOpportunityDrawerFullOnRowIntent,
  type OpportunityDrawerIntentContext,
} from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { queueRowGrainActionPayload, queueRowGrainContextFromPreviewItem } from "@/lib/queues/queueRowGrainContext";
import { DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS } from "@/lib/ui-v2/queueUiConfig";
import { normalizePreviewLooseDateTokens } from "@/lib/adminFormatters";
import { CRM_COMPACT_VALUE_DOT_SEP } from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import { QUEUE_PREVIEW_BOUNDARY_LABEL } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import { QueueRowPlacementPriorityStrip } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityStrip";
import {
    QueueRowPlacementCandidateContext,
    QueueRowPlacementCandidateMetaChips,
} from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementCandidatePanel";import { QueueRowPlacementManualOrderControls } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementManualOrderControls";
import { QueueRowPlacementPriorityV2Panel } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityV2Panel";
import { WorkUnitQueueLaneRowSkeleton } from "@/components/admin/workspace/WorkUnitQueueCompactRowSkeleton";
import { ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT } from "@/lib/ui-v2/adminV2LoadingGeometry";
import {
    formatPlacementGroupHeaderTitle,
    placementWaitlistGroupRowMode,
} from "@/lib/ui-v2/queuePlacementPriorityPresentation";
import { buildPlacementV2QueueHint } from "@/lib/ui-v2/queuePlacementPriorityV2Presentation";
import { resolveWaitlistQueueItemSectionKey } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import {
  buildWaitlistQueueBlockSectionPlan,
  logWaitlistSectionLive,
  sortWaitlistQueueItemsForDisplay,
  waitlistSectionLiveDiagAttrs,
  WAITLIST_SECTION_LIVE_DIAG_ENABLED,
} from "@/lib/orchestration/placement/waitlistQueueBlockSectionPlan";

type Props = {
  queue: QueueVm;
  onAction: WorkspaceActionHandler;
  /** Visual weight — primary queue is dominant in department view */
  variant?: "primary" | "secondary";
  surface?: "default" | "department" | "work_unit";
  /** Work-unit lane scope — must match drawer open so intent prefetch warms the same bootstrap URL. */
  opportunityDrawerWorkspaceContext?: OpportunityDrawerIntentContext | null;
};

/** Routing context for queue gestures — entity authority lives on GET / resolver after drill. */
function queueRowEntityPayload(queue: QueueVm): Record<string, unknown> {
  const et = queue.queueEntityType;
  if (!et) return {};
  return { entityType: et };
}

function mergeQueueActionPayload(queue: QueueVm, extra?: Record<string, unknown>): Record<string, unknown> | undefined {
  const merged = { ...(extra ?? {}), ...queueRowEntityPayload(queue) };
  return Object.keys(merged).length ? merged : undefined;
}

function queueItemOpportunityId(item: QueueItemVm): string {
  return item.opportunityId?.trim() || item.id;
}

function fireQueueRowOpenRecord(
  queue: QueueVm,
  item: QueueItemVm,
  onAction: WorkspaceActionHandler,
  surface: "card" | "keyboard" | "chip"
) {
  const actionEntityId = queueItemOpportunityId(item);
  logAdminV2QueueRowClick({
    phase: "queue_row_click",
    itemId: actionEntityId,
    actionId: "open_record",
    queueId: queue.id,
    entityType: queue.queueEntityType ?? null,
    handlerReached: `QueueBlock_${surface}`,
  });
  onAction({
    type: "queue.item.action",
    queueId: queue.id,
    itemId: actionEntityId,
    actionId: "open_record",
    payload: mergeQueueActionPayload(queue, queueRowGrainActionPayload(queueRowGrainContextFromPreviewItem(item))),
  });
}

function prefetchOpportunityQueueRowIntent(
  queue: QueueVm,
  itemId: string,
  workspaceContext?: OpportunityDrawerIntentContext | null
): void {
  if (queue.queueEntityType !== "opportunity") return;
  prefetchOpportunityDrawerOnRowIntent(itemId, workspaceContext ?? null);
}

function fireViewAll(queue: QueueVm, onAction: WorkspaceActionHandler) {
  if (!queue.viewAllActionId) return;
  onAction({
    type: "queue.item.action",
    queueId: queue.id,
    itemId: "__view_all__",
    actionId: queue.viewAllActionId,
    payload:
      queue.drillWorkUnitKey != null && queue.drillWorkUnitKey !== ""
        ? { workUnitKey: queue.drillWorkUnitKey }
        : undefined,
  });
}

type RollupLaneProps = {
  queue: QueueVm;
  onAction: WorkspaceActionHandler;
  variant: "primary" | "secondary";
};

/**
 * Department-only: rollup surface — entire card drills to work-unit list when `viewAllActionId` is set.
 */
function DepartmentRollupLane({ queue, onAction, variant }: RollupLaneProps) {
  const isAttention = variant === "secondary";
  const groups = queue.rollupGroups ?? [];
  const examples = (queue.rollupExamples ?? []).slice(0, 2);
  const total = queue.countBadge ?? groups.reduce((s, g) => s + g.count, 0);

  const kicker = isAttention ? "AI-prioritized exceptions" : "AI-ranked throughput";
  const groupsClass = isAttention
    ? "adminv2-ws-dept-rollup-groups adminv2-ws-dept-rollup-groups--attention"
    : "adminv2-ws-dept-rollup-groups adminv2-ws-dept-rollup-groups--throughput";

  const shellClass = [
    "adminv2-ws-dept-qsec",
    isAttention ? "adminv2-ws-dept-qsec--secondary" : "adminv2-ws-dept-qsec--primary",
    isAttention ? "adminv2-ws-dept-attention-panel" : "adminv2-ws-dept-throughput-panel",
    "adminv2-ws-dept-rollup-lane",
    queue.viewAllActionId ? "adminv2-ws-dept-rollup-card-hit adminv2-interactive-surface" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <header className={isAttention ? "adminv2-ws-dept-rollup-head adminv2-ws-dept-rollup-head--attention" : "adminv2-ws-dept-rollup-head adminv2-ws-dept-rollup-head--throughput"}>
        <div className="adminv2-ws-dept-rollup-head-text">
          <div className="adminv2-ws-dept-rollup-kicker">{kicker}</div>
          <h3 className="adminv2-ws-dept-rollup-title">{queue.title}</h3>
          {queue.rollupSummary ? <p className="adminv2-ws-dept-rollup-lane-summary">{queue.rollupSummary}</p> : null}
        </div>
        <div className="adminv2-ws-dept-rollup-head-meta">
          {total > 0 ? <span className="adminv2-ws-dept-rollup-total-badge">{total}</span> : null}
        </div>
      </header>

      <div className="adminv2-ws-dept-rollup-scroll">
        {groups.length > 0 ? (
          <ul className={groupsClass} role="list">
            {groups.map((g) => (
              <li key={g.id} className="adminv2-ws-dept-rollup-group" role="listitem">
                <div className="adminv2-ws-dept-rollup-group-main">
                  <span className="adminv2-ws-dept-rollup-group-label">{g.label}</span>
                  <span className="adminv2-ws-dept-rollup-group-count" aria-label={`${g.count} items`}>
                    {g.count}
                  </span>
                </div>
                {g.descriptor ? <p className="adminv2-ws-dept-rollup-group-desc">{g.descriptor}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="adminv2-ws-dept-rollup-empty">No rollup breakdown available for this lane.</p>
        )}

        {examples.length > 0 ? (
          <div className="adminv2-ws-dept-rollup-examples" aria-label="Sample context only">
            <span className="adminv2-ws-dept-rollup-examples-label">Examples</span>
            <span className="adminv2-ws-dept-rollup-examples-text">{examples.map((e) => e.label).join(" · ")}</span>
          </div>
        ) : null}
      </div>
    </>
  );

  const laneKind = isAttention ? "attention" : "throughput";

  if (queue.viewAllActionId) {
    return (
      <button
        type="button"
        className={shellClass}
        data-ws-queue-id={queue.id}
        data-ws-lane-kind={laneKind}
        onClick={() => fireViewAll(queue, onAction)}
        aria-label={`Open ${queue.title} — work-unit list`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={shellClass} data-ws-queue-id={queue.id} data-ws-lane-kind={laneKind}>
      {inner}
    </div>
  );
}

function workUnitSectionKey(item: QueueItemVm): string | undefined {
  return resolveWaitlistQueueItemSectionKey(item);
}

function queueQuickActionDispatchId(qa: QueueItemQuickActionVm): string {
  const withAction = qa as QueueItemQuickActionVm & { actionId?: string };
  const payload = qa.payload as { actionType?: string; source?: string } | undefined;
  if (payload?.actionType === "open_drawer") return "open_record";
  if (typeof withAction.actionId === "string" && withAction.actionId.trim() === "open_record") {
    return "open_record";
  }
  if (qa.id === "open") return "open_record";
  if (typeof withAction.actionId === "string" && withAction.actionId.trim()) return withAction.actionId.trim();
  return qa.id;
}

/** Primary "Open" first for CRM action column scan hierarchy. */
function orderedQueueQuickActions(actions: QueueItemQuickActionVm[] | undefined): QueueItemQuickActionVm[] {
  if (!actions?.length) return [];
  const openIdx = actions.findIndex((qa) => queueQuickActionDispatchId(qa) === "open_record");
  if (openIdx <= 0) return actions;
  const next = actions.slice();
  const [open] = next.splice(openIdx, 1);
  return [open!, ...next];
}

/** Sentence-case each segment (split on middot) — work-unit status pill is no longer all-caps in CSS. */
function formatWorkUnitQueueStatusPill(raw: string): string {
  return raw
    .split(/\s*·\s*/)
    .map((seg) => {
      const t = seg.trim();
      if (!t) return t;
      const lower = t.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" · ");
}

/**
 * When queue `field_labels` are all caps, present as title case (e.g. CONTACT → Contact).
 * Mixed-case strings pass through unchanged.
 */
function displayCrmFactGroupLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/[a-z]/.test(t)) return t;
  if (!/[A-Z]/.test(t)) return t;
  return t.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function CrmFactPartSpan({ part }: { part: WorkUnitQueueCrmFactPartVm }) {
  if (typeof part === "string") {
    return <span className="adminv2-ws-queue-fact-part">{part}</span>;
  }
  return (
    <span className="adminv2-ws-queue-fact-part adminv2-ws-queue-fact-part--kv">
      <span className="adminv2-ws-queue-fact-timing-k">{part.label}</span>
      <span className="adminv2-ws-queue-fact-timing-v"> {part.value}</span>
    </span>
  );
}

function CrmFactLineRow({
  line,
  groupKind,
}: {
  line: WorkUnitQueueCrmFactLineVm;
  groupKind: WorkUnitQueueCrmFactGroupKind;
}) {
  if (typeof line === "string") {
    return (
      <div className="adminv2-ws-queue-fact-value adminv2-ws-queue-fact-line">{line}</div>
    );
  }
  const isContact = groupKind === "contact";
  const lineClass = [
    "adminv2-ws-queue-fact-value",
    "adminv2-ws-queue-fact-line",
    "adminv2-ws-queue-fact-line--parts",
    isContact ? "adminv2-ws-queue-fact-line--contact-parts" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={lineClass}>
      {line.parts.flatMap((p, i) => {
        const out: ReactNode[] = [<CrmFactPartSpan key={`p-${i}`} part={p} />];
        if (i < line.parts.length - 1) {
          out.push(
            <span key={`s-${i}`} className="adminv2-ws-queue-fact-part-sep" aria-hidden="true">
              ·
            </span>
          );
        }
        return out;
      })}
    </div>
  );
}

function CrmFactColumnGrid({ grid }: { grid: WorkUnitQueueCrmFactColumnGridVm }) {
  const { headers, rows, columnKeys } = grid;
  if (!headers.length || !rows.length) return null;
  return (
    <div className="adminv2-ws-queue-fact-column-grid">
      {headers.map((header, colIdx) => (
        <div
          key={`col-${colIdx}`}
          className="adminv2-ws-queue-fact-field-col"
          data-fact-col-key={columnKeys?.[colIdx]}
        >
          <div className="adminv2-ws-queue-fact-col-head">{displayCrmFactGroupLabel(header)}</div>
          {rows.map((row, rowIdx) => (
            <div key={`${rowIdx}-${colIdx}`} className="adminv2-ws-queue-fact-value adminv2-ws-queue-fact-line">
              {row[colIdx] ?? ""}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Work-unit queue row doctrine — one fact group (label above, value below).
 */
function CrmWorkUnitFactGroup({ group }: { group: WorkUnitQueueCrmFactGroupVm }) {
  const hasGrid = Boolean(group.columnGrid?.headers.length && group.columnGrid?.rows.length);
  const showGroupLabel = Boolean(group.label?.trim());

  if (hasGrid && group.columnGrid) {
    return (
      <div className="adminv2-ws-queue-fact-group" data-fact-kind={group.kind}>
        {showGroupLabel ? (
          <div className="adminv2-ws-queue-fact-label">{displayCrmFactGroupLabel(group.label)}</div>
        ) : null}
        <CrmFactColumnGrid grid={group.columnGrid} />
      </div>
    );
  }

  const lines: WorkUnitQueueCrmFactLineVm[] | undefined =
    group.lines ??
    (group.timingSegments?.length
      ? [{ parts: group.timingSegments.map((s) => ({ label: s.label, value: s.value })) }]
      : undefined);

  return (
    <div className="adminv2-ws-queue-fact-group" data-fact-kind={group.kind}>
      {showGroupLabel ? (
        <div className="adminv2-ws-queue-fact-label">{displayCrmFactGroupLabel(group.label)}</div>
      ) : null}
      {lines?.map((line, li) => (
        <CrmFactLineRow key={li} line={line} groupKind={group.kind} />
      ))}
    </div>
  );
}

/** Split a flat preview string on middots into flex chunks; single chunk stays string. */
function factLineFromMiddotString(raw: string): WorkUnitQueueCrmFactLineVm {
  const chunks = raw
    .split(/\s*·\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (chunks.length >= 2) return { parts: chunks };
  return raw.trim();
}

function legacyMiddleHasContent(slots: CrmCompactRowSemanticSlots): boolean {
  const contactLine =
    [slots.contactDisplayName?.trim(), slots.contactPhoneDisplay?.trim(), slots.contactEmail?.trim()]
      .filter(Boolean)
      .join(CRM_COMPACT_VALUE_DOT_SEP) || slots.contactSnippet?.trim();
  const timingLine = slots.crmCompactTimingValueLine?.trim() ?? "";
  const timingPartsLegacy: string[] = [];
  if (!timingLine) {
    if (slots.ageContext?.trim()) timingPartsLegacy.push(slots.ageContext.trim());
    if (slots.tourContext?.trim() && slots.tourContext.trim() !== "—") {
      const t = slots.tourContext.trim();
      timingPartsLegacy.push(t.startsWith("Tour:") ? t : `Tour: ${t}`);
    }
  }
  const timingLineLegacy = timingPartsLegacy.length ? normalizePreviewLooseDateTokens(timingPartsLegacy.join(CRM_COMPACT_VALUE_DOT_SEP)) : null;
  const childLines = slots.childrenLines ?? [];
  const multi = childLines.length >= 2;
  return Boolean(
    contactLine ||
      (multi && childLines.length > 0) ||
      (!multi && (slots.childName?.trim() || slots.programContext?.trim())) ||
      (slots.programContext?.trim() && !multi && !slots.childName?.trim()) ||
      timingLine ||
      slots.desiredStartDateDisplay != null ||
      slots.tourContext != null ||
      slots.roomContext?.trim() ||
      slots.ageBandContext?.trim() ||
      timingLineLegacy
  );
}

/** Fallback when `crmFactGroups` is absent (older callers). Prefers field column grids when slots allow. */
function LegacyCrmCompactQueueMiddle({ slots }: { slots: CrmCompactRowSemanticSlots }) {
  const nodes: ReactNode[] = [];
  const DL = DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS;
  const primaryContactCaption = slots.rowPreviewLabelPrimaryContact?.trim() || DL.primary_contact;
  const timingLabel = slots.rowPreviewLabelTimingGroup?.trim() || DL.timing;
  const ageLabel = slots.rowPreviewLabelAgeBand?.trim() || DL.age_band;
  const childHdr = DL.child_name;
  const programHdr = DL.program;

  const hasStructContact =
    Boolean(slots.contactDisplayName?.trim()) ||
    Boolean(slots.contactPhoneDisplay?.trim()) ||
    Boolean(slots.contactEmail?.trim());

  if (hasStructContact || slots.contactSnippet?.trim()) {
    if (hasStructContact) {
      nodes.push(
        <div key="contact" className="adminv2-ws-queue-fact-group" data-fact-kind="contact">
          <CrmFactColumnGrid
            grid={{
              headers: [
                slots.rowPreviewLabelPrimaryContact ?? DL.primary_contact,
                slots.rowPreviewLabelPhone ?? DL.phone,
                slots.rowPreviewLabelEmail ?? DL.email,
              ],
              rows: [
                [
                  slots.contactDisplayName?.trim() || "—",
                  slots.contactPhoneDisplay?.trim() || "—",
                  slots.contactEmail?.trim() || "—",
                ],
              ],
              columnKeys: ["primary_contact", "phone", "email"],
            }}
          />
        </div>
      );
    } else {
      nodes.push(
        <div key="contact" className="adminv2-ws-queue-fact-group" data-fact-kind="contact">
          <div className="adminv2-ws-queue-fact-label">{displayCrmFactGroupLabel(primaryContactCaption)}</div>
          <CrmFactLineRow
            line={factLineFromMiddotString(slots.contactSnippet!.trim())}
            groupKind="contact"
          />
        </div>
      );
    }
  }

  const childLines = slots.childrenLines ?? [];
  const multi = childLines.length >= 2;

  if (multi) {
    const vis = childLines.slice(0, 4);
    const overflow = Math.max(0, childLines.length - vis.length);
    const useProgramCol = vis.some((ch) => Boolean(ch.programInline?.trim()));
    const headers = useProgramCol ? [childHdr, programHdr] : [childHdr];
    const rows: string[][] = vis.map((ch) => {
      if (useProgramCol) {
        return [ch.primary, ch.programInline?.trim() || "—"];
      }
      return [ch.primary];
    });
    if (overflow > 0) {
      rows.push([`+${overflow} more`, ...(useProgramCol ? [""] : [])]);
    }
    nodes.push(
      <div key="ch" className="adminv2-ws-queue-fact-group" data-fact-kind="children_programs">
        <CrmFactColumnGrid
          grid={{
            headers,
            rows,
            columnKeys: useProgramCol ? ["child_name", "program"] : ["child_name"],
          }}
        />
      </div>
    );
  } else {
    const n = slots.childName?.trim() || "";
    const p = slots.programContext?.trim() || "";
    if (n && p) {
      nodes.push(
        <div key="ch" className="adminv2-ws-queue-fact-group" data-fact-kind="children_programs">
          <CrmFactColumnGrid
            grid={{ headers: [childHdr, programHdr], rows: [[n, p]], columnKeys: ["child_name", "program"] }}
          />
        </div>
      );
    } else if (n) {
      nodes.push(
        <div key="ch" className="adminv2-ws-queue-fact-group" data-fact-kind="children_programs">
          <CrmFactColumnGrid grid={{ headers: [childHdr], rows: [[n]], columnKeys: ["child_name"] }} />
        </div>
      );
    } else if (p) {
      nodes.push(
        <div key="ch" className="adminv2-ws-queue-fact-group" data-fact-kind="children_programs">
          <CrmFactColumnGrid grid={{ headers: [programHdr], rows: [[p]], columnKeys: ["program"] }} />
        </div>
      );
    }
  }

  let timingHandled = false;
  if (slots.desiredStartDateDisplay != null || slots.tourContext != null) {
    const th: string[] = [];
    const tv: string[] = [];
    if (slots.desiredStartDateDisplay != null) {
      th.push(slots.rowPreviewLabelDesiredStartDate ?? DL.desired_start_date);
      tv.push(slots.desiredStartDateDisplay ?? "—");
    }
    if (slots.tourContext != null) {
      th.push(slots.rowPreviewLabelTourDate ?? DL.tour_date);
      tv.push(slots.tourContext ?? "—");
    }
    if (th.length) {
      nodes.push(
        <div key="timing" className="adminv2-ws-queue-fact-group" data-fact-kind="timing">
          <CrmFactColumnGrid
            grid={{ headers: th, rows: [tv], columnKeys: th.map((_, i) => `timing_${i}`) }}
          />
        </div>
      );
      timingHandled = true;
    }
  }

  if (!timingHandled && slots.crmCompactTimingValueLine?.trim()) {
    nodes.push(
      <div key="timing-flat" className="adminv2-ws-queue-fact-group" data-fact-kind="timing">
        <div className="adminv2-ws-queue-fact-label">{displayCrmFactGroupLabel(timingLabel)}</div>
        <CrmFactLineRow
          line={factLineFromMiddotString(slots.crmCompactTimingValueLine.trim())}
          groupKind="timing"
        />
      </div>
    );
    timingHandled = true;
  }

  if (slots.roomContext?.trim()) {
    nodes.push(
      <div key="room" className="adminv2-ws-queue-fact-group" data-fact-kind="meta">
        <div className="adminv2-ws-queue-fact-label">{displayCrmFactGroupLabel(DL.room)}</div>
        <div className="adminv2-ws-queue-fact-value adminv2-ws-queue-fact-line">{slots.roomContext.trim()}</div>
      </div>
    );
  }
  if (slots.ageBandContext?.trim()) {
    nodes.push(
      <div key="age" className="adminv2-ws-queue-fact-group" data-fact-kind="meta">
        <div className="adminv2-ws-queue-fact-label">{displayCrmFactGroupLabel(ageLabel)}</div>
        <div className="adminv2-ws-queue-fact-value adminv2-ws-queue-fact-line">{slots.ageBandContext.trim()}</div>
      </div>
    );
  }

  if (!timingHandled) {
    const timingLine = slots.crmCompactTimingValueLine?.trim() ?? "";
    const timingPartsLegacy: string[] = [];
    if (!timingLine) {
      if (slots.ageContext?.trim()) timingPartsLegacy.push(slots.ageContext.trim());
      if (slots.tourContext?.trim() && slots.tourContext.trim() !== "—") {
        const t = slots.tourContext.trim();
        timingPartsLegacy.push(t.startsWith("Tour:") ? t : `Tour: ${t}`);
      }
    }
    const timingLineLegacyRaw = timingPartsLegacy.length ? timingPartsLegacy.join(CRM_COMPACT_VALUE_DOT_SEP) : null;
    const timingLineLegacy = timingLineLegacyRaw ? normalizePreviewLooseDateTokens(timingLineLegacyRaw) : null;
    if (timingLineLegacy) {
      nodes.push(
        <div key="leg" className="adminv2-ws-queue-fact-group" data-fact-kind="timing">
          <div className="adminv2-ws-queue-fact-label">{displayCrmFactGroupLabel(timingLabel)}</div>
          <CrmFactLineRow line={factLineFromMiddotString(timingLineLegacy)} groupKind="timing" />
        </div>
      );
    }
  }

  return <>{nodes}</>;
}

function queueUrgencyChipClass(band: string | null | undefined): string {
  if (band === "p0_urgent") return "border-alloy-ember/30 bg-alloy-ember/10 text-alloy-ember";
  if (band === "p1_today") return "border-alloy-blue/30 bg-alloy-blue/10 text-alloy-blue";
  return "border-admin-border bg-alloy-stone/30 text-alloy-midnight/70";
}

function queueTypeCueChipClass(): string {
  return "border-alloy-stone/22 bg-alloy-stone/12 text-alloy-midnight/62";
}

function queueStaleCueChipClass(): string {
  return "border-alloy-stone/28 bg-alloy-stone/10 text-alloy-midnight/58";
}

/** L0 queue operational read — do-next + why lines; scan layout matches drawer read order. */
function CrmCompactOperationalReadPreview({
  preview,
  layout = "scan",
}: {
  preview: NonNullable<CrmCompactRowSemanticSlots["operationalReadPreview"]>;
  layout?: "scan" | "full";
}) {
  const scan = layout === "scan";
  const hasMetaChips = Boolean(preview.urgencyChipLabel || preview.typeCue || preview.staleCue);

  return (
    <div
      className={`adminv2-ws-crm-queue-preview__operational-read adminv2-ws-crm-queue-preview__operational-read--${layout}`}
      data-queue-preview-slot="operational_read"
      data-queue-operational-read-layout={layout}
      title="Preview — open the record for full operational read."
    >
      {hasMetaChips ? (
        <div className="adminv2-ws-crm-queue-preview__operational-read-meta">
          {preview.urgencyChipLabel ? (
            <span
              className={`adminv2-ws-crm-queue-preview__urgency-chip inline-flex shrink-0 items-center rounded-md border px-1 py-0.5 text-[9px] font-medium leading-tight ${queueUrgencyChipClass(preview.urgencyBand)}`}
              data-testid="queue-operational-read-urgency-chip"
              title={preview.priorityExplanation?.ariaLabel ?? preview.urgencyChipLabel}
              aria-label={preview.priorityExplanation?.ariaLabel ?? preview.urgencyChipLabel}
            >
              {preview.urgencyChipLabel}
            </span>
          ) : null}
          {preview.typeCue ? (
            <span
              className={`adminv2-ws-crm-queue-preview__type-cue inline-flex shrink-0 items-center rounded-md border px-1 py-0.5 text-[9px] font-medium leading-tight ${queueTypeCueChipClass()}`}
              data-testid="queue-operational-read-type-cue"
            >
              {preview.typeCue}
            </span>
          ) : null}
          {preview.staleCue ? (
            <span
              className={`adminv2-ws-crm-queue-preview__stale-cue inline-flex shrink-0 items-center rounded-md border px-1 py-0.5 text-[9px] font-medium leading-tight ${queueStaleCueChipClass()}`}
              data-testid="queue-operational-read-stale-cue"
            >
              {preview.staleCue}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="adminv2-ws-crm-queue-preview__operational-read-lines min-w-0 w-full">
        <div className="adminv2-ws-crm-queue-preview__operational-read-primary">
          {!scan ? (
            <span className="adminv2-ws-crm-queue-preview__operational-read-label">Operational read:</span>
          ) : null}
          <span className="adminv2-ws-crm-queue-preview__operational-read-text">{preview.operationalRead}</span>
        </div>
        {preview.whyNow?.trim() ? (
          <div
            className="adminv2-ws-crm-queue-preview__operational-read-why"
            data-queue-preview-slot="operational_read_why"
          >
            {preview.whyNow.trim()}
          </div>
        ) : null}
      </div>
      <span className="adminv2-ws-crm-queue-preview__operational-read-boundary">
        {preview.previewBoundary ?? QUEUE_PREVIEW_BOUNDARY_LABEL}
      </span>
    </div>
  );
}

/**
 * CRM-compact queue preview — 3 zones: identity (left), fact groups (middle), actions (host).
 * Middle follows work-unit queue row doctrine when `crmFactGroups` is set.
 * Exported for dev-only visual review fixtures (`/dev/p1c-operational-attention-review`).
 */
export function CrmCompactQueuePreview({
  slots,
  urgencyTier = "standard",
  operationalAttentionBadge = false,
  scanMode = false,
  waitlistPlacementPreview,
  waitlistPlacementV2,
  waitlistCandidateRow,
  waitlistStatusLabel,
}: {
  slots: CrmCompactRowSemanticSlots;
  urgencyTier?: QueueItemVm["urgencyTier"];
  /** Warm status pill when row has operational needs-attention (no full-card urgency wash). */
  operationalAttentionBadge?: boolean;
  /** Work-unit lane: minimal left column — status, operational attention, next hint; detail belongs in drawer. */
  scanMode?: boolean;
  waitlistPlacementPreview?: QueueRowPlacementPriorityVm;
  waitlistPlacementV2?: QueueRowPlacementPriorityV2Vm;
  waitlistCandidateRow?: import("@/lib/ui-v2/workspace-types").QueueRowPlacementWaitlistCandidateVm;
  waitlistStatusLabel?: string;
}) {
  const stageStatus =
    slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel
      ? `${slots.stageLabel} · ${slots.statusLabel}`
      : slots.stageLabel || slots.statusLabel || null;
  const noteStress = Boolean(slots.attentionReason?.trim());
  const operationalStrong = Boolean(slots.attentionReason?.trim() || slots.operationalReadPreview?.operationalRead);
  const nextHint = slots.operationalNextHint?.trim() ?? "";
  const operationalRead = slots.operationalReadPreview;

  const staleTone =
    slots.activityStale?.severity === "high"
      ? "adminv2-ws-queue-preview-stale adminv2-ws-queue-preview-stale--high"
      : slots.activityStale?.severity === "medium"
        ? "adminv2-ws-queue-preview-stale adminv2-ws-queue-preview-stale--medium"
        : "adminv2-ws-queue-preview-stale adminv2-ws-queue-preview-stale--low";
  const staleToneResolved =
    operationalStrong && slots.activityStale
      ? `${staleTone} adminv2-ws-queue-preview-stale--muted-footnote`
      : staleTone;

  const useDoctrine = slots.crmFactGroups != null;
  const hasMiddle = useDoctrine ? (slots.crmFactGroups?.length ?? 0) > 0 : legacyMiddleHasContent(slots);

  const hasNextStrip = Boolean(slots.nextStep?.trim());

  const notePrev = slots.familyNotePreview;
  const hasStructuredNote = Boolean(
    notePrev && (notePrev.timestamp?.trim() || notePrev.body?.trim())
  );
  const flatNote = slots.familyNote?.trim();
  const showNoteFooter = scanMode ? false : Boolean(hasStructuredNote || flatNote);

  const bodyClass =
    `adminv2-ws-crm-queue-preview__body${hasMiddle || waitlistCandidateRow ? "" : " adminv2-ws-crm-queue-preview__body--identity-only"}`;

  const hasFooter = scanMode
    ? Boolean(slots.lastActivity?.trim())
    : Boolean(showNoteFooter || slots.lastActivity?.trim());

  const commercial = slots.commercialValue?.trim() ?? "";

  if (scanMode) {
    return (
      <div
        className="adminv2-ws-crm-queue-preview adminv2-ws-enrollment-crm-preview adminv2-ws-crm-queue-preview--scan"
        data-queue-preview="crm_compact"
      >
        <div className={bodyClass}>
          <div className="adminv2-ws-crm-queue-preview__zone adminv2-ws-crm-queue-preview__zone--left">
            {stageStatus ? (
              <div className="adminv2-ws-crm-queue-preview__scan-status-row">
                <span
                  className={`adminv2-ws-crm-queue-preview__status-pill adminv2-ws-crm-queue-preview__status-pill--wrap adminv2-ws-crm-queue-preview__status-pill--urgency-${urgencyTier}${
                    operationalAttentionBadge
                      ? " adminv2-ws-crm-queue-preview__status-pill--operational-attention"
                      : ""
                  }`}
                >
                  {formatWorkUnitQueueStatusPill(stageStatus)}
                </span>
              </div>
            ) : null}
            {!waitlistCandidateRow && waitlistPlacementV2 ? (
              <QueueRowPlacementPriorityV2Panel
                preview={waitlistPlacementV2}
                layout="statusColumn"
                statusLabel={waitlistStatusLabel}
              />
            ) : !waitlistCandidateRow && waitlistPlacementPreview ? (
              <QueueRowPlacementPriorityStrip
                preview={waitlistPlacementPreview}
                layout="statusColumn"
                statusLabel={waitlistStatusLabel}
              />
            ) : null}
            <div className="adminv2-ws-crm-queue-preview__title-row adminv2-ws-crm-queue-preview__title-row--scan">
              <span className="adminv2-ws-crm-queue-preview__title" title={slots.primaryIdentity}>
                {slots.primaryIdentity}
              </span>
              {!waitlistCandidateRow && slots.waitlistHouseholdContext?.trim() ? (
                <span
                  className="adminv2-ws-crm-queue-preview__household-context text-[11px] text-alloy-midnight/65"
                  data-queue-preview-slot="waitlist_household"
                >
                  {slots.waitlistHouseholdContext.trim()}
                </span>
              ) : null}
              {!waitlistCandidateRow && slots.locationContext?.trim() ? (
                <span
                  className="adminv2-ws-crm-queue-preview__location-badge shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/70"
                  data-queue-preview-slot="location"
                >
                  {slots.locationContext.trim()}
                </span>
              ) : null}
            </div>
            {waitlistCandidateRow ? (
              <QueueRowPlacementManualOrderControls row={waitlistCandidateRow} layout="inline" />
            ) : null}
            {waitlistCandidateRow ? <QueueRowPlacementCandidateContext row={waitlistCandidateRow} /> : null}
            {slots.attentionReason?.trim() && !operationalRead?.operationalRead ? (
              <div className="adminv2-ws-crm-queue-preview__attention-headline">{slots.attentionReason.trim()}</div>
            ) : null}
            {slots.queuePriorityExplanation?.trim() ? (
              <div
                className="adminv2-ws-crm-queue-preview__operational-next-scan text-alloy-midnight/62"
                data-queue-preview-slot="queue_priority_explanation"
                title="Deterministic priority hint — not AI-generated."
              >
                {slots.queuePriorityExplanation.trim()}
              </div>
            ) : null}
            {slots.operationalSummaryPreview?.headline?.trim() ? (
              <div
                className="adminv2-ws-crm-queue-preview__operational-summary-preview"
                data-queue-preview-slot="operational_summary"
                title="Preview only — open the record for the full operational read."
              >
                <span className="adminv2-ws-crm-queue-preview__operational-summary-preview-label">Read</span>
                <span className="adminv2-ws-crm-queue-preview__operational-summary-preview-text">
                  {slots.operationalSummaryPreview.headline.trim()}
                </span>
              </div>
            ) : null}
            {operationalRead?.operationalRead ? (
              <CrmCompactOperationalReadPreview preview={operationalRead} layout="scan" />
            ) : null}
            {slots.childLifecycleSummary?.trim() ? (
              <div
                className="adminv2-ws-crm-queue-preview__child-lifecycle-summary text-[10px] leading-snug text-alloy-midnight/58"
                data-child-lifecycle-summary="true"
              >
                {slots.childLifecycleSummary.trim()}
              </div>
            ) : null}
            {nextHint ? (
              <div className="adminv2-ws-crm-queue-preview__operational-next-scan">Next: {nextHint}</div>
            ) : null}
          </div>

          {hasMiddle || waitlistCandidateRow ? (
            <div className="adminv2-ws-crm-queue-preview__zone adminv2-ws-crm-queue-preview__zone--middle">
              {useDoctrine
                ? slots.crmFactGroups!.map((g, i) => <CrmWorkUnitFactGroup key={i} group={g} />)
                : <LegacyCrmCompactQueueMiddle slots={slots} />}
              {waitlistCandidateRow ? (
                <QueueRowPlacementCandidateMetaChips
                  row={waitlistCandidateRow}
                  siteLabel={slots.locationContext}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        {hasFooter ? (
          <div className="adminv2-ws-crm-queue-preview__footer adminv2-ws-crm-queue-preview__footer--scan-only">
            {slots.lastActivity?.trim() ? (
              <div className="adminv2-ws-crm-queue-preview__footer-activity">{slots.lastActivity.trim()}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="adminv2-ws-crm-queue-preview adminv2-ws-enrollment-crm-preview"
      data-queue-preview="crm_compact"
    >
      <div className={bodyClass}>
        <div className="adminv2-ws-crm-queue-preview__zone adminv2-ws-crm-queue-preview__zone--left">
          <div className="adminv2-ws-crm-queue-preview__title-row">
            <span className="adminv2-ws-crm-queue-preview__title" title={slots.primaryIdentity}>
              {slots.primaryIdentity}
            </span>
            {stageStatus ? (
              <span
                className={`adminv2-ws-crm-queue-preview__status-pill adminv2-ws-crm-queue-preview__status-pill--wrap adminv2-ws-crm-queue-preview__status-pill--urgency-${urgencyTier}`}
              >
                {formatWorkUnitQueueStatusPill(stageStatus)}
              </span>
            ) : null}
          </div>
          {hasNextStrip ? (
            <div className="adminv2-ws-crm-queue-preview__next-strip" aria-label="Next step">
              <span className="adminv2-ws-crm-queue-preview__next-value">{slots.nextStep!.trim()}</span>
              <span className="adminv2-ws-crm-queue-preview__next-caption">Next step</span>
            </div>
          ) : null}
          {commercial ? (
            <div className="adminv2-ws-crm-queue-preview__commercial">{commercial}</div>
          ) : null}
          {slots.attentionReason?.trim() && !operationalRead?.operationalRead ? (
            <div className="adminv2-ws-crm-queue-preview__attention">{slots.attentionReason.trim()}</div>
          ) : null}
          {slots.queuePriorityExplanation?.trim() ? (
            <div
              className="adminv2-ws-crm-queue-preview__operational-next text-[11px] leading-snug text-alloy-midnight/58"
              data-queue-preview-slot="queue_priority_explanation"
              title="Deterministic priority hint — not AI-generated."
            >
              {slots.queuePriorityExplanation.trim()}
            </div>
          ) : null}
          {slots.operationalSummaryPreview?.headline?.trim() ? (
            <div
              className="adminv2-ws-crm-queue-preview__operational-summary-preview adminv2-ws-crm-queue-preview__operational-summary-preview--full"
              data-queue-preview-slot="operational_summary"
              title="Preview only — open the record for the full operational read."
            >
              <span className="adminv2-ws-crm-queue-preview__operational-summary-preview-label">Read</span>
              <span className="adminv2-ws-crm-queue-preview__operational-summary-preview-text">
                {slots.operationalSummaryPreview.headline.trim()}
              </span>
            </div>
          ) : null}
          {operationalRead?.operationalRead ? (
            <CrmCompactOperationalReadPreview preview={operationalRead} layout="full" />
          ) : null}
          {slots.childLifecycleSummary?.trim() ? (
            <div
              className="adminv2-ws-crm-queue-preview__child-lifecycle-summary text-[11px] leading-snug text-alloy-midnight/58"
              data-child-lifecycle-summary="true"
            >
              {slots.childLifecycleSummary.trim()}
            </div>
          ) : null}
          {nextHint ? (
            <div className="adminv2-ws-crm-queue-preview__operational-next text-[11px] leading-snug text-alloy-midnight/58">
              Next: {nextHint}
            </div>
          ) : null}
          {slots.activityStale ? <span className={staleToneResolved}>{slots.activityStale.label}</span> : null}
        </div>

        {hasMiddle || waitlistCandidateRow ? (
          <div className="adminv2-ws-crm-queue-preview__zone adminv2-ws-crm-queue-preview__zone--middle">
            {useDoctrine
              ? slots.crmFactGroups!.map((g, i) => <CrmWorkUnitFactGroup key={i} group={g} />)
              : <LegacyCrmCompactQueueMiddle slots={slots} />}
            {waitlistCandidateRow ? (
              <QueueRowPlacementCandidateMetaChips
                row={waitlistCandidateRow}
                siteLabel={slots.locationContext}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {hasFooter ? (
        <div
          className={
            noteStress
              ? "adminv2-ws-crm-queue-preview__footer adminv2-ws-crm-queue-preview__footer--stress"
              : "adminv2-ws-crm-queue-preview__footer"
          }
        >
          {showNoteFooter ? (
            <div className="adminv2-ws-crm-queue-preview__footer-notes">
              <span className="adminv2-ws-crm-queue-preview__gk">Notes</span>
              {hasStructuredNote ? (
                <span className="adminv2-ws-crm-queue-preview__note-line">
                  {notePrev!.timestamp?.trim() ? (
                    <>
                      <span className="adminv2-ws-crm-queue-preview__note-ts">{notePrev!.timestamp!.trim()}</span>
                      {notePrev!.body?.trim() ? (
                        <>
                          <span className="adminv2-ws-crm-queue-preview__note-sep" aria-hidden>
                            {" "}
                            —{" "}
                          </span>
                          <span className="adminv2-ws-crm-queue-preview__note-body">{notePrev!.body.trim()}</span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span className="adminv2-ws-crm-queue-preview__note-body">{notePrev!.body.trim()}</span>
                  )}
                </span>
              ) : (
                <span className="adminv2-ws-crm-queue-preview__gv">{flatNote}</span>
              )}
            </div>
          ) : null}
          {slots.lastActivity?.trim() ? (
            <div className="adminv2-ws-crm-queue-preview__footer-activity">{slots.lastActivity.trim()}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkUnitQueueLane({
  queue,
  onAction,
  opportunityDrawerWorkspaceContext,
}: {
  queue: QueueVm;
  onAction: WorkspaceActionHandler;
  opportunityDrawerWorkspaceContext?: OpportunityDrawerIntentContext | null;
}) {
  const listShellRef = useRef<HTMLDivElement>(null);
  const [refreshMinHeightPx, setRefreshMinHeightPx] = useState<number>();
  /** Client-only collapsed waitlist program/room groups (placement sections). */
  const [collapsedPlacementGroups, setCollapsedPlacementGroups] = useState<Set<string>>(() => new Set());
  const v2PlacementCollapseInitRef = useRef(false);

  const hasV2PlacementRows = useMemo(
    () =>
      queue.items.some(
        (i) => i.placementWaitlistCandidate != null || i.placementPriorityV2?.showPlacementV2Badge
      ),
    [queue.items]
  );
  const hasCandidatePlacementRows = useMemo(
    () => queue.items.some((i) => i.placementWaitlistCandidate != null),
    [queue.items]
  );

  const waitlistPlacementSections = useMemo(
    () =>
      queue.items.some(
        (i) =>
          i.placementWaitlistCandidate != null ||
          (i.placementPriorityV2?.showPlacementV2Badge === true) ||
          (i.placementPriority != null && !i.placementPriority.evaluateError)
      ),
    [queue.items]
  );

  const waitlistSectionPlan = useMemo(
    () =>
      waitlistPlacementSections ? buildWaitlistQueueBlockSectionPlan(queue.items) : null,
    [queue.items, waitlistPlacementSections]
  );

  const displayQueueItems = useMemo(
    () =>
      waitlistPlacementSections
        ? sortWaitlistQueueItemsForDisplay(queue.items)
        : queue.items,
    [queue.items, waitlistPlacementSections]
  );

  useLayoutEffect(() => {
    if (!queue.rowsRefreshing) {
      const id = requestAnimationFrame(() => setRefreshMinHeightPx(undefined));
      return () => cancelAnimationFrame(id);
    }
    const el = listShellRef.current;
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    setRefreshMinHeightPx((mh) => (mh != null && mh > 0 ? Math.max(mh, h) : h));
  }, [queue.rowsRefreshing, queue.items.length]);

  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of displayQueueItems) {
      const k = workUnitSectionKey(item);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [displayQueueItems]);

  useEffect(() => {
    if (!WAITLIST_SECTION_LIVE_DIAG_ENABLED || !waitlistSectionPlan) return;
    for (const header of waitlistSectionPlan.headers) {
      logWaitlistSectionLive({
        sectionKey: header.sectionKey,
        label: header.label,
        rowIds: header.rowIds,
        rawGroupKeys: header.rawGroupKeys,
        canonicalKeys: header.canonicalKeys,
      });
    }
    if (waitlistSectionPlan.unsortedDuplicateSectionKeys.length > 0) {
      console.warn(
        "[waitlist-section-live] unsorted-duplicate-section-keys",
        waitlistSectionPlan.unsortedDuplicateSectionKeys
      );
    }
  }, [waitlistSectionPlan]);

  useLayoutEffect(() => {
    if (!hasV2PlacementRows || v2PlacementCollapseInitRef.current) return;
    const keys = new Set<string>();
    for (const item of displayQueueItems) {
      const k = workUnitSectionKey(item);
      if (k) keys.add(k);
    }
    if (keys.size > 0) {
      setCollapsedPlacementGroups(keys);
      v2PlacementCollapseInitRef.current = true;
    }
  }, [hasV2PlacementRows, displayQueueItems]);

  const placementLaneHint = useMemo(() => {
    const v2Shadow = displayQueueItems.some(
      (i) => i.placementPriorityV2?.shadowMode === true || i.placementWaitlistCandidate?.shadowMode === true
    );
    if (hasV2PlacementRows || hasCandidatePlacementRows) {
      return buildPlacementV2QueueHint({
        shadowMode: v2Shadow,
        placementProjectionHint: queue.placementProjectionHint,
        candidateRowLayout: hasCandidatePlacementRows,
      });
    }
    return queue.placementProjectionHint;
  }, [hasV2PlacementRows, hasCandidatePlacementRows, displayQueueItems, queue.placementProjectionHint]);

  let lastSectionKey: string | undefined;

  const showQueueHeader = Boolean(queue.title?.trim());
  const placementShowBucketChip = queue.placementDisplay?.show_bucket_chip !== false;
  const placementShowSortHint = queue.placementDisplay?.show_sort_hint !== false;
  return (
    <section
      className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-wu-queue-shell"
      data-ws-queue-id={queue.id}
      aria-label={queue.title?.trim() || "Queue"}
    >
      {showQueueHeader ? (
        <header className="adminv2-ws-queue-header">
          <div className="adminv2-ws-queue-title-row">
            {queue.title?.trim() ? <h3 className="adminv2-ws-queue-title">{queue.title.trim()}</h3> : <span className="sr-only">Queue</span>}
            {queue.countBadge != null ? (
              <span
                className="adminv2-ws-wu-queue-count-badge"
                aria-label={queue.countBadgeAriaLabel ?? `${queue.countBadge} in queue`}
              >
                {queue.countBadge}
              </span>
            ) : null}
          </div>
        </header>
      ) : null}
      {queue.rollupSummary ? <p className="adminv2-ws-wu-queue-summary">{queue.rollupSummary}</p> : null}
      {queue.sortCaption ? (
        <p className="adminv2-ws-wu-queue-sort-caption" role="note">
          {queue.sortCaption}
        </p>
      ) : null}
      {placementShowSortHint && placementLaneHint?.trim() ? (
        <p className="adminv2-ws-wu-queue-placement-hint" role="note">
          {placementLaneHint.trim()}
        </p>
      ) : null}
      <div
        ref={listShellRef}
        className="adminv2-ws-wu-queue-list-shell relative min-h-0 min-w-0"
        style={refreshMinHeightPx ? { minHeight: refreshMinHeightPx } : undefined}
      >
        {queue.rowsRefreshing ? (
          <div
            className="pointer-events-none absolute left-3 right-3 top-[6px] z-[2] h-2 overflow-hidden rounded-full opacity-90 adminv2-ws-wu-queue-rows-shimmer-mask"
            aria-hidden
          >
            <div className="absolute inset-y-0 w-2/5 -translate-x-full rounded-full bg-gradient-to-r from-transparent via-white/70 to-transparent adminv2-ws-wu-queue-rows-shimmer-bar" />
          </div>
        ) : null}
        <ul
          className={`adminv2-ws-queue-list adminv2-ws-wu-queue-list relative z-0 transition-opacity duration-[180ms] ease-out ${
            queue.rowsRefreshing ? "opacity-[0.76]" : "opacity-100"
          }`}
          aria-busy={Boolean(queue.rowsRefreshing)}
          role="list"
        >
        {queue.rowsLoading && !queue.rowsHeld && queue.items.length === 0
          ? Array.from({ length: ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT }, (_, i) => (
              <WorkUnitQueueLaneRowSkeleton key={`queue-row-skel-${i}`} />
            ))
          : null}
        {!queue.rowsLoading && !queue.rowsHeld && queue.items.length === 0 ? (
          <li className="adminv2-ws-wu-queue-empty-wrap" role="status">
            <div className="adminv2-ws-wu-queue-empty-panel">
              <p className="adminv2-ws-wu-queue-empty-title">No records</p>
              {queue.laneQueueLabel?.trim() ? (
                <p className="adminv2-ws-wu-queue-empty-queue">{queue.laneQueueLabel.trim()}</p>
              ) : null}
            </div>
          </li>
        ) : null}
        {displayQueueItems.map((item) => {
          const sectionKey = workUnitSectionKey(item);
          const showGroup = sectionKey && sectionKey !== lastSectionKey;
          if (sectionKey) lastSectionKey = sectionKey;

          const sectionDiagHeader =
            showGroup && sectionKey && waitlistSectionPlan
              ? waitlistSectionPlan.headers.find(
                  (h) => h.sectionKey === sectionKey && h.rowIds[0] === item.id
                )
              : undefined;
          const sectionDiagAttrs = sectionDiagHeader
            ? waitlistSectionLiveDiagAttrs(sectionDiagHeader)
            : {};

          const tier = item.urgencyTier ?? "standard";
          const attentionAccent = Boolean(item.needsOperationalAttention);
          const rowQuickActions = queue.rowActionsPending
            ? []
            : orderedQueueQuickActions(item.quickActions);
          const rowActionsPending = Boolean(queue.rowActionsPending);
          const crm = item.semanticCrmCompact;
          const valueShown = (crm?.commercialValue ?? item.valueLabel)?.trim() ?? "";
          const hasValue = Boolean(valueShown);
          const actionEntityId = queueItemOpportunityId(item);
          const headerCfg = sectionKey ? queue.workUnitGroupHeaders?.[sectionKey] : undefined;
          const count = sectionKey ? (groupCounts.get(sectionKey) ?? 0) : 0;
          const rowMode = placementWaitlistGroupRowMode(
            waitlistPlacementSections,
            sectionKey,
            collapsedPlacementGroups,
            Boolean(showGroup)
          );
          if (rowMode === "skip_row") {
            return <li key={item.id} hidden aria-hidden="true" />;
          }

          const sectionTitle =
            showGroup && sectionKey
              ? formatPlacementGroupHeaderTitle({
                  emoji: headerCfg?.emoji,
                  label: headerCfg?.label ?? sectionKey,
                  count,
                })
              : null;

          const collapsibleWaitlistHeader = Boolean(waitlistPlacementSections && sectionTitle);
          const placementSectionExpanded = sectionKey ? !collapsedPlacementGroups.has(sectionKey) : true;
          const labelSectionClasses = [
            "adminv2-ws-wu-queue-section-label",
            headerCfg ? "adminv2-ws-wu-queue-section-label--rich" : "",
            waitlistPlacementSections && showGroup ? "adminv2-ws-wu-queue-section-label--waitlist-placement" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li key={item.id} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
              {sectionTitle ? (
                collapsibleWaitlistHeader ? (
                  <button
                    type="button"
                    className={`${labelSectionClasses} adminv2-ws-wu-queue-section-label--waitlist-toggle`}
                    aria-expanded={placementSectionExpanded}
                    {...sectionDiagAttrs}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!sectionKey) return;
                      setCollapsedPlacementGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(sectionKey)) next.delete(sectionKey);
                        else next.add(sectionKey);
                        return next;
                      });
                    }}
                  >
                    <span className="adminv2-ws-wu-queue-section-label__text">{sectionTitle}</span>
                    <span className="adminv2-ws-wu-queue-section-label__chevron" aria-hidden>
                      {placementSectionExpanded ? "▾" : "▸"}
                    </span>
                  </button>
                ) : (
                  <div className={labelSectionClasses} role="presentation" {...sectionDiagAttrs}>
                    {sectionTitle}
                  </div>
                )
              ) : null}
              {rowMode !== "header_only" ? (
              <div
                className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card-interactive adminv2-interactive-surface relative z-[1] cursor-pointer pointer-events-auto adminv2-ws-wu-queue-card--tier-${tier}${
                  attentionAccent ? " adminv2-ws-wu-queue-card--attention-accent" : ""
                }`}
                data-ws-wu-urgency={tier}
                data-ws-needs-attention={attentionAccent ? "true" : undefined}
                role="button"
                tabIndex={0}
                onMouseEnter={() => prefetchOpportunityQueueRowIntent(queue, actionEntityId, opportunityDrawerWorkspaceContext)}
                onMouseDown={() => {
                  prefetchOpportunityQueueRowIntent(queue, actionEntityId, opportunityDrawerWorkspaceContext);
                  if (queue.queueEntityType === "opportunity") {
                    prefetchOpportunityDrawerFullOnRowIntent(actionEntityId);
                  }
                }}
                onFocus={() => prefetchOpportunityQueueRowIntent(queue, actionEntityId, opportunityDrawerWorkspaceContext)}
                onClick={() => fireQueueRowOpenRecord(queue, item, onAction, "card")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fireQueueRowOpenRecord(queue, item, onAction, "keyboard");
                  }
                }}
              >
                {crm ? (
                  <div
                    className="adminv2-ws-enrollment-crm-row adminv2-ws-enrollment-crm-row--split"
                    data-enrollment-row-layout="split_actions"
                  >
                    <div className="adminv2-ws-enrollment-crm-row__content">
                      <CrmCompactQueuePreview
                        slots={crm}
                        urgencyTier={tier}
                        operationalAttentionBadge={attentionAccent}
                        scanMode
                        waitlistCandidateRow={
                          item.placementWaitlistCandidate && placementShowBucketChip
                            ? item.placementWaitlistCandidate
                            : undefined
                        }
                        waitlistPlacementV2={
                          !item.placementWaitlistCandidate && item.placementPriorityV2 && placementShowBucketChip
                            ? item.placementPriorityV2
                            : undefined
                        }
                        waitlistPlacementPreview={
                          !item.placementWaitlistCandidate &&
                          !item.placementPriorityV2 &&
                          item.placementPriority &&
                          placementShowBucketChip
                            ? item.placementPriority
                            : undefined
                        }
                        waitlistStatusLabel={crm.statusLabel?.trim() || undefined}
                      />
                    </div>
                    {rowActionsPending ? (
                      <div
                        className="adminv2-ws-enrollment-crm-row__actions shrink-0 self-center pl-2"
                        aria-hidden
                        data-queue-row-actions-pending="true"
                      >
                        <span className="inline-block h-7 w-[4.5rem] rounded-md skeleton-pulse bg-alloy-stone/12" />
                        <span className="ml-1.5 inline-block h-7 w-[4.5rem] rounded-md skeleton-pulse bg-alloy-stone/12" />
                      </div>
                    ) : rowQuickActions.length ? (
                      <div className="adminv2-ws-enrollment-crm-row__actions" role="group" aria-label="Actions">
                        <div className="adminv2-ws-enrollment-crm-row__action-stack">
                          {rowQuickActions.map((qa) => {
                            const dispatchId = queueQuickActionDispatchId(qa);
                            const isOpen = dispatchId === "open_record";
                            return (
                              <button
                                key={`${item.id}-qa-${qa.id}`}
                                type="button"
                                className={
                                  isOpen
                                    ? "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open"
                                    : "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--quiet"
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAction({
                                    type: "queue.item.action",
                                    queueId: queue.id,
                                    itemId: actionEntityId,
                                    actionId: dispatchId,
                                    payload: mergeQueueActionPayload(queue, qa.payload),
                                  });
                                }}
                              >
                                {qa.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="adminv2-ws-wu-queue-card-compact-text">
                    <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">{item.title}</div>
                    {item.subtitle?.trim() ? (
                      <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">{item.subtitle.trim()}</div>
                    ) : null}
                    {item.tags && item.tags.length > 0 ? (
                      <div className="adminv2-ws-wu-queue-card-tags" aria-label="Context">
                        {item.tags.map((t) => (
                          <span key={`${item.id}-tag-${t}`} className="adminv2-ws-wu-queue-card-tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {item.routeLabel?.trim() ? (
                      <div className="adminv2-ws-wu-queue-card-route adminv2-ws-wu-queue-card-route--compact">{item.routeLabel.trim()}</div>
                    ) : null}
                    {item.windowLabel?.trim() ? (
                      <div className="adminv2-ws-wu-queue-card-window adminv2-ws-wu-queue-card-window--compact">{item.windowLabel.trim()}</div>
                    ) : null}
                    {item.metaLines && item.metaLines.length > 0 ? (
                      <ul
                        className={
                          item.metaDensity === "inline"
                            ? "adminv2-ws-wu-queue-card-meta adminv2-ws-wu-queue-card-meta--inline mt-1 list-none pl-0 m-0"
                            : "adminv2-ws-wu-queue-card-meta mt-1 space-y-0.5 list-none pl-0 m-0"
                        }
                        aria-label="Inquiry details"
                      >
                        {item.metaLines.map((line) => (
                          <li
                            key={`${item.id}-${line.label}`}
                            className={
                              item.metaDensity === "inline"
                                ? "adminv2-ws-wu-queue-meta-inline-item text-[10px] leading-snug"
                                : "flex flex-wrap gap-x-1.5 gap-y-0 text-[11px] leading-snug"
                            }
                            style={{ color: "var(--d-muted, rgba(55,65,81,0.85))" }}
                          >
                            {item.metaDensity === "inline" ? (
                              <>
                                <span className="adminv2-ws-wu-queue-meta-inline-k">{line.label}</span>
                                <span className="min-w-0 break-words">{line.value}</span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium shrink-0">{line.label}</span>
                                <span className="min-w-0 break-words">{line.value}</span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {item.placementWaitlistCandidate && placementShowBucketChip ? (
                      <QueueRowPlacementCandidateContext row={item.placementWaitlistCandidate} />
                    ) : item.placementPriorityV2 && placementShowBucketChip ? (
                      <QueueRowPlacementPriorityV2Panel preview={item.placementPriorityV2} />
                    ) : item.placementPriority && placementShowBucketChip ? (
                      <QueueRowPlacementPriorityStrip preview={item.placementPriority} />
                    ) : null}
                  </div>
                )}
                {!crm ? (
                  <div className="adminv2-ws-wu-queue-card-compact-aside">
                    {hasValue ? (
                      <span className="adminv2-ws-wu-queue-value adminv2-ws-wu-queue-value--compact" aria-label="Value">
                        {valueShown}
                      </span>
                    ) : null}
                    <div className="adminv2-ws-wu-queue-card-compact-cta-row">
                      {rowActionsPending ? (
                        <div
                          className="adminv2-ws-wu-queue-card-quick-actions"
                          aria-hidden
                          data-queue-row-actions-pending="true"
                        >
                          <span className="inline-block h-7 w-[4.5rem] rounded-md skeleton-pulse bg-alloy-stone/12" />
                          <span className="ml-1.5 inline-block h-7 w-[4.5rem] rounded-md skeleton-pulse bg-alloy-stone/12" />
                        </div>
                      ) : rowQuickActions.length ? (
                        <div className="adminv2-ws-wu-queue-card-quick-actions" role="group" aria-label="Quick actions">
                          {rowQuickActions.map((qa) => {
                            const qaDispatchId = queueQuickActionDispatchId(qa);
                            const isOpenQa = qaDispatchId === "open_record";
                            return (
                              <button
                                key={`${item.id}-qa-${qa.id}`}
                                type="button"
                                className={
                                  isOpenQa
                                    ? "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open"
                                    : "adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--quiet"
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAction({
                                    type: "queue.item.action",
                                    queueId: queue.id,
                                    itemId: actionEntityId,
                                    actionId: qaDispatchId,
                                    payload: mergeQueueActionPayload(queue, qa.payload),
                                  });
                                }}
                              >
                                {qa.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      {rowQuickActions.some((qa) => queueQuickActionDispatchId(qa) === "open_record") ? null : (
                        <button
                          type="button"
                          className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAction({
                              type: "queue.item.action",
                              queueId: queue.id,
                              itemId: actionEntityId,
                              actionId: "open_record",
                              payload: mergeQueueActionPayload(queue),
                            });
                          }}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              ) : null}
            </li>
          );
        })}
        </ul>
      </div>
    </section>
  );
}

export default function QueueBlock({
  queue,
  onAction,
  variant = "primary",
  surface = "default",
  opportunityDrawerWorkspaceContext = null,
}: Props) {
  const isPrimary = variant === "primary";

  if (surface === "department") {
    return <DepartmentRollupLane queue={queue} onAction={onAction} variant={variant} />;
  }

  if (surface === "work_unit") {
    return (
      <WorkUnitQueueLane
        queue={queue}
        onAction={onAction}
        opportunityDrawerWorkspaceContext={opportunityDrawerWorkspaceContext}
      />
    );
  }

  return (
    <div
      className={`adminv2-ws-zone adminv2-ws-zone--queue ${isPrimary ? "adminv2-ws-zone--dominant" : ""}`}
      style={{ padding: "12px 14px" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3 style={{ fontSize: isPrimary ? 15 : 13, fontWeight: 700, color: neutral.textPrimary, margin: 0 }}>
            {queue.title}
          </h3>
          {queue.countBadge != null && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 999,
                background: derived.border,
                color: neutral.textPrimary,
              }}
            >
              {queue.countBadge}
            </span>
          )}
        </div>
        {queue.viewAllActionId && (
          <button
            type="button"
            onClick={() =>
              onAction({
                type: "queue.item.action",
                queueId: queue.id,
                itemId: "__view_all__",
                actionId: queue.viewAllActionId!,
              })
            }
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: derived.textSecondary,
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            {queue.viewAllLabel ?? "View all"}
          </button>
        )}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {queue.items.map((item) => (
          <li
            key={item.id}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${derived.border}`,
              background: neutral.surface,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: neutral.textPrimary }}>{item.title}</div>
            {item.subtitle && (
              <div style={{ fontSize: 11, color: derived.textSecondary, marginTop: 2 }}>{item.subtitle}</div>
            )}
            {item.aiPrioritization && (
              <div style={{ fontSize: 10, color: brand.secondary, marginTop: 4, fontStyle: "italic" }}>
                {item.aiPrioritization}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {item.quickActions.map((qa) => (
                <button
                  key={qa.id}
                  type="button"
                  onClick={() =>
                    onAction({
                      type: "queue.item.action",
                      queueId: queue.id,
                      itemId: item.id,
                      actionId: qa.id,
                    })
                  }
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 6,
                    border: `1px solid ${derived.border}`,
                    background: neutral.surface,
                    color: neutral.textPrimary,
                    cursor: "pointer",
                  }}
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
