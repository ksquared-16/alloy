"use client";

import { ReactNode } from "react";

const LABEL_DEFAULT = "block text-xs font-medium text-alloy-midnight/80 mb-1";
/** Schedule/job record snapshot rows — subtle label, emphasized value (aligned with JobRecordModalV2 snapshot cells). */
const LABEL_COMPACT = "block text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-forge/65 mb-0.5";
const VALUE_DEFAULT = "text-sm text-alloy-forge min-h-[2rem] flex items-center";
const VALUE_COMPACT = "text-sm font-medium text-alloy-midnight/90 min-h-[1.375rem] flex items-center leading-snug";
const VALUE_EDIT_WRAP = "min-h-[2rem] flex items-stretch";
const VALUE_EDIT_WRAP_COMPACT = "min-h-[1.375rem] flex items-stretch";

/**
 * Vertical field block: label on top, value below.
 * Same shell for read and edit so values stay left-aligned and do not shift by label width.
 * Use span 1 or 2 for grid column width.
 */
interface EntityDrawerFieldProps {
  label: string;
  value: ReactNode;
  /** Span in grid: 1 or 2. Default 1. */
  span?: 1 | 2;
  /** When provided, shown instead of value (inline edit). */
  editNode?: ReactNode;
  /** When true, show editNode; otherwise show value. */
  isEditing?: boolean;
  className?: string;
  /** Tighter label/value rhythm for config-driven schedule overview rows. */
  density?: "default" | "compact";
}

export default function EntityDrawerField({
  label,
  value,
  span = 1,
  editNode,
  isEditing,
  className = "",
  density = "default",
}: EntityDrawerFieldProps) {
  const showEdit = isEditing && editNode != null;
  const compact = density === "compact";
  return (
    <div
      className={`${span === 2 ? "col-span-2" : ""} ${className}`}
      data-entity-field
      data-field-density={compact ? "compact" : "default"}
      data-span={span}
    >
      <label className={compact ? LABEL_COMPACT : LABEL_DEFAULT}>{label}</label>
      {showEdit ? (
        <div className={compact ? VALUE_EDIT_WRAP_COMPACT : VALUE_EDIT_WRAP}>{editNode}</div>
      ) : (
        <div className={compact ? VALUE_COMPACT : VALUE_DEFAULT}>{value ?? "—"}</div>
      )}
    </div>
  );
}
