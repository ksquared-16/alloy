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

/** CRM-compact preview — renders only from `CrmCompactRowSemanticSlots` (config-driven). */
function EnrollmentCrmCompactPreview({ slots }: { slots: CrmCompactRowSemanticSlots }) {
  const stageStatus =
    slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel
      ? `${slots.stageLabel} · ${slots.statusLabel}`
      : slots.stageLabel || slots.statusLabel || null;
  const showOpsLine = Boolean(slots.nextStep || slots.lastActivity);
  const noteStress = Boolean(slots.attentionReason?.trim());

  return (
    <div className="adminv2-ws-wu-queue-card-compact-text adminv2-ws-enrollment-crm-preview">
      <div className="adminv2-ws-enrollment-crm-preview__identity" data-enrollment-crm-slot="primaryIdentity">
        <span className="adminv2-ws-enrollment-crm-preview__k">Family</span> {slots.primaryIdentity}
      </div>
      {stageStatus ? (
        <div className="adminv2-ws-enrollment-crm-preview__stage" data-enrollment-crm-slot="stageStatus">
          <span className="adminv2-ws-enrollment-crm-preview__k">Status</span> {stageStatus}
        </div>
      ) : null}
      {slots.contactSnippet ? (
        <div className="adminv2-ws-enrollment-crm-preview__contact" data-enrollment-crm-slot="contactSnippet">
          <span className="adminv2-ws-enrollment-crm-preview__k">Contact</span> {slots.contactSnippet}
        </div>
      ) : null}
      {slots.childName ? (
        <div className="adminv2-ws-enrollment-crm-preview__child" data-enrollment-crm-slot="childName">
          <span className="adminv2-ws-enrollment-crm-preview__k">{slots.childName.includes(" · ") ? "Children" : "Child"}</span>{" "}
          {slots.childName}
        </div>
      ) : null}
      {slots.programContext ? (
        <div className="adminv2-ws-enrollment-crm-preview__care" data-enrollment-crm-slot="programs">
          <span className="adminv2-ws-enrollment-crm-preview__k">Programs</span> {slots.programContext}
        </div>
      ) : null}
      {slots.roomContext ? (
        <div className="adminv2-ws-enrollment-crm-preview__care" data-enrollment-crm-slot="roomContext">
          <span className="adminv2-ws-enrollment-crm-preview__k">Room</span> {slots.roomContext}
        </div>
      ) : null}
      {slots.ageContext ? (
        <div className="adminv2-ws-enrollment-crm-preview__care" data-enrollment-crm-slot="startDate">
          <span className="adminv2-ws-enrollment-crm-preview__k">Start</span> {slots.ageContext}
        </div>
      ) : null}
      {slots.tourContext ? (
        <div className="adminv2-ws-enrollment-crm-preview__tour" data-enrollment-crm-slot="tourContext">
          {slots.tourContext.startsWith("Tour:") ? slots.tourContext : <>Tour: {slots.tourContext}</>}
        </div>
      ) : null}
      {slots.attentionReason ? (
        <div className="adminv2-ws-enrollment-crm-preview__attention" data-enrollment-crm-slot="attentionReason">
          {slots.attentionReason}
        </div>
      ) : null}
      {slots.familyNote ? (
        <div
          className={
            noteStress
              ? "adminv2-ws-enrollment-crm-preview__note adminv2-ws-enrollment-crm-preview__note--stress"
              : "adminv2-ws-enrollment-crm-preview__note"
          }
          data-enrollment-crm-slot="familyNote"
        >
          <span className="adminv2-ws-enrollment-crm-preview__k">Notes</span> {slots.familyNote}
        </div>
      ) : null}
      {showOpsLine ? (
        <div className="adminv2-ws-enrollment-crm-preview__ops" data-enrollment-crm-slot="nextLast">
          {slots.nextStep ? (
            <span data-enrollment-crm-slot="nextStep">
              <span className="adminv2-ws-enrollment-crm-preview__k">Next step</span> {slots.nextStep}
            </span>
          ) : null}
          {slots.nextStep && slots.lastActivity ? (
            <span className="adminv2-ws-enrollment-crm-preview__sep" aria-hidden>
              ·
            </span>
          ) : null}
          {slots.lastActivity ? (
            <span data-enrollment-crm-slot="lastActivity">
              <span className="adminv2-ws-enrollment-crm-preview__k">Last</span> {slots.lastActivity}
            </span>
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
        {queue.items.map((item) => {
          const sectionKey = workUnitSectionKey(item);
          const showGroup = sectionKey && sectionKey !== lastSectionKey;
          if (sectionKey) lastSectionKey = sectionKey;

          const tier = item.urgencyTier ?? "standard";
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
                      <EnrollmentCrmCompactPreview slots={crm} />
                    </div>
                    {item.quickActions?.length ? (
                      <div className="adminv2-ws-enrollment-crm-row__actions" role="group" aria-label="Actions">
                        <div className="adminv2-ws-enrollment-crm-row__action-stack">
                          {item.quickActions.map((qa) => {
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
                      {item.quickActions?.length ? (
                        <div className="adminv2-ws-wu-queue-card-quick-actions" role="group" aria-label="Quick actions">
                          {item.quickActions.map((qa) => (
                            <button
                              key={`${item.id}-qa-${qa.id}`}
                              type="button"
                              className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--quiet"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAction({
                                  type: "queue.item.action",
                                  queueId: queue.id,
                                  itemId: item.id,
                                  actionId: qa.id,
                                  payload: qa.payload,
                                });
                              }}
                            >
                              {qa.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
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
