"use client";

import { ReactNode } from "react";
import {
  getEntityPresentation,
  type EntityPresentationType,
  type EntityDrawerFieldConfig,
  type EntityDrawerSectionConfig,
} from "@/lib/entityPresentation";
import { formatDate, formatDateTime, formatMoney, formatMoneyFromCents, formatPhoneUS, formatPayoutPercent, RECURRENCE_UNIT_OPTIONS } from "@/lib/adminFormatters";
import { StatusBadge } from "@/components/admin/StatusBadge";
import EntityDrawerSection from "./EntityDrawerSection";
import EntityDrawerField from "./EntityDrawerField";
import { isUuidLike, resolveOverviewRelationshipLabel } from "@/lib/admin/overviewRelationshipLabels";
import { scheduleOverviewRelationshipReadLabel } from "@/lib/admin/scheduleOverviewLabels";
import {
  opportunityOverviewRelationshipReadLabel,
  opportunityOverviewStatusBadgeLabel,
} from "@/lib/admin/opportunityOverviewLabels";

const INLINE_EDIT_INPUT = "w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm text-alloy-forge focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60";
const INLINE_EDIT_SELECT = "w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm text-alloy-forge focus:border-alloy-blue focus:outline-none disabled:opacity-60";

export type StatusDefOption = { status_key: string; status_label?: string | null; is_active?: boolean; sort_order?: number };

function isNoiseStatusToken(s: string | null | undefined): boolean {
  if (s == null) return true;
  const t = String(s).trim().toLowerCase();
  return t === "" || t === "none" || t === "null" || t === "undefined";
}

interface EntityDrawerOverviewProps {
  entityType: EntityPresentationType;
  data: Record<string, unknown> | null;
  /** Custom content for sections that have no fields (e.g. relationship links, lists). Key = section.key */
  customSectionContent?: Record<string, ReactNode>;
  /** When set (e.g. for person field_definitions), use these sections instead of entity presentation config. */
  overviewSectionsOverride?: EntityDrawerSectionConfig[];
  isEditing?: boolean;
  formData?: Record<string, unknown>;
  onFieldChange?: (key: string, value: unknown) => void;
  onBlur?: () => void;
  canEdit?: boolean;
  statusDefs?: StatusDefOption[];
  getStatusLabel?: (key: string) => string | null;
  /** When a field has linkTarget, call this to open the related entity drawer. */
  onOpenDrawer?: (entityType: string, id: string) => void;
  /** Reference selects (e.g. pipeline_stage_id, vertical_id) — labels in UI, values are real ids. */
  selectOptionsByFieldKey?: Record<string, { value: string; label: string }[]>;
}

