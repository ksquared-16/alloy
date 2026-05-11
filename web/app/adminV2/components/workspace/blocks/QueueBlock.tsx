"use client";

import { useMemo, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type {
  CrmCompactRowSemanticSlots,
  QueueItemQuickActionVm,
  QueueItemVm,
  QueueVm,
  WorkUnitQueueCrmFactColumnGridVm,
  WorkUnitQueueCrmFactGroupKind,
  WorkUnitQueueCrmFactGroupVm,
  WorkUnitQueueCrmFactLineVm,
  WorkUnitQueueCrmFactPartVm,
} from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";
import { DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS } from "@/lib/ui-v2/queueUiConfig";
import { normalizePreviewLooseDateTokens } from "@/lib/adminFormatters";
import { CRM_COMPACT_VALUE_DOT_SEP } from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import { QueueRowPlacementPriorityStrip } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityStrip";

type Props = {
  queue: QueueVm;
  onAction: WorkspaceActionHandler;
  /** Visual weight — primary queue is dominant in department view */
  variant?: "primary" | "secondary";
  surface?: "default" | "department" | "work_unit";
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
    queue.viewAllActionId ? "adminv2-ws-dept-rollup-card-hit" : "",
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
  return item.groupKey?.trim() || item.groupLabel?.trim() || undefined;
}

function queueQuickActionDispatchId(qa: QueueItemQuickActionVm): string {
  const withAction = qa as QueueItemQuickActionVm & { actionId?: string };
  if (typeof withAction.actionId === "string" && withAction.actionId.trim()) return withAction.actionId.trim();
  if (qa.id === "open") return "open_record";
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

/**
 * CRM-compact queue preview — 3 zones: identity (left), fact groups (middle), actions (host).
 * Middle follows work-unit queue row doctrine when `crmFactGroups` is set.
 * Exported for dev-only visual review fixtures (`/dev/p1c-operational-attention-review`).
 */
export function CrmCompactQueuePreview({
  slots,
  urgencyTier = "standard",
  scanMode = false,
}: {
  slots: CrmCompactRowSemanticSlots;
  urgencyTier?: QueueItemVm["urgencyTier"];
  /** Work-unit lane: minimal left column — status, operational attention, next hint; detail belongs in drawer. */
  scanMode?: boolean;
}) {
  const stageStatus =
    slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel
      ? `${slots.stageLabel} · ${slots.statusLabel}`
      : slots.stageLabel || slots.statusLabel || null;
  const noteStress = Boolean(slots.attentionReason?.trim());
  const operationalStrong = Boolean(slots.attentionReason?.trim());
  const nextHint = slots.operationalNextHint?.trim() ?? "";

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
    `adminv2-ws-crm-queue-preview__body${hasMiddle ? "" : " adminv2-ws-crm-queue-preview__body--identity-only"}`;

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
                  className={`adminv2-ws-crm-queue-preview__status-pill adminv2-ws-crm-queue-preview__status-pill--wrap adminv2-ws-crm-queue-preview__status-pill--urgency-${urgencyTier}`}
                >
                  {formatWorkUnitQueueStatusPill(stageStatus)}
                </span>
              </div>
            ) : null}
            <div className="adminv2-ws-crm-queue-preview__title-row adminv2-ws-crm-queue-preview__title-row--scan">
              <span className="adminv2-ws-crm-queue-preview__title" title={slots.primaryIdentity}>
                {slots.primaryIdentity}
              </span>
            </div>
            {slots.attentionReason?.trim() ? (
              <div className="adminv2-ws-crm-queue-preview__attention-headline">{slots.attentionReason.trim()}</div>
            ) : null}
            {nextHint ? (
              <div className="adminv2-ws-crm-queue-preview__operational-next-scan">Next: {nextHint}</div>
            ) : null}
          </div>

          {hasMiddle ? (
            <div className="adminv2-ws-crm-queue-preview__zone adminv2-ws-crm-queue-preview__zone--middle">
              {useDoctrine
                ? slots.crmFactGroups!.map((g, i) => <CrmWorkUnitFactGroup key={i} group={g} />)
                : <LegacyCrmCompactQueueMiddle slots={slots} />}
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
          {slots.attentionReason?.trim() ? (
            <div className="adminv2-ws-crm-queue-preview__attention">{slots.attentionReason.trim()}</div>
          ) : null}
          {nextHint ? (
            <div className="adminv2-ws-crm-queue-preview__operational-next text-[11px] leading-snug text-alloy-midnight/58">
              Next: {nextHint}
            </div>
          ) : null}
          {slots.activityStale ? <span className={staleToneResolved}>{slots.activityStale.label}</span> : null}
        </div>

        {hasMiddle ? (
          <div className="adminv2-ws-crm-queue-preview__zone adminv2-ws-crm-queue-preview__zone--middle">
            {useDoctrine
              ? slots.crmFactGroups!.map((g, i) => <CrmWorkUnitFactGroup key={i} group={g} />)
              : <LegacyCrmCompactQueueMiddle slots={slots} />}
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

function WorkUnitQueueLane({ queue, onAction }: { queue: QueueVm; onAction: WorkspaceActionHandler }) {
  const listShellRef = useRef<HTMLDivElement>(null);
  const [refreshMinHeightPx, setRefreshMinHeightPx] = useState<number>();

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
    for (const item of queue.items) {
      const k = workUnitSectionKey(item);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [queue.items]);

  let lastSectionKey: string | undefined;

  const showQueueHeader = Boolean(queue.title?.trim());
  const placementShowBucketChip = queue.placementDisplay?.show_bucket_chip !== false;
  const placementShowSortHint = queue.placementDisplay?.show_sort_hint !== false;
  const waitlistPlacementSections = useMemo(
    () => queue.items.some((i) => i.placementPriority != null && !i.placementPriority.evaluateError),
    [queue.items]
  );
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
              <span className="adminv2-ws-wu-queue-count-badge" aria-label={`${queue.countBadge} in queue`}>
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
      {placementShowSortHint && queue.placementProjectionHint?.trim() ? (
        <p className="adminv2-ws-wu-queue-placement-hint" role="note">
          {queue.placementProjectionHint.trim()}
        </p>
      ) : null}
      <div
        ref={listShellRef}
        className="relative min-h-0 min-w-0"
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
            queue.rowsRefreshing ? "opacity-[0.76] pointer-events-none" : "opacity-100"
          }`}
          aria-busy={Boolean(queue.rowsRefreshing)}
          role="list"
        >
        {queue.rowsLoading && queue.items.length === 0 ? (
          <li className="adminv2-ws-wu-queue-empty-wrap" role="status" aria-busy="true" aria-label="Loading queue rows">
            <div className="adminv2-ws-wu-queue-empty-panel">
              <p className="adminv2-ws-wu-queue-empty-title">Loading…</p>
              {queue.laneQueueLabel?.trim() ? (
                <p className="adminv2-ws-wu-queue-empty-queue text-alloy-forge/55">{queue.laneQueueLabel.trim()}</p>
              ) : null}
            </div>
          </li>
        ) : !queue.rowsLoading && queue.items.length === 0 ? (
          <li className="adminv2-ws-wu-queue-empty-wrap" role="status">
            <div className="adminv2-ws-wu-queue-empty-panel">
              <p className="adminv2-ws-wu-queue-empty-title">No records</p>
              {queue.laneQueueLabel?.trim() ? (
                <p className="adminv2-ws-wu-queue-empty-queue">{queue.laneQueueLabel.trim()}</p>
              ) : null}
            </div>
          </li>
        ) : null}
        {queue.items.map((item) => {
          const sectionKey = workUnitSectionKey(item);
          const showGroup = sectionKey && sectionKey !== lastSectionKey;
          if (sectionKey) lastSectionKey = sectionKey;

          const tier = item.urgencyTier ?? "standard";
          const attentionAccent = Boolean(item.needsOperationalAttention);
          const rowQuickActions = orderedQueueQuickActions(item.quickActions);
          const crm = item.semanticCrmCompact;
          const valueShown = (crm?.commercialValue ?? item.valueLabel)?.trim() ?? "";
          const hasValue = Boolean(valueShown);

          const headerCfg = sectionKey ? queue.workUnitGroupHeaders?.[sectionKey] : undefined;
          const count = sectionKey ? (groupCounts.get(sectionKey) ?? 0) : 0;
          const sectionTitle =
            showGroup && sectionKey
              ? headerCfg
                ? `${headerCfg.emoji ? `${headerCfg.emoji} ` : ""}${headerCfg.label} (${count})`
                : `${sectionKey} (${count})`
              : null;

          return (
            <li key={item.id} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
              {sectionTitle ? (
                <div
                  className={[
                    "adminv2-ws-wu-queue-section-label",
                    headerCfg ? "adminv2-ws-wu-queue-section-label--rich" : "",
                    waitlistPlacementSections && showGroup ? "adminv2-ws-wu-queue-section-label--waitlist" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="presentation"
                >
                  {sectionTitle}
                </div>
              ) : null}
              <div
                className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-${tier}${
                  attentionAccent ? " adminv2-ws-wu-queue-card--attention-accent" : ""
                }`}
                data-ws-wu-urgency={tier}
                data-ws-needs-attention={attentionAccent ? "true" : undefined}
                role="button"
                tabIndex={0}
                onClick={() =>
                  onAction({
                    type: "queue.item.action",
                    queueId: queue.id,
                    itemId: item.id,
                    actionId: "open_record",
                    payload: mergeQueueActionPayload(queue),
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onAction({
                      type: "queue.item.action",
                      queueId: queue.id,
                      itemId: item.id,
                      actionId: "open_record",
                      payload: mergeQueueActionPayload(queue),
                    });
                  }
                }}
              >
                {crm ? (
                  <div className="adminv2-ws-enrollment-crm-row adminv2-ws-enrollment-crm-row--split" data-enrollment-row-layout="split_actions">
                    <div className="adminv2-ws-enrollment-crm-row__content">
                      <CrmCompactQueuePreview slots={crm} urgencyTier={tier} scanMode />
                      {item.placementPriority && placementShowBucketChip ? (
                        <QueueRowPlacementPriorityStrip preview={item.placementPriority} />
                      ) : null}
                    </div>
                    {rowQuickActions.length ? (
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
                                    itemId: item.id,
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
                    {item.placementPriority && placementShowBucketChip ? (
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
                      {rowQuickActions.length ? (
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
                                    itemId: item.id,
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
                              itemId: item.id,
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
            </li>
          );
        })}
        </ul>
      </div>
    </section>
  );
}

export default function QueueBlock({ queue, onAction, variant = "primary", surface = "default" }: Props) {
  const isPrimary = variant === "primary";

  if (surface === "department") {
    return <DepartmentRollupLane queue={queue} onAction={onAction} variant={variant} />;
  }

  if (surface === "work_unit") {
    return <WorkUnitQueueLane queue={queue} onAction={onAction} />;
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
