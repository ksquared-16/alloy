"use client";

import { useMemo } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { CrmCompactRowSemanticSlots, QueueItemQuickActionVm, QueueItemVm, QueueVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
  queue: QueueVm;
  onAction: WorkspaceActionHandler;
  /** Visual weight — primary queue is dominant in department view */
  variant?: "primary" | "secondary";
  surface?: "default" | "department" | "work_unit";
};

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

/**
 * CRM-compact queue preview — render-only layout from `CrmCompactRowSemanticSlots`.
 * Zones: identity+status+next | structured middle | footer note/activity preview (registry fields optional).
 */
function CrmCompactQueuePreview({
  slots,
  urgencyTier = "standard",
}: {
  slots: CrmCompactRowSemanticSlots;
  urgencyTier?: QueueItemVm["urgencyTier"];
}) {
  const stageStatus =
    slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel
      ? `${slots.stageLabel} · ${slots.statusLabel}`
      : slots.stageLabel || slots.statusLabel || null;
  const noteStress = Boolean(slots.attentionReason?.trim());

  const staleTone =
    slots.activityStale?.severity === "high"
      ? "adminv2-ws-queue-preview-stale adminv2-ws-queue-preview-stale--high"
      : slots.activityStale?.severity === "medium"
        ? "adminv2-ws-queue-preview-stale adminv2-ws-queue-preview-stale--medium"
        : "adminv2-ws-queue-preview-stale adminv2-ws-queue-preview-stale--low";

  const timingParts: string[] = [];
  if (slots.ageContext?.trim()) timingParts.push(slots.ageContext.trim());
  if (slots.tourContext?.trim()) {
    const t = slots.tourContext.trim();
    timingParts.push(t.startsWith("Tour:") ? t : `Tour: ${t}`);
  }
  const timingLine = timingParts.length ? timingParts.join(" · ") : null;

  const childLines = slots.childrenLines ?? [];
  const multiChild = childLines.length >= 2;
  const visibleChildren = childLines.slice(0, 4);
  const childOverflow = Math.max(0, childLines.length - visibleChildren.length);

  const hasNextStrip = Boolean(slots.nextStep?.trim());
  const hasMiddle =
    Boolean(slots.contactSnippet?.trim()) ||
    Boolean(!multiChild && slots.childName?.trim()) ||
    multiChild ||
    Boolean(slots.programContext?.trim()) ||
    Boolean(slots.roomContext?.trim()) ||
    Boolean(timingLine);

  const bodyClass =
    `adminv2-ws-crm-queue-preview__body${hasMiddle ? "" : " adminv2-ws-crm-queue-preview__body--identity-only"}`;

  const hasFooter = Boolean(slots.familyNote?.trim() || slots.lastActivity?.trim());

  const commercial = slots.commercialValue?.trim() ?? "";

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
                className={`adminv2-ws-crm-queue-preview__status-pill adminv2-ws-crm-queue-preview__status-pill--urgency-${urgencyTier}`}
              >
                {stageStatus}
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
          {slots.activityStale ? <span className={staleTone}>{slots.activityStale.label}</span> : null}
        </div>

        {hasMiddle ? (
          <div className="adminv2-ws-crm-queue-preview__zone adminv2-ws-crm-queue-preview__zone--middle">
            {slots.contactSnippet?.trim() ? (
              <div className="adminv2-ws-crm-queue-preview__group">
                <span className="adminv2-ws-crm-queue-preview__gv">{slots.contactSnippet.trim()}</span>
                <span className="adminv2-ws-crm-queue-preview__gk">Contact</span>
              </div>
            ) : null}
            {multiChild ? (
              <div className="adminv2-ws-crm-queue-preview__group adminv2-ws-crm-queue-preview__group--children-stack">
                <span className="adminv2-ws-crm-queue-preview__gk">Children</span>
                <ul className="adminv2-ws-crm-queue-preview__children-mini" role="list">
                  {visibleChildren.map((c, idx) => (
                    <li key={idx} className="adminv2-ws-crm-queue-preview__child-mini">
                      <span className="adminv2-ws-crm-queue-preview__child-mini-primary">{c.primary}</span>
                      {c.secondary?.trim() ? (
                        <span className="adminv2-ws-crm-queue-preview__child-mini-secondary">{c.secondary.trim()}</span>
                      ) : null}
                    </li>
                  ))}
                  {childOverflow > 0 ? (
                    <li className="adminv2-ws-crm-queue-preview__child-mini adminv2-ws-crm-queue-preview__child-mini--more">
                      +{childOverflow} more
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : slots.childName?.trim() ? (
              <div className="adminv2-ws-crm-queue-preview__group">
                <span className="adminv2-ws-crm-queue-preview__gv">{slots.childName.trim()}</span>
                <span className="adminv2-ws-crm-queue-preview__gk">
                  {slots.childName.includes(" · ") ? "Children" : "Child"}
                </span>
              </div>
            ) : null}
            {slots.programContext?.trim() ? (
              <div className="adminv2-ws-crm-queue-preview__group">
                <span className="adminv2-ws-crm-queue-preview__gv">{slots.programContext.trim()}</span>
                <span className="adminv2-ws-crm-queue-preview__gk">Programs</span>
              </div>
            ) : null}
            {slots.roomContext?.trim() ? (
              <div className="adminv2-ws-crm-queue-preview__group">
                <span className="adminv2-ws-crm-queue-preview__gv">{slots.roomContext.trim()}</span>
                <span className="adminv2-ws-crm-queue-preview__gk">Room</span>
              </div>
            ) : null}
            {timingLine ? (
              <div className="adminv2-ws-crm-queue-preview__group">
                <span className="adminv2-ws-crm-queue-preview__gv">{timingLine}</span>
                <span className="adminv2-ws-crm-queue-preview__gk">Timing</span>
              </div>
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
          {slots.familyNote?.trim() ? (
            <div className="adminv2-ws-crm-queue-preview__footer-notes">
              <span className="adminv2-ws-crm-queue-preview__gv">{slots.familyNote.trim()}</span>
              <span className="adminv2-ws-crm-queue-preview__gk">Notes</span>
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
      <ul className="adminv2-ws-queue-list adminv2-ws-wu-queue-list" role="list">
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
                  className={`adminv2-ws-wu-queue-section-label${headerCfg ? " adminv2-ws-wu-queue-section-label--rich" : ""}`}
                  role="presentation"
                >
                  {sectionTitle}
                </div>
              ) : null}
              <div
                className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-${tier}`}
                data-ws-wu-urgency={tier}
                role="button"
                tabIndex={0}
                onClick={() =>
                  onAction({
                    type: "queue.item.action",
                    queueId: queue.id,
                    itemId: item.id,
                    actionId: "open_record",
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
                    });
                  }
                }}
              >
                {crm ? (
                  <div className="adminv2-ws-enrollment-crm-row adminv2-ws-enrollment-crm-row--split" data-enrollment-row-layout="split_actions">
                    <div className="adminv2-ws-enrollment-crm-row__content">
                      <CrmCompactQueuePreview slots={crm} urgencyTier={tier} />
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
                                    payload: qa.payload,
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
                                    payload: qa.payload,
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
