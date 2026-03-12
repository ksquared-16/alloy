"use client";

import { ReactNode } from "react";
import { getEntityPresentation, type EntityPresentationType, type EntityDrawerFieldConfig, type EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import { formatDate, formatDateTime, formatMoney, formatPhoneUS, formatPayoutPercent, RECURRENCE_UNIT_OPTIONS } from "@/lib/adminFormatters";
import { StatusBadge } from "@/components/admin/StatusBadge";
import EntityDrawerSection from "./EntityDrawerSection";
import EntityDrawerField from "./EntityDrawerField";

const INLINE_EDIT_INPUT = "w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm text-alloy-forge focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60";
const INLINE_EDIT_SELECT = "w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm text-alloy-forge focus:border-alloy-blue focus:outline-none disabled:opacity-60";

export type StatusDefOption = { status_key: string; status_label?: string | null; is_active?: boolean; sort_order?: number };

interface EntityDrawerOverviewProps {
  entityType: EntityPresentationType;
  data: Record<string, unknown> | null;
  /** Custom content for sections that have no fields (e.g. relationship links, lists). Key = section.key */
  customSectionContent?: Record<string, ReactNode>;
  isEditing?: boolean;
  formData?: Record<string, unknown>;
  onFieldChange?: (key: string, value: unknown) => void;
  onBlur?: () => void;
  canEdit?: boolean;
  statusDefs?: StatusDefOption[];
  getStatusLabel?: (key: string) => string | null;
  /** When a field has linkTarget, call this to open the related entity drawer. */
  onOpenDrawer?: (entityType: string, id: string) => void;
}

function formatFieldValue(
  value: unknown,
  field: EntityDrawerFieldConfig,
  getStatusLabel?: (key: string) => string | null,
  record?: Record<string, unknown> | null,
  onOpenDrawer?: (entityType: string, id: string) => void
): ReactNode {
  if (value === null || value === undefined) return null;
  const hint = field.renderHint ?? "text";
  const key = field.key;
  if (hint === "phone") return formatPhoneUS(value as string | null | undefined);
  switch (hint) {
    case "date":
      return formatDate(value as string);
    case "datetime":
      return formatDateTime(value as string);
    case "money":
      return formatMoney(value as number | string | null | undefined, key);
    case "status":
      return (
        <StatusBadge
          label={getStatusLabel?.(String(value)) ?? String(value)}
          variant="default"
        />
      );
    case "link":
      if (field.linkTarget && record && onOpenDrawer) {
        const id = record[field.linkTarget.idField];
        if (id != null && String(id).trim() !== "") {
          return (
            <button
              type="button"
              onClick={() => onOpenDrawer(field.linkTarget!.entityType, String(id))}
              className="text-alloy-blue hover:underline text-left"
            >
              {String(value)}
            </button>
          );
        }
      }
      return String(value);
    case "primary_yes_no":
      return value === true ? "Yes" : "No";
    case "text":
    case "custom":
    default:
      if (key === "payout_percent") return formatPayoutPercent(value as number | null | undefined);
      return String(value);
  }
}

function makeKeydownHandlers(
  key: string,
  onBlur: () => void,
  onEscape: (key: string) => void
) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onEscape(key);
      (e.target as HTMLElement).blur();
    }
  };
}

