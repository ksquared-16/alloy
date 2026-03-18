"use client";

import { useState } from "react";
import { neutral, derived, semantic, brand } from "@/styles/tokens/colors";
import { getInspectorDepartmentData } from "./inspector/mockInspectorData";
import {
  MOCK_COMMAND_CENTER_ACTIVITY,
  MOCK_COMMAND_CENTER_ALERTS,
  MOCK_COMMAND_CENTER_SUGGESTIONS,
  MOCK_SYSTEM_ACTION_GROUPS,
} from "./inspector/mockCommandCenter";
import type { DepartmentKey } from "@/lib/departmentColors";

const RAIL_INNER_MAX = 272;
const SECTION_GAP = 26;
/** Align command header rhythm with KPI band (~minHeight 102, padded label row) */
const RAIL_TOP_PAD = 18;

type Props = {
  selectedNodeId: string | null;
  selectedDepartmentKey: DepartmentKey | null;
  zoomLevel: "company" | "department";
};

function sectionTitle(text: string, accent?: string) {
  return (
    <h3
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: accent ?? derived.inspectorSectionMuted,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: 12,
        marginTop: 0,
      }}
    >
      {text}
    </h3>
  );
}

const SYSTEM_ACTION_GROUP_GAP = 24;

function SystemActionsBlock() {
  const [hoverId, setHoverId] = useState<string | null>(null);

  return (
    <div style={{ marginBottom: SECTION_GAP }}>
      {MOCK_SYSTEM_ACTION_GROUPS.map((group, gi) => (
        <div
          key={group.id}
          style={{
            marginBottom: gi < MOCK_SYSTEM_ACTION_GROUPS.length - 1 ? SYSTEM_ACTION_GROUP_GAP : 0,
          }}
        >
          {sectionTitle(group.title, derived.inspectorSectionMuted)}
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {group.actions.map((item) => {
              const h = hoverId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setHoverId(item.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${h ? derived.border : derived.inspectorCommandHairline}`,
                    backgroundColor: h ? derived.inspectorCardQuiet : derived.inspectorCommandRail,
                    color: neutral.textPrimary,
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: "pointer",
                    boxShadow: h ? derived.cardShadow : derived.cardShadow,
                    lineHeight: 1.4,
                    transition: "border-color 0.15s ease, background-color 0.15s ease",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommandCenterPanel() {
  return (
    <div
      style={{
        padding: `${RAIL_TOP_PAD}px 22px 28px`,
        maxWidth: RAIL_INNER_MAX,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <header style={{ marginBottom: SECTION_GAP + 4, textAlign: "left" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: brand.primary,
            letterSpacing: "0.07em",
            marginBottom: 6,
          }}
        >
          Command center
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: neutral.textPrimary,
            letterSpacing: "-0.022em",
            lineHeight: 1.25,
          }}
        >
          Recent activity & signals
        </div>
      </header>

      {sectionTitle("Recent activity", brand.primary)}
      <ul style={{ listStyle: "none", padding: 0, margin: `0 0 ${SECTION_GAP}px` }}>
        {MOCK_COMMAND_CENTER_ACTIVITY.map((a) => (
          <li
            key={a.id}
            style={{
              fontSize: 13,
              color: neutral.textPrimary,
              padding: "12px 0",
              borderBottom: `1px solid ${derived.inspectorCommandHairline}`,
              lineHeight: 1.5,
            }}
          >
            {a.text}
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: derived.inspectorSectionMuted,
                marginTop: 4,
              }}
            >
              {a.time}
            </span>
          </li>
        ))}
      </ul>

      {sectionTitle("Active alerts", semantic.warning)}
      <ul style={{ listStyle: "none", padding: 0, margin: `0 0 ${SECTION_GAP}px` }}>
        {MOCK_COMMAND_CENTER_ALERTS.map((a) => (
          <li
            key={a.id}
            style={{
              fontSize: 13,
              padding: "12px 14px",
              marginBottom: 10,
              borderRadius: 10,
              border: `1px solid ${derived.inspectorCommandHairline}`,
              borderLeft: `3px solid ${a.severity === "attention" ? semantic.warning : semantic.info}`,
              backgroundColor: derived.inspectorCardQuiet,
              color: neutral.textPrimary,
              boxShadow: derived.cardShadow,
              lineHeight: 1.45,
            }}
          >
            {a.text}
          </li>
        ))}
      </ul>

      <SystemActionsBlock />

      {sectionTitle("Suggested actions", brand.secondary)}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {MOCK_COMMAND_CENTER_SUGGESTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: `1px solid ${derived.inspectorCommandHairline}`,
              backgroundColor: derived.inspectorCommandRail,
              color: neutral.textPrimary,
              fontSize: 13,
              fontWeight: 500,
              textAlign: "left",
              cursor: "pointer",
              boxShadow: derived.cardShadow,
              lineHeight: 1.4,
            }}
          >
            {s.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function DepartmentInspector({ departmentKey }: { departmentKey: DepartmentKey }) {
  const data = getInspectorDepartmentData(departmentKey);
  const { summary, metrics, activity, actions, history } = data;

  return (
    <div
      style={{
        padding: `${RAIL_TOP_PAD}px 22px 28px`,
        maxWidth: RAIL_INNER_MAX,
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          paddingBottom: 20,
          marginBottom: SECTION_GAP,
          borderBottom: `1px solid ${derived.inspectorCommandHairline}`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: brand.secondary,
            letterSpacing: "0.09em",
            marginBottom: 8,
          }}
        >
          Department
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            color: neutral.textPrimary,
            letterSpacing: "-0.02em",
            marginBottom: 10,
            lineHeight: 1.2,
          }}
        >
          {summary.departmentName}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: HEALTH_FOR_SUMMARY[summary.health],
            marginBottom: 12,
          }}
        >
          {summary.health}
        </div>
        <div style={{ fontSize: 13, color: derived.inspectorSectionMuted, lineHeight: 1.6 }}>
          {summary.aiSummary}
        </div>
      </div>

      {sectionTitle("Key metrics", brand.primary)}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: SECTION_GAP }}>
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              backgroundColor: derived.inspectorCardQuiet,
              border: `1px solid ${derived.inspectorCommandHairline}`,
              borderTop: `2px solid ${semantic.info}`,
              minWidth: 108,
              flex: "1 1 108px",
              boxShadow: derived.cardShadow,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: derived.inspectorSectionMuted,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              {m.label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: neutral.textPrimary }}>{m.value}</div>
          </div>
        ))}
      </div>

      {sectionTitle("Activity")}
      <ul style={{ listStyle: "none", padding: 0, margin: `0 0 ${SECTION_GAP}px` }}>
        {activity.map((a) => (
          <li
            key={a.id}
            style={{
              fontSize: 13,
              color: neutral.textPrimary,
              padding: "11px 0",
              borderBottom: `1px solid ${derived.inspectorCommandHairline}`,
              lineHeight: 1.45,
            }}
          >
            {a.text}
            <span style={{ color: derived.inspectorSectionMuted, marginLeft: 8 }}>{a.time}</span>
          </li>
        ))}
      </ul>

      {sectionTitle("Actions", brand.secondary)}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: SECTION_GAP }}>
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: `1px solid ${derived.inspectorCommandHairline}`,
              backgroundColor: derived.inspectorCommandRail,
              color: brand.primary,
              fontSize: 13,
              fontWeight: 600,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {sectionTitle("History")}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {history.map((h) => (
          <li
            key={h.id}
            style={{
              fontSize: 12,
              color: derived.inspectorSectionMuted,
              padding: "6px 0",
              lineHeight: 1.45,
            }}
          >
            {h.text} · {h.time}
          </li>
        ))}
      </ul>
    </div>
  );
}

const HEALTH_FOR_SUMMARY: Record<string, string> = {
  Good: semantic.success,
  Attention: semantic.warning,
  Critical: semantic.warning,
};

export default function InspectorPanel({
  selectedNodeId,
  selectedDepartmentKey,
  zoomLevel,
}: Props) {
  const resolvedKey: DepartmentKey | null =
    selectedDepartmentKey ?? (selectedNodeId ? MOCK_DEPT_ID_TO_KEY[selectedNodeId] ?? null : null);

  const showDepartmentDetail = zoomLevel === "department" && resolvedKey != null;
  const showCommandCenter = zoomLevel === "company";

  return (
    <aside
      className="w-80 flex-shrink-0 overflow-y-auto min-h-0 self-stretch"
      style={{
        background: `linear-gradient(185deg, ${derived.inspectorCommandRail} 0%, ${derived.inspectorCommandRailWash} 42%, ${derived.inspectorCommandRail} 100%)`,
        borderLeft: `1px solid ${derived.inspectorCommandHairline}`,
        boxShadow: derived.inspectorChamberSeparation,
        zIndex: 1,
      }}
    >
      {showCommandCenter && <CommandCenterPanel />}
      {showDepartmentDetail && resolvedKey && <DepartmentInspector departmentKey={resolvedKey} />}
    </aside>
  );
}

const MOCK_DEPT_ID_TO_KEY: Record<string, DepartmentKey> = {
  "dept-operations": "operations",
  "dept-sales": "sales",
  "dept-finance": "finance",
  "dept-customer-success": "customerSuccess",
  "dept-ai-systems": "aiSystems",
};
