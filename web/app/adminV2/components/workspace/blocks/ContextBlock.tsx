"use client";

import { useState, useMemo } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { ContextBlockVm, ContextRelationshipGroupVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
  model: ContextBlockVm;
  onAction: WorkspaceActionHandler;
  surface?: "default" | "department" | "company" | "work_unit" | "record";
  /**
   * `rail` — legacy command column (avoid for workspace shells; prefer `embedded`).
   * `embedded` — primary/main column: entity-linked groups only, no “Context & support” kicker; nothing if no groups.
   */
  layout?: "rail" | "embedded";
};

function GroupSection({
  group,
  onAction,
  surface,
}: {
  group: ContextRelationshipGroupVm;
  onAction: WorkspaceActionHandler;
  surface: "default" | "department" | "company" | "work_unit" | "record";
}) {
  const [open, setOpen] = useState(group.expanded);

  if (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") {
    return (
      <div className="adminv2-ws-context-group">
        <button type="button" className="adminv2-ws-context-group-toggle" onClick={() => setOpen((o) => !o)}>
          <span>{group.label}</span>
          <span style={{ opacity: 0.6, fontSize: 12 }}>{open ? "−" : "+"}</span>
        </button>
        {open && (
          <ul className="adminv2-ws-context-group-body">
            {group.items.map((item) => {
              const entityLink = surface === "record" && item.linkedEntity;
              const openEntity = () =>
                onAction({
                  type: "context.group.action",
                  groupKey: group.key,
                  actionId: "open_record",
                  targetId: item.id,
                });
              return (
                <li
                  key={item.id}
                  className={`adminv2-ws-context-item${entityLink ? " adminv2-ws-context-item--entity" : ""}`}
                >
                  {entityLink ? (
                    <button
                      type="button"
                      className="adminv2-ws-context-item-entity-hit"
                      onClick={openEntity}
                    >
                      <span className="adminv2-ws-context-item-line">{item.previewLine}</span>
                      {Object.keys(item.fields).length > 0 ? (
                        <span className="adminv2-ws-context-item-fields">
                          {Object.entries(item.fields)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <>
                      <div className="adminv2-ws-context-item-line">{item.previewLine}</div>
                      {Object.keys(item.fields).length > 0 && (
                        <div className="adminv2-ws-context-item-fields">
                          {Object.entries(item.fields)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </div>
                      )}
                    </>
                  )}
                  <div className="adminv2-ws-context-item-actions">
                    {item.quickActions.map((qa) => (
                      <button
                        key={qa.id}
                        type="button"
                        onClick={() =>
                          onAction({
                            type: "context.group.action",
                            groupKey: group.key,
                            actionId: qa.id,
                            targetId: item.id,
                          })
                        }
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div style={{ borderBottom: `1px solid ${derived.border}` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          color: neutral.textPrimary,
        }}
      >
        <span>{group.label}</span>
        <span style={{ color: derived.textSecondary, fontSize: 11 }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 0 8px 0" }}>
          {group.items.map((item) => (
            <li key={item.id} style={{ padding: "6px 0" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: neutral.textPrimary }}>{item.previewLine}</div>
              {Object.keys(item.fields).length > 0 && (
                <div style={{ fontSize: 10, color: derived.textSecondary, marginTop: 2 }}>
                  {Object.entries(item.fields)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {item.quickActions.map((qa) => (
                  <button
                    key={qa.id}
                    type="button"
                    onClick={() =>
                      onAction({
                        type: "context.group.action",
                        groupKey: group.key,
                        actionId: qa.id,
                        targetId: item.id,
                      })
                    }
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "2px 6px",
                      borderRadius: 4,
                      border: `1px solid ${derived.border}`,
                      background: "transparent",
                      color: brand.primary,
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
      )}
    </div>
  );
}

/**
 * Relationship-aware context: renders normalized groups only.
 * Config → view model happens in adapters (normalizeContextRelationshipGroups).
 */
export default function ContextBlock({
  model,
  onAction,
  surface = "default",
  layout = "rail",
}: Props) {
  const sorted = useMemo(
    () => [...model.groups].sort((a, b) => a.order - b.order),
    [model.groups]
  );

  if (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") {
    if (layout === "embedded") {
      if (sorted.length === 0) return null;
      const defaultKicker =
        surface === "record"
          ? "Related entities"
          : surface === "company"
            ? "Organization context"
            : surface === "department"
              ? "Department context"
              : "Lane context";
      const kicker = model.title?.trim() || defaultKicker;
      const isRecordAside = surface === "record";
      return (
        <div
          className={[
            "adminv2-ws-context-embedded",
            isRecordAside
              ? "adminv2-ws-context-embedded--record-aside adminv2-ws-record-interaction-panel adminv2-ws-record-interaction-panel--context-soft"
              : "adminv2-ws-context-embedded--primary",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={kicker}
        >
          <h3
            className={
              isRecordAside
                ? "adminv2-ws-record-interaction-panel-title"
                : "adminv2-ws-context-embedded-title"
            }
          >
            {kicker}
          </h3>
          {sorted.map((g) => (
            <GroupSection key={g.key} group={g} onAction={onAction} surface={surface} />
          ))}
        </div>
      );
    }

    return (
      <div className="adminv2-ws-context-rail">
        {model.title && <div className="adminv2-ws-context-rail-kicker">{model.title}</div>}
        <div className="adminv2-ws-context-rail-kicker">Context &amp; support</div>
        {sorted.length === 0 && (
          <div className="adminv2-ws-context-rail-empty">No relationship groups in this view.</div>
        )}
        {sorted.map((g) => (
          <GroupSection key={g.key} group={g} onAction={onAction} surface={surface} />
        ))}
      </div>
    );
  }

  return (
    <div className="adminv2-ws-zone" style={{ padding: "12px 14px", overflow: "auto" }}>
      {model.title && (
        <div style={{ fontSize: 10, fontWeight: 700, color: derived.textSecondary, marginBottom: 8 }}>
          {model.title}
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, color: brand.secondary, textTransform: "none", marginBottom: 8 }}>
        Context
      </div>
      {sorted.length === 0 && (
        <div style={{ fontSize: 12, color: derived.textSecondary }}>No relationship groups in view.</div>
      )}
      {sorted.map((g) => (
        <GroupSection key={g.key} group={g} onAction={onAction} surface="default" />
      ))}
    </div>
  );
}
