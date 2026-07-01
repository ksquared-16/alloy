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
import { logQueueRowOpenHandler } from "@/lib/debug/queueRowClickDebug";
import {
  prefetchOpportunityDrawerOnRowIntent,
  prefetchOpportunityDrawerFullOnRowIntent,
  type OpportunityDrawerIntentContext,
} from "@/lib/admin/opportunityDrawerIntentPrefetch";
import { warmQueueRowOpportunityVm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm";
import { queueRowGrainActionPayload, queueRowGrainContextFromPreviewItem } from "@/lib/queues/queueRowGrainContext";
import { prepareDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { PERSON_DRAWER_CHILD_OPEN_SOURCE } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { DEFAULT_QUEUE_ROW_PREVIEW_FIELD_LABELS } from "@/lib/ui-v2/queueUiConfig";
import { normalizePreviewLooseDateTokens } from "@/lib/adminFormatters";
import LayoutRuntimeQueueRowView from "@/components/layout/LayoutRuntimeQueueRowView";
import LayoutRuntimeQueueRowHold from "@/components/layout/LayoutRuntimeQueueRowHold";
import OperationalQueueRecordRow from "@/components/layout/OperationalQueueRecordRow";
import { buildOperationalQueueRecordViewModelFromCrmSlots } from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import type { LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import OpportunityQueueRowLayoutRuntimeShadowMount from "@/components/admin/workspace/OpportunityQueueRowLayoutRuntimeShadowMount";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { stageKeyFromQueueDrillWorkUnitKey } from "@/lib/layout/buildLayoutAssignmentContext";
import { useOpportunityQueueLayoutRuntime } from "@/lib/layout/runtime/useOpportunityQueueLayoutRuntime";
import { opportunityQueueLayoutRuntimeRowsPossible } from "@/lib/workspace/opportunityQueueLayoutRuntimeActivation";
import { CRM_COMPACT_VALUE_DOT_SEP } from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import {
  orderedQueueQuickActions,
  queueQuickActionDispatchId,
} from "@/lib/ui-v2/queueRowQuickActionHelpers";
import {
  resolveQueueRecordLayoutConfig,
  type QueueRecordLayoutConfig,
} from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import { queueRecordLayoutForDocKind } from "@/lib/layout/queueRecordLayoutConfig";
import {
  resolveWorkUnitQueueRowPresentationPlan,
  shouldUseOperationalRecordFrame,
  workUnitQueueRowBandDataAttribute,
} from "@/lib/ui-v2/workUnitQueueRowPresentation";
import { buildAttentionExpandedDetail } from "@/lib/ui-v2/workUnitQueueRowHeaderPresentation";
import {
  QueueRowAttentionSupplementBand,
  QueueRowCompactOperationalHeader,
  QueueRowCompactParentContact,
  QueueRowLifecycleOperationalBand,
  QueueRowOperationalReadPreview,
} from "@/app/adminV2/components/workspace/blocks/QueueRowOperationalBands";
import { QueueRowPlacementPriorityStrip } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityStrip";
import {
    QueueRowPlacementCandidateContext,
    QueueRowPlacementCandidateMetaChips,
} from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementCandidatePanel";import { QueueRowPlacementManualOrderControls } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementManualOrderControls";
import { QueueRowPlacementPriorityV2Panel } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityV2Panel";
import { WorkUnitQueueLaneRowSkeleton } from "@/components/admin/workspace/WorkUnitQueueCompactRowSkeleton";
import RelatedRecordDrawerIconButton from "@/components/admin/drawer/RelatedRecordDrawerIconButton";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
import { perfIntent } from "@/lib/perf/perfNamespaceLog";
import { useOperationalModeEntryOptional } from "@/lib/adminV2/runtime/operationalSubject/OperationalModeEntryContext";
import { useAlloyOsRuntimeSplitActive } from "@/lib/adminV2/runtime/useAlloyOsRuntimeSplitActive";
import OperationalModeQueuePreparePanel from "@/app/adminV2/components/workspace/blocks/OperationalModeQueuePreparePanel";
import { CompressedQueueRow } from "@/app/adminV2/components/workspace/blocks/CompressedQueueRow";
import { resolveCompressedQueueRowDisplay } from "@/lib/adminV2/runtime/compressedQueueRowFields";
import {
  compressedQueueRowShowsChildCount,
  resolveCompressedQueueRowCue,
} from "@/lib/adminV2/runtime/compressedQueueRowCue";
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
  /** Row-level inline open pending (cold VM) — opportunity id. */
  queueRowOpenPendingOpportunityId?: string | null;
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
  logQueueRowOpenHandler("record_open", `QueueBlock_${surface}`, "fireQueueRowOpenRecord", actionEntityId);
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

function prefetchQueueRowPersonDrawerIntent(
  personId: string,
  workspaceContext?: OpportunityDrawerIntentContext | null
): void {
  void prepareDrawerViewModel({
    entityType: "persons",
    entityId: personId,
    openSource: "queue_row_person",
    context: {
      departmentId: workspaceContext?.department_id ?? null,
      workUnitId: workspaceContext?.work_unit_id ?? null,
    },
  });
}

function prefetchQueueRowChildDrawerIntent(
  childPersonId: string,
  workspaceContext?: OpportunityDrawerIntentContext | null
): void {
  void prepareDrawerViewModel({
    entityType: "persons",
    entityId: childPersonId,
    openSource: PERSON_DRAWER_CHILD_OPEN_SOURCE,
    presentationEmphasis: "child_lifecycle",
    context: {
      departmentId: workspaceContext?.department_id ?? null,
      workUnitId: workspaceContext?.work_unit_id ?? null,
    },
  });
}

function fireQueueRowOpenPersonDrawer(
  queue: QueueVm,
  item: QueueItemVm,
  personId: string,
  onAction: WorkspaceActionHandler
): void {
  const actionEntityId = queueItemOpportunityId(item);
  logQueueRowOpenHandler("person_open", "QueueBlock_person_icon", "fireQueueRowOpenPersonDrawer", personId);
  logAdminV2QueueRowClick({
    phase: "queue_row_click",
    itemId: actionEntityId,
    actionId: "open_person_drawer",
    queueId: queue.id,
    entityType: queue.queueEntityType ?? null,
    handlerReached: "QueueBlock_person_icon",
  });
  onAction({
    type: "queue.item.action",
    queueId: queue.id,
    itemId: actionEntityId,
    actionId: "open_person_drawer",
    payload: {
      person_id: personId,
      opportunity_id: actionEntityId,
      source: "queue_row_person_icon",
    },
  });
}

function fireQueueRowOpenChildDrawer(
  queue: QueueVm,
  item: QueueItemVm,
  childPersonId: string,
  onAction: WorkspaceActionHandler
): void {
  const actionEntityId = queueItemOpportunityId(item);
  logQueueRowOpenHandler("child_open", "QueueBlock_child_icon", "fireQueueRowOpenChildDrawer", childPersonId);
  logAdminV2QueueRowClick({
    phase: "queue_row_click",
    itemId: actionEntityId,
    actionId: "open_child_drawer",
    queueId: queue.id,
    entityType: queue.queueEntityType ?? null,
    handlerReached: "QueueBlock_child_icon",
  });
  onAction({
    type: "queue.item.action",
    queueId: queue.id,
    itemId: actionEntityId,
    actionId: "open_child_drawer",
    payload: {
      child_person_id: childPersonId,
      opportunity_id: actionEntityId,
      source: "queue_row_child_icon",
    },
  });
}

type CrmCompactDrawerRecordIconHandlers = {
  onOpenPerson: (personId: string) => void;
  onOpenChild: (childPersonId: string) => void;
  onPrefetchPerson: (personId: string) => void;
  onPrefetchChild: (childPersonId: string) => void;
};

function buildCrmQueueRowAdornmentHandler(
  handlers: CrmCompactDrawerRecordIconHandlers,
  contactPersonId: string | null | undefined
): (item: LayoutItem, adornment: LayoutFieldAdornment, rowRecord?: ProofRuntimeRecord) => void {
  return (_item, adornment, rowRecord) => {
    const action = adornment.action;
    if (!action || action.type !== "open_drawer") return;
    if (action.entity === "child") {
      const id = rowRecord?.["child.id"] ?? rowRecord?.person_id ?? rowRecord?.id;
      const childId = id == null ? "" : String(id).trim();
      if (childId) {
        handlers.onPrefetchChild(childId);
        handlers.onOpenChild(childId);
      }
      return;
    }
    const personId = contactPersonId?.trim() ?? "";
    if (action.entity === "person" && personId) {
      handlers.onPrefetchPerson(personId);
      handlers.onOpenPerson(personId);
    }
  };
}

function fireQueueRowQuickAction(
  queue: QueueVm,
  item: QueueItemVm,
  qa: QueueItemQuickActionVm,
  dispatchId: string,
  onAction: WorkspaceActionHandler
): void {
  const actionEntityId = queueItemOpportunityId(item);
  onAction({
    type: "queue.item.action",
    queueId: queue.id,
    itemId: actionEntityId,
    actionId: dispatchId,
    payload: mergeQueueActionPayload(queue, qa.payload),
  });
}

/** CRM/layout-runtime fallback host — must keep routing to OperationalQueueRecordRow (queue-record-doctrine). */
function WorkUnitOperationalQueueRow({
  slots,
  queue,
  item,
  onAction,
  onOpen,
  drawerRecordIconHandlers,
  rowQuickActions,
  rowActionsPending,
  collapsed,
  onToggleCollapsed,
  waitlistPlacementPreview,
  waitlistPlacementV2,
  waitlistCandidateRow,
  waitlistStatusLabel,
  operationalAttentionBadge,
  queueRecordConfig,
}: {
  slots: CrmCompactRowSemanticSlots;
  queue: QueueVm;
  item: QueueItemVm;
  onAction: WorkspaceActionHandler;
  onOpen?: () => void;
  drawerRecordIconHandlers: CrmCompactDrawerRecordIconHandlers;
  rowQuickActions: QueueItemQuickActionVm[];
  rowActionsPending: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  waitlistPlacementPreview?: QueueRowPlacementPriorityVm;
  waitlistPlacementV2?: QueueRowPlacementPriorityV2Vm;
  waitlistCandidateRow?: import("@/lib/ui-v2/workspace-types").QueueRowPlacementWaitlistCandidateVm;
  waitlistStatusLabel?: string;
  operationalAttentionBadge?: boolean;
  queueRecordConfig?: QueueRecordLayoutConfig;
}) {
  const operationalVm = buildOperationalQueueRecordViewModelFromCrmSlots(slots, {
    config: queueRecordConfig,
    waitlistStatusLabel,
    waitlistPlacementLabel:
      waitlistPlacementV2?.familyBucketLabel?.trim() ||
      waitlistPlacementPreview?.priorityRuleLabel?.trim() ||
      waitlistPlacementPreview?.waitlistProgramShortLabel?.trim() ||
      null,
    waitlistCandidateChildName: waitlistCandidateRow?.childDisplayName ?? null,
    waitlistCandidateChildPersonId: slots.childPersonId ?? slots.childrenLines?.[0]?.personId ?? null,
    waitlistCandidateProgram: waitlistCandidateRow?.cohortLabel ?? null,
  });
  const operationalRecord = buildOpportunityQueueRowRecordFromPreview({
    ...item,
    semanticCrmCompact: slots,
  } as import("@/lib/ui-v2/workspace-types").QueuePreviewItemVm);

  return (
    <div
      className="adminv2-ws-crm-queue-preview adminv2-ws-enrollment-crm-preview adminv2-ws-crm-queue-preview--scan adminv2-ws-crm-queue-preview--operational-row"
      data-queue-preview="crm_compact_operational_row"
      data-queue-row-runtime-path="crm_compact_operational_row"
    >
      <OperationalQueueRecordRow
        vm={operationalVm}
        record={operationalRecord}
        config={queueRecordConfig}
        onOpen={onOpen}
        drawerHandlers={drawerRecordIconHandlers}
        rowActions={rowQuickActions}
        rowActionsPending={rowActionsPending}
        onRowAction={(qa, dispatchId) => fireQueueRowQuickAction(queue, item, qa, dispatchId, onAction)}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        showAttentionAccent={operationalAttentionBadge}
      />
    </div>
  );
}

function buildCrmCompactDrawerRecordIconHandlers(
  queue: QueueVm,
  item: QueueItemVm,
  onAction: WorkspaceActionHandler,
  workspaceContext?: OpportunityDrawerIntentContext | null
): CrmCompactDrawerRecordIconHandlers | undefined {
  if (queue.queueEntityType !== "opportunity") return undefined;
  return {
    onOpenPerson: (personId) => fireQueueRowOpenPersonDrawer(queue, item, personId, onAction),
    onOpenChild: (childPersonId) => fireQueueRowOpenChildDrawer(queue, item, childPersonId, onAction),
    onPrefetchPerson: (personId) => prefetchQueueRowPersonDrawerIntent(personId, workspaceContext),
    onPrefetchChild: (childPersonId) => prefetchQueueRowChildDrawerIntent(childPersonId, workspaceContext),
  };
}

function resolveRelatedRecordPersonId(
  rowIdx: number,
  colKey: string | undefined,
  slots: CrmCompactRowSemanticSlots | undefined
): string | null {
  if (!slots) return null;
  if (colKey === "primary_contact") return slots.contactPersonId?.trim() || null;
  if (colKey === "child_name") {
    const lines = slots.childrenLines ?? [];
    return (
      lines[rowIdx]?.personId?.trim() ||
      (lines.length <= 1 && rowIdx === 0 ? slots.childPersonId?.trim() : "") ||
      null
    );
  }
  return null;
}

function queueRowRelatedRecordIcon(
  personId: string,
  displayName: string,
  recordKind: "person" | "child",
  handlers: CrmCompactDrawerRecordIconHandlers
) {
  return (
    <RelatedRecordDrawerIconButton
      personId={personId}
      displayName={displayName}
      recordKind={recordKind}
      testId={recordKind === "child" ? "view-child-drawer-open" : "view-person-drawer-open"}
      className="adminv2-ws-queue-related-record-icon shrink-0"
      extraAttrs={
        recordKind === "person"
          ? { "data-queue-row-person-icon": "true" }
          : { "data-queue-row-child-icon": "true" }
      }
      onMouseEnter={() =>
        recordKind === "person" ? handlers.onPrefetchPerson(personId) : handlers.onPrefetchChild(personId)
      }
      onPointerDown={(e) => {
        e.stopPropagation();
        if (recordKind === "person") handlers.onPrefetchPerson(personId);
        else handlers.onPrefetchChild(personId);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (recordKind === "person") handlers.onOpenPerson(personId);
        else handlers.onOpenChild(personId);
      }}
    />
  );
}

function queueRowInlineDrawerRecordCell(
  displayName: string,
  personId: string | null | undefined,
  recordKind: "person" | "child",
  handlers: CrmCompactDrawerRecordIconHandlers | undefined
): ReactNode {
  const name = displayName.trim();
  if (!name || name === "—") return name || "—";
  const pid = personId?.trim() ?? "";
  if (!pid || !handlers) return name;

  return (
    <span
      className="adminv2-ws-queue-inline-drawer-record adminv2-ws-queue-related-record-lead"
      data-queue-inline-drawer-record={recordKind}
    >
      {queueRowRelatedRecordIcon(pid, name, recordKind, handlers)}
      <span className="adminv2-ws-queue-related-record-name min-w-0 truncate">{name}</span>
    </span>
  );
}

function queueRowInlineIconForFactColumn(
  colKey: string | undefined,
  rowIdx: number,
  displayName: string,
  slots: CrmCompactRowSemanticSlots | undefined,
  handlers: CrmCompactDrawerRecordIconHandlers | undefined
): ReactNode | null {
  if (!handlers || !slots || !displayName.trim() || displayName.trim() === "—") return null;
  if (displayName.trim().startsWith("+")) return null;
  if (colKey === "primary_contact") {
    return queueRowInlineDrawerRecordCell(displayName, slots.contactPersonId, "person", handlers);
  }
  if (colKey === "child_name") {
    return queueRowInlineDrawerRecordCell(
      displayName,
      resolveRelatedRecordPersonId(rowIdx, colKey, slots),
      "child",
      handlers
    );
  }
  return null;
}

function crmFactGridUsesRelatedRecordRows(
  grid: WorkUnitQueueCrmFactColumnGridVm,
  drawerRecordIconHandlers: CrmCompactDrawerRecordIconHandlers | undefined
): boolean {
  if (!drawerRecordIconHandlers) return false;
  const keys = grid.columnKeys ?? [];
  return keys.includes("child_name") || keys.includes("primary_contact");
}

/**
 * Horizontal related-record rows — [icon] Name | Program | … — one framed band per record.
 * Scales to additional configured columns via `columnKeys` without stacked cards.
 */
function CrmFactRelatedRecordRows({
  grid,
  slots,
  drawerRecordIconHandlers,
  compactPeopleBand = false,
}: {
  grid: WorkUnitQueueCrmFactColumnGridVm;
  slots?: CrmCompactRowSemanticSlots;
  drawerRecordIconHandlers: CrmCompactDrawerRecordIconHandlers;
  /** Hide column header row — denser people band inside operational record frame. */
  compactPeopleBand?: boolean;
}) {
  const { headers, rows, columnKeys } = grid;
  if (!headers.length || !rows.length) return null;

  const nameColKey = columnKeys?.find((k) => k === "child_name" || k === "primary_contact");
  const nameColIdx = nameColKey ? columnKeys!.indexOf(nameColKey) : 0;
  const recordKind = nameColKey === "primary_contact" ? "person" : "child";
  const trailingCols = headers
    .map((header, colIdx) => ({ header, colIdx, key: columnKeys?.[colIdx] }))
    .filter((col) => col.colIdx !== nameColIdx);

  return (
    <div
      className={`adminv2-ws-queue-related-record-rows${compactPeopleBand ? " adminv2-ws-queue-related-record-rows--compact" : ""}`}
      data-queue-related-record-layout="row_band"
    >
      {!compactPeopleBand && trailingCols.length > 0 ? (
        <div className="adminv2-ws-queue-related-record-labels" aria-hidden="true">
          <span className="adminv2-ws-queue-related-record-label-lead">
            {displayCrmFactGroupLabel(headers[nameColIdx] ?? "")}
          </span>
          {trailingCols.map((col, i) => (
            <span key={col.key ?? i} className="adminv2-ws-queue-related-record-label-field">
              <span className="adminv2-ws-queue-related-record-sep" aria-hidden="true">
                |
              </span>
              <span className="adminv2-ws-queue-related-record-label-text">
                {displayCrmFactGroupLabel(col.header)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {rows.map((row, rowIdx) => {
        const nameRaw = String(row[nameColIdx] ?? "").trim();
        if (nameRaw.startsWith("+")) {
          return (
            <div
              key={`overflow-${rowIdx}`}
              className="adminv2-ws-queue-related-record-overflow adminv2-ws-queue-fact-line"
            >
              {nameRaw}
            </div>
          );
        }
        const personId = resolveRelatedRecordPersonId(rowIdx, nameColKey, slots);
        const showIcon = Boolean(personId);

        return (
          <div
            key={`record-${rowIdx}`}
            className="adminv2-ws-queue-related-record-row"
            data-queue-related-record-row={recordKind}
            data-queue-inline-drawer-record={showIcon ? recordKind : undefined}
          >
            <div className="adminv2-ws-queue-related-record-row-lead">
              {showIcon && personId ?
                queueRowRelatedRecordIcon(personId, nameRaw || "—", recordKind, drawerRecordIconHandlers)
              : null}
              <span className="adminv2-ws-queue-related-record-name">{nameRaw || "—"}</span>
            </div>
            {trailingCols.map((col, i) => {
              const val = String(row[col.colIdx] ?? "").trim();
              if (!val || val === "—") {
                return (
                  <span
                    key={`${rowIdx}-${col.key ?? i}-empty`}
                    className="adminv2-ws-queue-related-record-field adminv2-ws-queue-related-record-field--empty"
                    data-fact-col-key={col.key}
                    aria-hidden="true"
                  />
                );
              }
              return (
                <span
                  key={`${rowIdx}-${col.key ?? i}`}
                  className="adminv2-ws-queue-related-record-field"
                  data-fact-col-key={col.key}
                >
                  <span className="adminv2-ws-queue-related-record-sep" aria-hidden="true">
                    |
                  </span>
                  <span className="adminv2-ws-queue-related-record-field-value">{val}</span>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function prefetchOpportunityQueueRowIntent(
  queue: QueueVm,
  itemId: string,
  workspaceContext?: OpportunityDrawerIntentContext | null
): void {
  if (queue.queueEntityType !== "opportunity") return;
  prefetchOpportunityDrawerOnRowIntent(itemId, workspaceContext ?? null);
  warmQueueRowOpportunityVm(itemId, workspaceContext ?? null, "queue_row_hover");
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

function CrmFactColumnGrid({
  grid,
  slots,
  drawerRecordIconHandlers,
  compactPeopleBand = false,
}: {
  grid: WorkUnitQueueCrmFactColumnGridVm;
  slots?: CrmCompactRowSemanticSlots;
  drawerRecordIconHandlers?: CrmCompactDrawerRecordIconHandlers;
  compactPeopleBand?: boolean;
}) {
  if (crmFactGridUsesRelatedRecordRows(grid, drawerRecordIconHandlers)) {
    return (
      <CrmFactRelatedRecordRows
        grid={grid}
        slots={slots}
        drawerRecordIconHandlers={drawerRecordIconHandlers!}
        compactPeopleBand={compactPeopleBand}
      />
    );
  }

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
          {rows.map((row, rowIdx) => {
            const raw = row[colIdx] ?? "";
            const colKey = columnKeys?.[colIdx];
            const inline =
              typeof raw === "string"
                ? queueRowInlineIconForFactColumn(colKey, rowIdx, raw, slots, drawerRecordIconHandlers)
                : null;
            return (
              <div key={`${rowIdx}-${colIdx}`} className="adminv2-ws-queue-fact-value adminv2-ws-queue-fact-line">
                {inline ?? raw}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Work-unit queue row doctrine — one fact group (label above, value below).
 */
function CrmWorkUnitFactGroup({
  group,
  slots,
  drawerRecordIconHandlers,
  compactPeopleBand = false,
}: {
  group: WorkUnitQueueCrmFactGroupVm;
  slots?: CrmCompactRowSemanticSlots;
  drawerRecordIconHandlers?: CrmCompactDrawerRecordIconHandlers;
  compactPeopleBand?: boolean;
}) {
  const hasGrid = Boolean(group.columnGrid?.headers.length && group.columnGrid?.rows.length);
  const showGroupLabel = Boolean(group.label?.trim());

  if (hasGrid && group.columnGrid) {
    return (
      <div className="adminv2-ws-queue-fact-group" data-fact-kind={group.kind}>
        {showGroupLabel ? (
          <div className="adminv2-ws-queue-fact-label">{displayCrmFactGroupLabel(group.label)}</div>
        ) : null}
        <CrmFactColumnGrid
          grid={group.columnGrid}
          slots={slots}
          drawerRecordIconHandlers={drawerRecordIconHandlers}
          compactPeopleBand={compactPeopleBand}
        />
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
function LegacyCrmCompactQueueMiddle({
  slots,
  drawerRecordIconHandlers,
}: {
  slots: CrmCompactRowSemanticSlots;
  drawerRecordIconHandlers?: CrmCompactDrawerRecordIconHandlers;
}) {
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
            slots={slots}
            drawerRecordIconHandlers={drawerRecordIconHandlers}
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
          slots={slots}
          drawerRecordIconHandlers={drawerRecordIconHandlers}
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
            slots={slots}
            drawerRecordIconHandlers={drawerRecordIconHandlers}
          />
        </div>
      );
    } else if (n) {
      nodes.push(
        <div key="ch" className="adminv2-ws-queue-fact-group" data-fact-kind="children_programs">
          <CrmFactColumnGrid
            grid={{ headers: [childHdr], rows: [[n]], columnKeys: ["child_name"] }}
            slots={slots}
            drawerRecordIconHandlers={drawerRecordIconHandlers}
          />
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
 * Compact operational record — lifecycle-aware band stack (work-unit scan rows).
 * Presentation only; does not alter drawer or queue runtime.
 */
function CrmCompactOperationalRecord({
  slots,
  urgencyTier = "standard",
  operationalAttentionBadge = false,
  drawerRecordIconHandlers,
  waitlistPlacementPreview,
  waitlistPlacementV2,
  waitlistCandidateRow,
  waitlistStatusLabel,
  workUnitKey,
}: {
  slots: CrmCompactRowSemanticSlots;
  urgencyTier?: QueueItemVm["urgencyTier"];
  operationalAttentionBadge?: boolean;
  drawerRecordIconHandlers: CrmCompactDrawerRecordIconHandlers;
  waitlistPlacementPreview?: QueueRowPlacementPriorityVm;
  waitlistPlacementV2?: QueueRowPlacementPriorityV2Vm;
  waitlistCandidateRow?: import("@/lib/ui-v2/workspace-types").QueueRowPlacementWaitlistCandidateVm;
  waitlistStatusLabel?: string;
  workUnitKey?: string | null;
}) {
  const plan = resolveWorkUnitQueueRowPresentationPlan({
    slots,
    scanMode: true,
    drawerRecordIconHandlers,
    waitlistPlacementPreview,
    waitlistPlacementV2,
    waitlistCandidateRow,
    waitlistStatusLabel,
    workUnitKey,
  });
  const stageStatus =
    slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel
      ? `${slots.stageLabel} · ${slots.statusLabel}`
      : slots.stageLabel || slots.statusLabel || null;
  const childrenGroup = slots.crmFactGroups?.find((g) => g.kind === "children_programs");
  const contactGroup = slots.crmFactGroups?.find((g) => g.kind === "contact");
  const factGroups =
    slots.crmFactGroups?.filter((g) => g.kind === "timing" || g.kind === "meta") ?? [];
  const useCompactParent =
    plan.people.parentCompact &&
    Boolean(
      slots.contactDisplayName?.trim() ||
        slots.contactPhoneDisplay?.trim() ||
        slots.contactEmail?.trim()
    );
  const showChildrenFirst = plan.people.childrenFirst;

  const childrenBand =
    childrenGroup ?
      <div
        className={`adminv2-ws-queue-operational-record__children-block${
          plan.people.childPrimary ? " adminv2-ws-queue-operational-record__children-block--primary" : ""
        }`}
        data-queue-people-role="children"
      >
        <CrmWorkUnitFactGroup
          group={childrenGroup}
          slots={slots}
          drawerRecordIconHandlers={drawerRecordIconHandlers}
          compactPeopleBand
        />
      </div>
    : null;

  const parentBand =
    useCompactParent ?
      <QueueRowCompactParentContact
        slots={slots}
        handlers={drawerRecordIconHandlers}
        renderIcon={queueRowRelatedRecordIcon}
      />
    : contactGroup ?
      <CrmWorkUnitFactGroup
        group={contactGroup}
        slots={slots}
        drawerRecordIconHandlers={drawerRecordIconHandlers}
        compactPeopleBand
      />
    : null;

  const peopleBandVisible = Boolean(childrenBand || parentBand);

  return (
    <div
      className="adminv2-ws-queue-operational-record"
      data-queue-preview="operational_record"
      data-queue-lifecycle={plan.lifecycle}
      data-queue-operational-record-bands={workUnitQueueRowBandDataAttribute(plan)}
    >
      <QueueRowCompactOperationalHeader
        slots={slots}
        plan={plan}
        statusDisplay={
          waitlistStatusLabel?.trim() ||
          (stageStatus ? formatWorkUnitQueueStatusPill(stageStatus) : null)
        }
        urgencyTier={urgencyTier}
        operationalAttentionBadge={operationalAttentionBadge}
        waitlistCandidateRow={waitlistCandidateRow ?? null}
      />
      {plan.headerInline.attentionExpanded && plan.bands.includes("attention") ? (
        <QueueRowAttentionSupplementBand
          detail={buildAttentionExpandedDetail(slots, plan.headerInline.enrollmentAttention)}
          lifecycle={plan.lifecycle}
        />
      ) : null}
      {plan.bands.includes("lifecycle") ? (
        <QueueRowLifecycleOperationalBand
          slots={slots}
          section={plan.lifecycleSections}
          lifecycle={plan.lifecycle}
          waitlistPlacementPreview={waitlistPlacementPreview}
          waitlistPlacementV2={waitlistPlacementV2}
          waitlistCandidateRow={waitlistCandidateRow}
          waitlistStatusLabel={waitlistStatusLabel}
          suppressCandidateContext={Boolean(plan.headerInline.waitlistSubline?.trim())}
        />
      ) : null}
      {peopleBandVisible ? (
        <div
          className="adminv2-ws-queue-operational-record__people-band"
          data-queue-row-band="people"
          data-queue-zone="people"
        >
          {showChildrenFirst ?
            <>
              {childrenBand}
              {parentBand}
            </>
          : <>
              {parentBand}
              {childrenBand}
            </>
          }
        </div>
      ) : null}
      {factGroups.length > 0 ? (
        <div
          className="adminv2-ws-queue-operational-record__facts-band"
          data-queue-row-band="facts"
          data-queue-zone="facts"
        >
          {factGroups.map((g, i) => (
            <CrmWorkUnitFactGroup
              key={`fact-${g.kind}-${i}`}
              group={g}
              slots={slots}
              drawerRecordIconHandlers={drawerRecordIconHandlers}
              compactPeopleBand
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use QueueRowOperationalReadPreview from QueueRowOperationalBands */
function CrmCompactOperationalReadPreview({
  preview,
  layout = "scan",
}: {
  preview: NonNullable<CrmCompactRowSemanticSlots["operationalReadPreview"]>;
  layout?: "scan" | "full";
}) {
  return <QueueRowOperationalReadPreview preview={preview} layout={layout} />;
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
  drawerRecordIconHandlers,
  workUnitKey,
  operationalRowHost,
  rowQuickActions = [],
  rowActionsPending = false,
  collapsed = false,
  onToggleCollapsed,
  queueRecordConfig,
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
  /** Inline person/child drawer icons beside displayed names (work-unit opportunity rows). */
  drawerRecordIconHandlers?: CrmCompactDrawerRecordIconHandlers;
  /** Lifecycle hint for band resolution — presentation only. */
  workUnitKey?: string | null;
  /** When set, operational row actions dispatch through the work-unit queue host. */
  operationalRowHost?: {
    queue: QueueVm;
    item: QueueItemVm;
    onAction: WorkspaceActionHandler;
  };
  rowQuickActions?: QueueItemQuickActionVm[];
  rowActionsPending?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  queueRecordConfig?: QueueRecordLayoutConfig;
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

  const hasCurrentWorkStrip = Boolean(slots.currentWorkLine?.trim());
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

  const useOperationalRecord = shouldUseOperationalRecordFrame({
    slots,
    scanMode,
    drawerRecordIconHandlers,
    waitlistPlacementPreview,
    waitlistPlacementV2,
    waitlistCandidateRow,
    waitlistStatusLabel,
    workUnitKey,
  });

  if (useOperationalRecord && drawerRecordIconHandlers) {
    const rowHost =
      operationalRowHost ??
      ({
        queue: { id: "crm-preview", title: "Preview", items: [] } as QueueVm,
        item: { id: "crm-preview-item", title: slots.primaryIdentity ?? "Preview", quickActions: [] } as QueueItemVm,
        onAction: (() => {}) as WorkspaceActionHandler,
      } satisfies { queue: QueueVm; item: QueueItemVm; onAction: WorkspaceActionHandler });
    return (
      <WorkUnitOperationalQueueRow
        slots={slots}
        queue={rowHost.queue}
        item={rowHost.item}
        onAction={rowHost.onAction}
        onOpen={() => fireQueueRowOpenRecord(rowHost.queue, rowHost.item, rowHost.onAction, "card")}
        drawerRecordIconHandlers={drawerRecordIconHandlers}
        rowQuickActions={rowQuickActions}
        rowActionsPending={rowActionsPending}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed ?? (() => {})}
        waitlistPlacementPreview={waitlistPlacementPreview}
        waitlistPlacementV2={waitlistPlacementV2}
        waitlistCandidateRow={waitlistCandidateRow}
        waitlistStatusLabel={waitlistStatusLabel}
        operationalAttentionBadge={operationalAttentionBadge}
        queueRecordConfig={queueRecordConfig}
      />
    );
  }

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
                ? slots.crmFactGroups!.map((g, i) => (
                    <CrmWorkUnitFactGroup
                      key={i}
                      group={g}
                      slots={slots}
                      drawerRecordIconHandlers={drawerRecordIconHandlers}
                    />
                  ))
                : (
                    <LegacyCrmCompactQueueMiddle
                      slots={slots}
                      drawerRecordIconHandlers={drawerRecordIconHandlers}
                    />
                  )}
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
          {hasCurrentWorkStrip ?
            <div className="adminv2-ws-crm-queue-preview__next-strip" aria-label="Current work">
              <span className="adminv2-ws-crm-queue-preview__next-value">{slots.currentWorkLine!.trim()}</span>
              <span className="adminv2-ws-crm-queue-preview__next-caption">Current work</span>
            </div>
          :   null}
          {hasNextStrip ?
            <div className="adminv2-ws-crm-queue-preview__next-strip" aria-label="Next step">
              <span className="adminv2-ws-crm-queue-preview__next-value">{slots.nextStep!.trim()}</span>
              <span className="adminv2-ws-crm-queue-preview__next-caption">Next step</span>
            </div>
          :   null}
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
              ? slots.crmFactGroups!.map((g, i) => (
                  <CrmWorkUnitFactGroup
                    key={i}
                    group={g}
                    slots={slots}
                    drawerRecordIconHandlers={drawerRecordIconHandlers}
                  />
                ))
              : (
                  <LegacyCrmCompactQueueMiddle
                    slots={slots}
                    drawerRecordIconHandlers={drawerRecordIconHandlers}
                  />
                )}
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

function compressedQueueRowCueFromItem(
  item: QueueItemVm,
  crm: CrmCompactRowSemanticSlots,
) {
  const childrenCount = crm.childrenLines?.length ?? (crm.childName?.trim() ? 1 : 0);
  return resolveCompressedQueueRowCue({
    childrenCount,
    tourContext: crm.tourContext,
    waitlistPositionLabel:
      item.placementWaitlistCandidate?.runtimePositionLabel ??
      item.placementPriority?.scopedWaitlistPositionLabel ??
      null,
    ageContext: crm.ageContext ?? crm.ageBandContext,
    roomContext: crm.roomContext,
    locationContext: crm.locationContext,
  });
}

function WorkUnitQueueLane({
  queue,
  onAction,
  opportunityDrawerWorkspaceContext,
  queueRowOpenPendingOpportunityId = null,
}: {
  queue: QueueVm;
  onAction: WorkspaceActionHandler;
  opportunityDrawerWorkspaceContext?: OpportunityDrawerIntentContext | null;
  queueRowOpenPendingOpportunityId?: string | null;
}) {
  const splitActive = useAlloyOsRuntimeSplitActive();
  const operationalEntry = useOperationalModeEntryOptional();
  const drawerCtx = useAdminDrawerOptional();
  const openDrawerOpportunityId =
    drawerCtx?.drawer?.type === "opportunities" ? String(drawerCtx.drawer.id ?? "") : "";
  // In-queue prep only before the first subject drawer opens. Once a subject is selected (or split
  // is active), keep rows interactive — the legacy prep panel must not replace rows and block clicks.
  const operationalModePreparing =
    operationalEntry?.phase === "preparing" &&
    !splitActive &&
    !openDrawerOpportunityId;
  // WU-05 full-width flash bridge. `splitActive` is read from the `<html>` runtime-split DOM
  // attribute, which the split controller sets in a layout effect → MutationObserver → re-render.
  // For the frame between a subject opening and that attribute propagating, `splitActive` is still
  // false while `openDrawerOpportunityId` is already set — the old code painted legacy full-width
  // rows in that gap. In runtime mode an open/opening operational subject means the split IS the
  // presentation, so render compressed rows immediately. This never renders expanded legacy rows
  // once a subject is selected; it does not touch queue data, empty semantics, or reveal gates.
  const splitRenderActive =
    splitActive || Boolean(openDrawerOpportunityId);
  // WU-05 single presentation owner. In Alloy OS runtime mode compressed rows are the ONLY allowed
  // presentation — the legacy full-width branch (LayoutRuntimeQueueRowView / CrmCompactQueuePreview)
  // is quarantined behind flag-off, so no stale phase / pre-split frame can flash it. `splitActive`
  // and the operational-entry signal remain as flag-off-safe contributors (and feed the active-row
  // highlight). Queue data, empty/known-empty semantics, and skeletons are untouched (handled before
  // the row map); `crm` is still required for compression.
  const runtimeQueuePresentationLocked = operationalEntry != null;
  const compressedRowPresentation = true;
  const listShellRef = useRef<HTMLDivElement>(null);
  const [refreshMinHeightPx, setRefreshMinHeightPx] = useState<number>();
  /** Client-only collapsed waitlist program/room groups (placement sections). */
  const [collapsedPlacementGroups, setCollapsedPlacementGroups] = useState<Set<string>>(() => new Set());
  /** Client-only per-row collapse (expanded by default). */
  const [collapsedRowIds, setCollapsedRowIds] = useState<Set<string>>(() => new Set());
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

  const queueLaneStageKey = useMemo(
    () => stageKeyFromQueueDrillWorkUnitKey(queue.drillWorkUnitKey),
    [queue.drillWorkUnitKey],
  );

  // Only fetch the lane layout doc when a row could actually render through the
  // legacy layout path (a row lacking `semanticCrmCompact`, or flag-off). With the
  // canonical compressed rows owning every crm row, the doc is otherwise unused, so
  // this skips a decoupled per-lane fetch waterfall on the work-unit page. Reveal
  // gates and queue empty-state semantics are untouched.
  const layoutRuntimeRowsPossible = useMemo(
    () => opportunityQueueLayoutRuntimeRowsPossible(queue.items, true),
    [queue.items],
  );
  const queueLayoutRuntime = useOpportunityQueueLayoutRuntime(
    `${queue.id}:${queue.drillWorkUnitKey ?? "lane"}:${hasCandidatePlacementRows ? "waitlist" : "pipeline"}:${queueLaneStageKey ?? ""}`,
    {
      drillWorkUnitKey: queue.drillWorkUnitKey,
      businessProcessKey: queue.businessProcessKey,
      stageKey: queueLaneStageKey,
      isWaitlistCandidate: hasCandidatePlacementRows,
      grain: hasCandidatePlacementRows ? "candidate" : "case",
    },
    queue.pinnedQueueLayoutId,
    { active: layoutRuntimeRowsPossible },
  );
  const layoutQueueEnabled =
    queue.queueEntityType === "opportunity" && queueLayoutRuntime.enabled && layoutRuntimeRowsPossible;
  const useLayoutQueueRows = layoutQueueEnabled && queueLayoutRuntime.doc != null;
  const showLayoutQueueHold =
    layoutQueueEnabled && (queueLayoutRuntime.loading || queueLayoutRuntime.doc == null);
  const queueRecordConfig = useMemo(() => {
    if (queueLayoutRuntime.doc) return resolveQueueRecordLayoutConfig(queueLayoutRuntime.doc);
    return queueRecordLayoutForDocKind(hasCandidatePlacementRows);
  }, [queueLayoutRuntime.doc, hasCandidatePlacementRows]);

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

  const waitlistCategoryContext = queue.waitlistProgramCategoryContext ?? null;

  const waitlistSectionPlan = useMemo(
    () =>
      waitlistPlacementSections
        ? buildWaitlistQueueBlockSectionPlan(queue.items, waitlistCategoryContext)
        : null,
    [queue.items, waitlistPlacementSections, waitlistCategoryContext]
  );

  const displayQueueItems = useMemo(
    () =>
      waitlistPlacementSections
        ? sortWaitlistQueueItemsForDisplay(queue.items, waitlistCategoryContext)
        : queue.items,
    [queue.items, waitlistPlacementSections, waitlistCategoryContext]
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
        data-workspace-queue-scrollport="true"
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
          {...alloySectionDomAttrs("WU-05")}
        >
        {operationalModePreparing ?
            <OperationalModeQueuePreparePanel message={operationalEntry.message} />
        : <>
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
          const drawerRecordIconHandlers = buildCrmCompactDrawerRecordIconHandlers(
            queue,
            item,
            onAction,
            opportunityDrawerWorkspaceContext
          );
          const crm = item.semanticCrmCompact;
          const valueShown = (crm?.commercialValue ?? item.valueLabel)?.trim() ?? "";
          const hasValue = Boolean(valueShown);
          const actionEntityId = queueItemOpportunityId(item);
          const rowCollapsed = collapsedRowIds.has(item.id);
          const toggleRowCollapsed = () => {
            setCollapsedRowIds((prev) => {
              const next = new Set(prev);
              if (next.has(item.id)) next.delete(item.id);
              else next.add(item.id);
              return next;
            });
          };
          const rowOpenPending =
            queueRowOpenPendingOpportunityId != null &&
            queueRowOpenPendingOpportunityId === actionEntityId;
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
                className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--operational adminv2-interactive-surface relative z-[1] pointer-events-auto adminv2-ws-wu-queue-card--tier-${tier}${
                  attentionAccent ? " adminv2-ws-wu-queue-card--attention-accent" : ""
                } adminv2-ws-wu-queue-card--operational-row`}
                data-alloy-section="WU.CONDENSED_QUEUE_ROW"
                data-ws-wu-urgency={tier}
                data-ws-needs-attention={attentionAccent ? "true" : undefined}
                data-queue-row-active={
                  compressedRowPresentation &&
                  // Immediate selection: a clicked-but-not-yet-committed row (model-swap VM wait)
                  // owns the active highlight right away; otherwise fall back to the open drawer id.
                  // Suppresses the stale prior-subject highlight while a click is pending (WU-05).
                  (rowOpenPending ||
                    (!queueRowOpenPendingOpportunityId &&
                      Boolean(openDrawerOpportunityId) &&
                      openDrawerOpportunityId === actionEntityId)) ?
                      "true"
                  :   undefined
                }
                data-queue-row-open-pending={rowOpenPending ? "true" : undefined}
                data-queue-row-operational-card="true"
                aria-busy={rowOpenPending ? true : undefined}
                onMouseEnter={() => prefetchOpportunityQueueRowIntent(queue, actionEntityId, opportunityDrawerWorkspaceContext)}
                onMouseDown={() => {
                  perfIntent("click_down", { section_id: "WU-05", record_id: actionEntityId });
                  prefetchOpportunityQueueRowIntent(queue, actionEntityId, opportunityDrawerWorkspaceContext);
                  if (queue.queueEntityType === "opportunity") {
                    prefetchOpportunityDrawerFullOnRowIntent(actionEntityId);
                  }
                }}
                onFocus={() => prefetchOpportunityQueueRowIntent(queue, actionEntityId, opportunityDrawerWorkspaceContext)}
              >
                {rowOpenPending ? (
                  <span
                    className="absolute right-2 top-2 z-[2] rounded bg-alloy-midnight/5 px-1.5 py-0.5 text-[11px] font-medium text-alloy-midnight/60"
                    aria-live="polite"
                  >
                    Opening…
                  </span>
                ) : null}
                {compressedRowPresentation && crm ?
                    <>
                      {(() => {
                        const cue = compressedQueueRowCueFromItem(item, crm);
                        const display = resolveCompressedQueueRowDisplay(item, crm, cue);
                        return (
                          <CompressedQueueRow
                            identity={display.identity}
                            statusLabel={display.statusLabel}
                            line2={display.line2}
                            line3={display.line3}
                            line4={display.line4}
                            grain={display.grain}
                            tier={tier === "critical" || tier === "warning" ? tier : "standard"}
                            attention={display.attention}
                            onOpen={() => fireQueueRowOpenRecord(queue, item, onAction, "card")}
                          />
                        );
                      })()}
                      {(() => {
                            const cue = compressedQueueRowCueFromItem(item, crm);
                            if (!compressedQueueRowShowsChildCount(cue) && !cue.rightCue) return null;
                            return (
                              <div className="adminv2-ws-wu-queue-card__os-compressed-cue">
                                {compressedQueueRowShowsChildCount(cue) ?
                                    <span className="adminv2-ws-wu-queue-card__os-cue adminv2-ws-wu-queue-card__os-cue--children">
                                      {cue.childCount} children
                                    </span>
                                :   null}
                                {cue.rightCue ?
                                    <span className="adminv2-ws-wu-queue-card__os-cue">{cue.rightCue}</span>
                                :   null}
                              </div>
                            );
                          })()}
                    </>
                : <>
                {showLayoutQueueHold ?
                  <LayoutRuntimeQueueRowHold />
                : useLayoutQueueRows && queueLayoutRuntime.doc ?
                  <LayoutRuntimeQueueRowView
                    doc={queueLayoutRuntime.doc}
                    record={buildOpportunityQueueRowRecordFromPreview(item, queueLayoutRuntime.doc)}
                    item={item}
                    layoutSource={queueLayoutRuntime.layoutSource}
                    layoutKey={queueLayoutRuntime.layoutKey}
                    workUnitKey={queue.drillWorkUnitKey ?? null}
                    queueRowKey={item.id}
                    variant={hasCandidatePlacementRows ? "waitlist" : "pipeline"}
                    drawerIconHandlers={drawerRecordIconHandlers}
                    rowActions={rowQuickActions}
                    rowActionsPending={rowActionsPending}
                    collapsed={rowCollapsed}
                    onToggleCollapsed={toggleRowCollapsed}
                    onOpen={() => fireQueueRowOpenRecord(queue, item, onAction, "card")}
                    onRowAction={(qa, dispatchId) =>
                      fireQueueRowQuickAction(queue, item, qa, dispatchId, onAction)
                    }
                    vmFallback={
                      crm ? (
                        <CrmCompactQueuePreview
                          slots={crm}
                          urgencyTier={tier}
                          operationalAttentionBadge={attentionAccent}
                          scanMode
                          drawerRecordIconHandlers={drawerRecordIconHandlers}
                          operationalRowHost={{ queue, item, onAction }}
                          rowQuickActions={rowQuickActions}
                          rowActionsPending={rowActionsPending}
                          collapsed={rowCollapsed}
                          onToggleCollapsed={toggleRowCollapsed}
                          queueRecordConfig={queueRecordConfig}
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
                          workUnitKey={queue.drillWorkUnitKey ?? null}
                        />
                      ) : null
                    }
                  />
                : crm ? (
                  <CrmCompactQueuePreview
                    slots={crm}
                    urgencyTier={tier}
                    operationalAttentionBadge={attentionAccent}
                    scanMode
                    drawerRecordIconHandlers={drawerRecordIconHandlers}
                    operationalRowHost={{ queue, item, onAction }}
                    rowQuickActions={rowQuickActions}
                    rowActionsPending={rowActionsPending}
                    collapsed={rowCollapsed}
                    onToggleCollapsed={toggleRowCollapsed}
                    queueRecordConfig={queueRecordConfig}
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
                    workUnitKey={queue.drillWorkUnitKey ?? null}
                  />
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
                </>}
              </div>
              ) : null}
            </li>
          );
        })}
        </>}
        </ul>
        {queue.queueEntityType === "opportunity" ?
            <OpportunityQueueRowLayoutRuntimeShadowMount
                rowKey={`${queue.id}:${queue.drillWorkUnitKey ?? "lane"}`}
                drillWorkUnitKey={queue.drillWorkUnitKey}
                isWaitlistCandidate={hasCandidatePlacementRows}
                grain={hasCandidatePlacementRows ? "candidate" : "case"}
            />
        :   null}
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
  queueRowOpenPendingOpportunityId = null,
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
        queueRowOpenPendingOpportunityId={queueRowOpenPendingOpportunityId}
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
