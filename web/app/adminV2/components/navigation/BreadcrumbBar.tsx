"use client";

import { neutral, derived, brand } from "@/styles/tokens/colors";

type Props = {
  zoomLevel: "company" | "department";
  departmentName: string | null;
  onGoToCompany: () => void;
};

export default function BreadcrumbBar({ zoomLevel, departmentName, onGoToCompany }: Props) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 16px",
        fontSize: 13,
        borderBottom: `1px solid ${derived.border}`,
        backgroundColor: neutral.surface,
      }}
    >
      <button
        type="button"
        onClick={onGoToCompany}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          color: zoomLevel === "company" ? brand.primary : derived.textSecondary,
          fontWeight: zoomLevel === "company" ? 600 : 500,
          cursor: "pointer",
        }}
      >
        Company
      </button>
      {zoomLevel === "department" && departmentName && (
        <>
          <span style={{ color: derived.textSecondary }} aria-hidden>/</span>
          <span style={{ color: neutral.textPrimary, fontWeight: 500 }}>{departmentName}</span>
        </>
      )}
    </nav>
  );
}
