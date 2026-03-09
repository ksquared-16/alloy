"use client";

import { ReactNode } from "react";

/**
 * Shared field container for entity drawer: consistent label/value spacing, padding, and alignment.
 * Use for both half-width (span 1) and full-width (span 2) fields so styling is identical.
 */
interface EntityDrawerFieldProps {
  label: string;
  value: ReactNode;
  /** Span in grid: 1 or 2. Default 1. */
  span?: 1 | 2;
  className?: string;
}

export default function EntityDrawerField({ label, value, span = 1, className = "" }: EntityDrawerFieldProps) {
  return (
    <div
      className={`py-1.5 ${span === 2 ? "col-span-2" : ""} ${className}`}
      data-entity-field
      data-span={span}
    >
      <span className="text-alloy-slate text-sm font-medium">{label}:</span>
      <span className="ml-2 text-alloy-midnight">{value ?? "—"}</span>
    </div>
  );
}
