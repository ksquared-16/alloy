"use client";

import { neutral, derived, semantic, brand } from "@/styles/tokens/colors";
import { getInspectorDepartmentData } from "./inspector/mockInspectorData";
import type { DepartmentKey } from "@/lib/departmentColors";

type Props = {
  selectedNodeId: string | null;
  selectedDepartmentKey: DepartmentKey | null;
  zoomLevel: "company" | "department";
};

function EmptyState() {
  return (
    <div
      style={{
        padding: 24,
        fontSize: 13,
        color: derived.textSecondary,
        textAlign: "center",
      }}
    >
      Select a node to inspect
    </div>
  );
}

function DepartmentInspector({ departmentKey }: { departmentKey: DepartmentKey }) {
  const data = getInspectorDepartmentData(departmentKey);
  const { summary, metrics, activity, actions, history } = data;

  return (
    <div style={{ padding: 16 }}>
      <section style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: derived.textSecondary,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            marginBottom: 8,
          }}
        >
          Summary
        </h3>
        <div style={{ fontSize: 14, fontWeight: 600, color: neutral.textPrimary, marginBottom: 4 }}>
          {summary.departmentName}
        </div>
        <div style={{ fontSize: 12, color: semantic.success, marginBottom: 6 }}>
          Health: {summary.health}
        </div>
        <div style={{ fontSize: 12, color: derived.textSecondary }}>
          {summary.aiSummary}
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: derived.textSecondary,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            marginBottom: 8,
          }}
        >
          Metrics
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {metrics.map((m) => (
            <div
              key={m.label}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                backgroundColor: neutral.background,
                fontSize: 12,
              }}
            >
              <span style={{ color: derived.textSecondary }}>{m.label}: </span>
              <span style={{ fontWeight: 600, color: neutral.textPrimary }}>{m.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: derived.textSecondary,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            marginBottom: 8,
          }}
        >
          Activity
        </h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {activity.map((a) => (
            <li
              key={a.id}
              style={{
                fontSize: 12,
                color: neutral.textPrimary,
                padding: "4px 0",
                borderBottom: `1px solid ${derived.border}`,
              }}
            >
              {a.text}
              <span style={{ color: derived.textSecondary, marginLeft: 6 }}>{a.time}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: derived.textSecondary,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            marginBottom: 8,
          }}
        >
          Actions
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${derived.border}`,
                backgroundColor: neutral.surface,
                color: brand.primary,
                fontSize: 12,
                fontWeight: 500,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: derived.textSecondary,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            marginBottom: 8,
          }}
        >
          History
        </h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {history.map((h) => (
            <li
              key={h.id}
              style={{
                fontSize: 12,
                color: derived.textSecondary,
                padding: "2px 0",
              }}
            >
              {h.text} · {h.time}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function InspectorPanel({
  selectedNodeId,
  selectedDepartmentKey,
  zoomLevel,
}: Props) {
  const resolvedKey: DepartmentKey | null =
    selectedDepartmentKey ?? (selectedNodeId ? MOCK_DEPT_ID_TO_KEY[selectedNodeId] ?? null : null);

  return (
    <aside
      className="w-72 flex-shrink-0 border-l overflow-auto"
      style={{
        backgroundColor: neutral.surface,
        borderColor: derived.border,
      }}
    >
      {!resolvedKey ? (
        <EmptyState />
      ) : (
        <DepartmentInspector departmentKey={resolvedKey} />
      )}
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