"use client";

import { ReactNode } from "react";

const LABEL_CLASS = "block text-xs font-medium text-alloy-midnight/80 mb-1";
const VALUE_CLASS = "text-sm text-alloy-forge min-h-[2rem] flex items-center";
const VALUE_EDIT_WRAP = "min-h-[2rem] flex items-stretch";

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
}

export default function EntityDrawerField({ label, value, span = 1, editNode, isEditing, className = "" }: EntityDrawerFieldProps) {
  const showEdit = isEditing && editNode != null;
  return (
    <div
      className={`${span === 2 ? "col-span-2" : ""} ${className}`}
      data-entity-field
      data-span={span}
    >
      <label className={LABEL_CLASS}>{label}</label>
      {showEdit ? (
        <div className={VALUE_EDIT_WRAP}>{editNode}</div>
      ) : (
        <div className={VALUE_CLASS}>{value ?? "—"}</div>
      )}
    </div>
  );
}