function formatFieldValue(
  value: unknown,
  field: EntityDrawerFieldConfig,
  getStatusLabel?: (key: string) => string | null,
  record?: Record<string, unknown> | null,
  onOpenDrawer?: (entityType: string, id: string) => void,
  presentationEntityType?: EntityPresentationType
): ReactNode {
  const hint = field.renderHint ?? "text";
  const key = field.key;
  if (hint === "status") {
    if (presentationEntityType === "opportunities" && record) {
      const oppLine = opportunityOverviewStatusBadgeLabel(record);
      if (oppLine) {
        return <StatusBadge label={oppLine} variant="default" />;
      }
    }
    const dispRaw = record?._status_display != null ? String(record._status_display).trim() : "";
    if (dispRaw && !isNoiseStatusToken(dispRaw)) {
      return <StatusBadge label={dispRaw} variant="default" />;
    }
    const fromValue = value != null && String(value).trim() !== "" ? String(value).trim() : "";
    const fromRecord = record?.status_key != null ? String(record.status_key).trim() : "";
    const rawKey = !isNoiseStatusToken(fromValue) ? fromValue : !isNoiseStatusToken(fromRecord) ? fromRecord : "";

    if (presentationEntityType === "locations") {
      const defLabel = rawKey ? (getStatusLabel?.(rawKey) ?? rawKey) : "";
      const label = !isNoiseStatusToken(defLabel) ? defLabel : "Active";
      return <StatusBadge label={label} variant="default" />;
    }
    if (presentationEntityType === "schedules") {
      const defLabel = rawKey ? (getStatusLabel?.(rawKey) ?? rawKey) : "";
      const label = !isNoiseStatusToken(defLabel) ? defLabel : "—";
      return <StatusBadge label={label} variant="default" />;
    }

    const s = rawKey;
    const label = (getStatusLabel?.(s) ?? s) || "—";
    const clean = isNoiseStatusToken(label) ? "—" : label;
    return <StatusBadge label={clean} variant="default" />;
  }

  if (value === null || value === undefined) return null;
  if (hint === "phone") return formatPhoneUS(value as string | null | undefined);
  switch (hint) {
    case "date":
      return formatDate(value as string);
    case "datetime":
      return formatDateTime(value as string);
    case "money": {
      const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
      if (key === "_discount_amount_cents" && Number.isFinite(n) && n > 0) {
        return `-${formatMoneyFromCents(n)}`;
      }
      return formatMoney(value as number | string | null | undefined, key);
    }
    case "link":
      if (field.linkTarget && record && onOpenDrawer) {
        const idField = field.linkTarget.idField;
        const id = record[idField];
        if (id != null && String(id).trim() !== "") {
          let labelFromRecord: string | null = null;
          if (presentationEntityType === "schedules") {
            const sched = scheduleOverviewRelationshipReadLabel(record, field.key);
            if (sched !== undefined) {
              labelFromRecord = sched === "" ? null : sched;
            }
            if (labelFromRecord == null && idField !== field.key) {
              const schedById = scheduleOverviewRelationshipReadLabel(record, idField);
              if (schedById !== undefined) {
                labelFromRecord = schedById === "" ? null : schedById;
              }
            }
          } else if (presentationEntityType === "opportunities") {
            const ol = opportunityOverviewRelationshipReadLabel(record, field.key);
            if (ol !== undefined) {
              labelFromRecord = ol === "" ? null : ol;
            }
            if (labelFromRecord == null && idField !== field.key) {
              const ol2 = opportunityOverviewRelationshipReadLabel(record, idField);
              if (ol2 !== undefined) {
                labelFromRecord = ol2 === "" ? null : ol2;
              }
            }
          }
          if (labelFromRecord == null) {
            labelFromRecord = resolveOverviewRelationshipLabel(record, field.key, { linkIdField: idField });
          }
          const uuidLike = isUuidLike(value);
          const displayText =
            labelFromRecord ??
            (!uuidLike && value != null && String(value).trim() !== "" ? String(value) : null) ??
            "—";
          return (
            <button
              type="button"
              onClick={() => onOpenDrawer(field.linkTarget!.entityType, String(id))}
              className="text-alloy-blue hover:underline text-left"
            >
              {displayText}
            </button>
          );
        }
      }
      return String(value);
    case "primary_yes_no":
      return (value === true || value === "true") ? "Yes" : (value === false || value === "false") ? "No" : "—";
    case "text":
    case "custom":
    default:
      if (presentationEntityType === "locations" && record) {
        const accessLabel =
          record._access_method_label != null && String(record._access_method_label).trim() !== ""
            ? String(record._access_method_label).trim()
            : null;
        if (
          accessLabel &&
          (key === "access_method_id" ||
            key === "access_method" ||
            (typeof key === "string" && key.toLowerCase().includes("access_method")))
        ) {
          return accessLabel;
        }
      }
      if (key === "payout_percent") return formatPayoutPercent(value as number | null | undefined);
      if (presentationEntityType === "schedules" && record) {
        const sched = scheduleOverviewRelationshipReadLabel(record, key);
        if (sched !== undefined) {
          return sched === "" ? "—" : sched;
        }
      }
      if (presentationEntityType === "opportunities" && record) {
        const ol = opportunityOverviewRelationshipReadLabel(record, key);
        if (ol !== undefined) {
          return ol === "" ? "—" : ol;
        }
      }
      if (record && isUuidLike(value)) {
        const rel = resolveOverviewRelationshipLabel(record, key);
        if (rel) return rel;
      }
      return String(value);
  }
}

/**
 * When custom field_definitions reuse legacy keys (gate_code, home_type, …), prefer hydrated API columns / _service_* so blank or duplicate defs never beat canonical values.
 */
