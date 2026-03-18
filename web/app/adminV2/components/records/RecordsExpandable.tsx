"use client";

import { useState } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import RecordsPanel from "./RecordsPanel";
import type { RecordsScope } from "./mockRecordsData";

type Props = {
  departmentName: string;
  scope: RecordsScope;
};

export default function RecordsExpandable({ departmentName, scope }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${derived.border}`,
        backgroundColor: neutral.surface,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          border: "none",
          background: open ? derived.kpiBandAiWash : neutral.surface,
          fontSize: 13,
          fontWeight: 600,
          color: brand.primary,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>{open ? `Hide ${departmentName} records` : `Show ${departmentName} records`}</span>
        <span style={{ color: derived.textSecondary, fontSize: 11 }} aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <RecordsPanel scope={scope} title={`${departmentName} records`} embedded />}
    </div>
  );
}
