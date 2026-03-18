"use client";

import { neutral, derived } from "@/styles/tokens/colors";
import { getRecordsForScope, type RecordsScope } from "./mockRecordsData";

type Props = {
  scope: RecordsScope;
  title?: string;
  /** When true, no outer border-top (used inside expandable) */
  embedded?: boolean;
};

export default function RecordsPanel({ scope, title, embedded }: Props) {
  const { columns, rows } = getRecordsForScope(scope);
  const displayTitle = title ?? "Records";

  return (
    <div
      style={{
        flexShrink: 0,
        height: 200,
        borderTop: embedded ? `1px solid ${derived.border}` : undefined,
        backgroundColor: neutral.surface,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${derived.border}`,
          fontSize: 12,
          fontWeight: 600,
          color: derived.textSecondary,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {displayTitle}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: "left",
                    padding: "8px 12px",
                    fontWeight: 600,
                    color: derived.textSecondary,
                    borderBottom: `1px solid ${derived.border}`,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: `1px solid ${derived.border}`,
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "8px 12px",
                      color: neutral.textPrimary,
                    }}
                  >
                    {row[col.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}