function canonicalReadFallbackForShadowedField(
  entityType: EntityPresentationType,
  fieldKey: string,
  record: Record<string, unknown>
): unknown {
  if (entityType === "locations") {
    if (fieldKey === "gate_code" && record.access_code != null && String(record.access_code).trim() !== "") {
      return String(record.access_code).trim();
    }
    if (fieldKey === "pets" && typeof record.has_pets === "boolean") {
      return record.has_pets;
    }
  }
  if (entityType === "locations" || entityType === "jobs" || entityType === "schedules") {
    if (fieldKey === "home_type" && String(record._service_home_type_label ?? "").trim() !== "") {
      return String(record._service_home_type_label).trim();
    }
    if (fieldKey === "square_footage" && String(record._service_square_footage_display ?? "").trim() !== "") {
      return String(record._service_square_footage_display).trim();
    }
    const br = record._service_bedrooms;
    if (fieldKey === "bedrooms" && br != null && br !== "" && !Number.isNaN(Number(br))) {
      return br;
    }
    const bt = record._service_bathrooms;
    if (fieldKey === "bathrooms" && bt != null && bt !== "" && !Number.isNaN(Number(bt))) {
      return bt;
    }
  }
  return undefined;
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
  record: Record<string, unknown>,
  onFieldChange: (key: string, value: unknown) => void,
  onBlur: () => void,
  onEscape: (key: string) => void,
  statusDefs: StatusDefOption[] | undefined,
  disabled: boolean,
  selectOptionsByFieldKey?: Record<string, { value: string; label: string }[]>
): ReactNode {
  const key = field.key;
  const formVal = formData[key];
  const formHasMeaningful =
    formVal !== undefined && formVal !== null && String(formVal).trim() !== "";
  const value = formHasMeaningful ? formVal : record[key];
  const hint = field.renderHint ?? "text";
  const onKeyDown = makeKeydownHandlers(key, onBlur, onEscape);

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
    const boolVal = value === true || value === "true";
    return (
      <select
        value={boolVal ? "true" : (value === false || value === "false") ? "false" : ""}
        onChange={(e) => {
          const v = e.target.value;
          onFieldChange(key, v === "" ? "" : v === "true");
        }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={INLINE_EDIT_SELECT}
      >
        <option value="">— None —</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  const refOpts = selectOptionsByFieldKey?.[key];
  const refSelectKeys = new Set([
    "pipeline_stage_id",
    "vertical_id",
    "primary_person_id",
    "assigned_vendor_id",
    "location_id",
    "primary_contact_id",
    "contact_id",
    "customer_id",
    "opportunity_id",
    "job_id",
    "customer_subscription_id",
    "discount_code_id",
    "work_unit_id",
  ]);
  /** Reference selects (FK ids) win over generic `status` hint; workflow status uses status_key + statusDefs. */
  if (refOpts && refOpts.length > 0 && refSelectKeys.has(key)) {
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
        {refOpts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (hint === "status" && statusDefs && statusDefs.length > 0) {
    const valStr = String(value ?? "").trim();
    let options = statusDefs.filter((s) => s.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (valStr && !options.some((s) => s.status_key === valStr)) {
      options = [...options, { status_key: valStr, status_label: valStr, sort_order: 9999, is_active: true }];
    }
    return (
      <select
        value={valStr}
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
  overviewSectionsOverride,
  isEditing = false,
  formData,
  onFieldChange,
  onBlur,
  canEdit = false,
  statusDefs,
  getStatusLabel,
  onOpenDrawer,
  selectOptionsByFieldKey,
}: EntityDrawerOverviewProps) {
  const config = getEntityPresentation(entityType);
  const sections = overviewSectionsOverride ?? config.drawer?.overviewSections ?? [];
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

  const renderOverviewField = (field: EntityDrawerFieldConfig): ReactNode => {
    const key = field.key;
    let displayFallback: unknown = undefined;
    if (entityType === "schedules") {
      const schedExplicit = scheduleOverviewRelationshipReadLabel(record, key);
      if (schedExplicit !== undefined) {
        displayFallback = schedExplicit === "" ? "—" : schedExplicit;
      }
    }
    if (displayFallback === undefined && entityType === "opportunities") {
      const oppExplicit = opportunityOverviewRelationshipReadLabel(record, key);
      if (oppExplicit !== undefined) {
        displayFallback = oppExplicit === "" ? "—" : oppExplicit;
      }
    }
    if (displayFallback === undefined) {
      displayFallback =
      key === "_status_display"
        ? record._status_display
        : key === "status_key" && record._status_display != null
        ? record._status_display
        : key === "status" && record._status_display != null && String(record._status_display).trim() !== ""
          ? record._status_display
        : key === "assigned_vendor_id" && (record._vendor_name != null || record._assigned_vendor_name != null)
          ? String(record._vendor_name ?? record._assigned_vendor_name)
          : key === "work_unit_id" && record._work_unit_label != null
            ? String(record._work_unit_label)
          : key === "pipeline_stage_id" && record._pipeline_stage_name != null
            ? record._pipeline_stage_name
            : key === "pipeline_id" && record._pipeline_name != null
              ? record._pipeline_name
              : key === "discount_program_id" && record._discount_program_label != null
                ? record._discount_program_label
              : key === "vertical_id" && record._vertical_name != null
                ? record._vertical_name
                : key === "location_id" && (record._location_label != null || record._location_name != null)
                  ? String(record._location_label ?? record._location_name)
                  : key === "access_method_id" &&
                      record._access_method_label != null &&
                      String(record._access_method_label).trim() !== ""
                    ? String(record._access_method_label).trim()
                  : key === "primary_person_id" && record._primary_person_name != null
                    ? record._primary_person_name
                    : key === "primary_contact_id" && (record._primary_contact_name != null || record._contact_name != null)
                      ? (record._primary_contact_name ?? record._contact_name)
                      : key === "contact_id" && (record._primary_contact_name != null || record._contact_name != null)
                        ? (record._primary_contact_name ?? record._contact_name)
                      : key === "customer_id" && record._customer_name != null
                        ? record._customer_name
                        : key === "opportunity_id" && record._opportunity_name != null
                          ? record._opportunity_name
                          : key === "job_id" && (record._job_title != null || record._job_label != null)
                            ? String(record._job_title ?? record._job_label)
                            : key === "customer_subscription_id" && record._customer_subscription_label != null
                              ? String(record._customer_subscription_label)
                              : key === "discount_code_id" && (record.discount_code != null || record._discount_label != null)
                                ? String(record.discount_code ?? record._discount_label ?? "").trim() || undefined
                                : key === "_customer_name" && record._customer_name != null
                                  ? String(record._customer_name)
                                  : key === "_location_name" && (record._location_name != null || record._location_label != null)
                                    ? String(record._location_name ?? record._location_label)
                                    : key === "_opportunity_name" && record._opportunity_name != null
                                      ? String(record._opportunity_name)
                                      : key === "_primary_person_name" && record._primary_person_name != null
                                        ? String(record._primary_person_name)
                                        : undefined;
    }
    if (displayFallback === undefined) {
      const canon = canonicalReadFallbackForShadowedField(entityType, key, record);
      if (canon !== undefined) displayFallback = canon;
    }
    if (displayFallback === undefined) {
      const resolved = resolveOverviewRelationshipLabel(record, key);
      if (resolved != null) displayFallback = resolved;
    }
    const showFieldEdit = !!(isEditing && canEdit && field.editable && onFieldChange);
    const rawForRead = displayFallback !== undefined ? displayFallback : record[key];
    const rawValue = showFieldEdit
      ? (() => {
          const ed = editFormData[key];
          if (ed !== undefined && ed !== null && String(ed).trim() !== "") return ed;
          return record[key];
        })()
      : rawForRead;
    let displayValue = formatFieldValue(rawValue, field, getStatusLabel, record, onOpenDrawer, entityType);
    if (!showFieldEdit && (displayValue === null || displayValue === undefined || displayValue === "")) {
      displayValue = "—";
    }
    const editNode = showFieldEdit
      ? renderFieldEditNode(
          field,
          editFormData,
          record,
          handleFieldChange,
          handleBlur,
          handleEscape,
          statusDefs,
          !canEdit,
          selectOptionsByFieldKey
        )
      : undefined;
    return (
      <EntityDrawerField
        key={field.key}
        label={field.label}
        value={displayValue}
        span={field.span ?? 1}
        editNode={editNode}
        isEditing={showFieldEdit}
      />
    );
  };

  return (
    <div className="space-y-0 pt-5" data-entity-drawer-overview>
      {sections.map((section: EntityDrawerSectionConfig) => {
        const hasSubsections = (section.subsections?.length ?? 0) > 0;
        const hasTopFields = section.fields && section.fields.length > 0;
        const hasFields = hasTopFields || hasSubsections;
        const customContent = customSectionContent[section.key];

        const gridInner = section.gridCols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";

        const children: ReactNode =
          customContent ??
          (hasSubsections ? (
            <div className={`${section.gridCols === 2 ? "md:col-span-2" : ""} w-full space-y-6`}>
              {section.subsections!.map((sub) => (
                <div key={sub.title}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-alloy-forge/80 border-b border-admin-border pb-2 mb-3">
                    {sub.title}
                  </p>
                  <div className={`grid gap-x-6 gap-y-4 ${gridInner}`}>{sub.fields.map((f) => renderOverviewField(f))}</div>
                </div>
              ))}
            </div>
          ) : hasTopFields ? (
            section.fields!.map((f) => renderOverviewField(f))
          ) : null);

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