function renderFieldEditNode(
  field: EntityDrawerFieldConfig,
  formData: Record<string, unknown>,
  onFieldChange: (key: string, value: unknown) => void,
  onBlur: () => void,
  onEscape: (key: string) => void,
  statusDefs: StatusDefOption[] | undefined,
  disabled: boolean
): ReactNode {
  const key = field.key;
  const value = formData[key];
  const hint = field.renderHint ?? "text";
  const onKeyDown = makeKeydownHandlers(key, onBlur, onEscape);

  if (hint === "status" && statusDefs && statusDefs.length > 0) {
    const options = statusDefs.filter((s) => s.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onFieldChange(key, e.target.value || null)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={INLINE_EDIT_SELECT}
      >
        <option value="">— None —</option>
        {options.map((s) => (
          <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
        ))}
      </select>
    );
  }

  if (hint === "datetime" || hint === "date") {
    const str = value != null ? String(value) : "";
    const type = hint === "date" ? "date" : "datetime-local";
    const normalized = str && str.length >= 16 ? str.slice(0, 16) : str;
    return (
      <input
        type={type}
        value={normalized}
        onChange={(e) => onFieldChange(key, e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={INLINE_EDIT_INPUT}
      />
    );
  }

  if (hint === "money" && key.endsWith("_cents")) {
    const num = typeof value === "number" ? value / 100 : typeof value === "string" ? parseFloat(value) || 0 : 0;
    return (
      <input
        type="number"
        step={0.01}
        value={num > 0 ? num : ""}
        onChange={(e) => {
          const v = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null;
          onFieldChange(key, v);
        }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={INLINE_EDIT_INPUT}
        placeholder="0.00"
      />
    );
  }

  if (hint === "primary_yes_no") {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onFieldChange(key, e.target.checked)}
          onBlur={onBlur}
          disabled={disabled}
          className="rounded border-admin-border"
        />
        <span className="text-sm text-alloy-forge/90">{value ? "Yes" : "No"}</span>
      </label>
    );
  }

  if (key === "recurrence_unit") {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onFieldChange(key, e.target.value || null)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={INLINE_EDIT_SELECT}
      >
        <option value="">— None —</option>
        {RECURRENCE_UNIT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      type="text"
      value={String(value ?? "")}
      onChange={(e) => onFieldChange(key, e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      disabled={disabled}
      className={INLINE_EDIT_INPUT}
    />
  );
}

/**
 * Config-driven entity drawer overview: renders overviewSections from presentation config.
 * Sections with fields use EntityDrawerSection + EntityDrawerField; sections with no fields use customSectionContent.
 * Supports read and edit mode; collapse/expand from config defaultExpanded and collapsible.
 */
export default function EntityDrawerOverview({
  entityType,
  data,
  customSectionContent = {},
  isEditing = false,
  formData,
  onFieldChange,
  onBlur,
  canEdit = false,
  statusDefs,
  getStatusLabel,
  onOpenDrawer,
}: EntityDrawerOverviewProps) {
  const config = getEntityPresentation(entityType);
  const sections = config.drawer?.overviewSections ?? [];
  if (!sections.length) return null;

  const record = data ?? {};
  const editFormData = formData ?? record;
  const handleFieldChange = onFieldChange ?? (() => {});
  const handleBlur = onBlur ?? (() => {});
  /** Revert one field to record value and blur (Escape). */
  const handleEscape = (key: string) => {
    handleFieldChange(key, record[key]);
    handleBlur();
  };

  return (
    <div className="space-y-0 pt-5" data-entity-drawer-overview>
      {sections.map((section: EntityDrawerSectionConfig) => {
        const hasFields = section.fields && section.fields.length > 0;
        const customContent = customSectionContent[section.key];

        // Prefer custom section content when provided (e.g. contact Canonical Person link); otherwise use config-driven fields.
        const children: ReactNode = customContent ?? (hasFields
          ? section.fields!.map((field: EntityDrawerFieldConfig) => {
              const rawValue = editFormData[field.key] !== undefined ? editFormData[field.key] : (field.key === "status_key" && record._status_display != null ? record._status_display : record[field.key]);
              const displayValue = formatFieldValue(rawValue, field, getStatusLabel, record, onOpenDrawer);
              const showEdit = !!(canEdit && field.editable && onFieldChange);
              const editNode = showEdit
                ? renderFieldEditNode(field, editFormData, handleFieldChange, handleBlur, handleEscape, statusDefs, !canEdit)
                : undefined;
              return (
                <EntityDrawerField
                  key={field.key}
                  label={field.label}
                  value={displayValue}
                  span={field.span ?? 1}
                  editNode={editNode}
                  isEditing={showEdit}
                />
              );
            })
          : null);

        if (!hasFields && !customContent) return null;

        return (
          <EntityDrawerSection key={section.key} config={section}>
            {children}
          </EntityDrawerSection>
        );
      })}
    </div>
  );
}
