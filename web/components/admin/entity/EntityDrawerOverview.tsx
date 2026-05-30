"use client";

import { ReactNode, useMemo } from "react";
import {
  getEntityPresentation,
  type EntityPresentationType,
  type EntityDrawerFieldConfig,
  type EntityDrawerSectionConfig,
} from "@/lib/entityPresentation";
import { formatDate, formatDateTime, formatMoney, formatMoneyFromCents, formatPhoneUS, formatPayoutPercent, RECURRENCE_UNIT_OPTIONS } from "@/lib/adminFormatters";
import { StatusBadge } from "@/components/admin/StatusBadge";
import EntityDrawerSection from "./EntityDrawerSection";
import EntityDrawerField, { INPUT_ERROR_CLASS } from "./EntityDrawerField";
import {
  oppInqEyebrow,
  oppInqFieldInput,
  oppInqInnerCardCompact,
  oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import type { DrawerFieldPolicyChrome } from "@/lib/admin/drawer/fieldEditabilityInDrawer";
import {
    OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS,
    readLinkedPersonMirrorValue,
} from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { listUnmappedFieldValidationErrors } from "@/lib/admin/drawer/drawerSaveErrors";
import { isUuidLike, resolveOverviewRelationshipLabel } from "@/lib/admin/overviewRelationshipLabels";
import { scheduleOverviewRelationshipReadLabel } from "@/lib/admin/scheduleOverviewLabels";
import { isScheduleCanceledStatusKey } from "@/lib/admin/scheduleCanceledStatus";
import {
  collectScheduleRowResolvedKeys,
  flattenOverviewFieldIndex,
  resolveScheduleOverviewRowFieldKey,
  scheduleOverviewRowTokenLabel,
  scheduleSectionsAfterRowExtraction,
} from "@/lib/admin/scheduleOverviewRows";
import { getScheduleOverviewFieldTier, type ScheduleFieldVisualTier } from "@/lib/admin/scheduleFieldPresentation";
import { labelForLocationMetadataSelectValue } from "@/lib/admin/location/locationDrawerFieldOptions";
import {
  getScheduleSnapshot,
  scheduleOverviewValueFromSnapshot,
  shouldShowScheduleContactEmailRow,
} from "@/lib/admin/scheduleRecordSnapshot";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import { collectResolvedKeysFromScheduleLayoutBlocks, isScheduleLayoutV2 } from "@/lib/recordChrome/scheduleLayoutConfig";
import ScheduleSnapCell from "@/components/admin/drawer/ScheduleSnapCell";
import {
  opportunityOverviewRelationshipReadLabel,
  opportunityOverviewStatusBadgeLabel,
} from "@/lib/admin/opportunityOverviewLabels";
import { childLifecycleSectionSurface } from "@/lib/admin/person/personDrawerChildLifecycleSlots";

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
  /** Optional header-right content for a given section key (e.g. registry-backed CTA). */
  customSectionHeaderRight?: Record<string, ReactNode>;
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
  /** Schedule record: optional row groups from `record_layouts.config_json.overview_rows` (v1). */
  scheduleOverviewRows?: string[][];
  /** Schedule record: full layout config; when `version === 2` and `layout_blocks` set, drives structured chrome. */
  scheduleRecordLayout?: RecordLayoutConfigJson | null;
  /** Body section chrome (e.g. childcare inquiry workflow drawer). */
  sectionSurface?: "default" | "premium";
  /** Child lifecycle person drawer — neutral section chrome; enrollment keeps premium accent. */
  personChildLifecycleOverview?: boolean;
  /** Per-field server validation messages (opportunity/job policy enforcement). */
  fieldErrorsByKey?: Record<string, string>;
  /** Policy display chrome from `_field_policy_resolved` (required/read-only). */
  fieldPolicyChromeByKey?: Record<string, DrawerFieldPolicyChrome>;
  /** Labels for fields not visible in current sections (global error list). */
  fieldLabelByKey?: Record<string, string>;
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
      if (presentationEntityType === "schedules" && key === "price_cents") {
        const raw = value as number | string | null | undefined;
        const cents = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(String(raw), 10) : NaN;
        if (Number.isFinite(cents)) return formatMoneyFromCents(cents);
        return "—";
      }
      const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
      if (key === "_discount_amount_cents" && Number.isFinite(n) && n > 0) {
        return `-${formatMoneyFromCents(n)}`;
      }
      return formatMoney(value as number | string | null | undefined, key);
    }
    case "link":
      if (
        presentationEntityType === "schedules" &&
        field.key === "assigned_vendor_id" &&
        field.linkTarget?.entityType === "vendors" &&
        record
      ) {
        const idField = field.linkTarget.idField;
        const id = record[idField];
        if (id == null || String(id).trim() === "") {
          return <span className="text-sm font-medium text-alloy-forge/85">Unassigned</span>;
        }
      }
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
  if (entityType === "opportunities") {
    if (OPPORTUNITY_PRIMARY_PERSON_MIRROR_FIELD_KEYS.has(fieldKey)) {
      return readLinkedPersonMirrorValue(record, fieldKey, fieldKey);
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
  selectOptionsByFieldKey: Record<string, { value: string; label: string }[]> | undefined,
  presentationEntityType: EntityPresentationType,
  hasValidationError?: boolean
): ReactNode {
  const errorInputClass = hasValidationError ? INPUT_ERROR_CLASS : "";
  const usePersonPremiumInput = presentationEntityType === "persons";
  const inputClass = `${usePersonPremiumInput ? oppInqFieldInput : INLINE_EDIT_INPUT} ${errorInputClass}`.trim();
  const selectClass = `${usePersonPremiumInput ? oppInqFieldInput : INLINE_EDIT_SELECT} ${errorInputClass}`.trim();
  const key = field.key;
  const formVal = formData[key];
  const formHasMeaningful =
    formVal !== undefined && formVal !== null && String(formVal).trim() !== "";
  const value = formHasMeaningful ? formVal : record[key];
  const hint = field.renderHint ?? "text";
  const onKeyDown = makeKeydownHandlers(key, onBlur, onEscape);

  if (presentationEntityType === "schedules" && key === "assigned_vendor_id") {
    const fk = record.assigned_vendor_id;
    const hasFk = fk != null && String(fk).trim() !== "";
    const nameRaw = record._assigned_vendor_name ?? record._vendor_name;
    const name = nameRaw != null && String(nameRaw).trim() !== "" ? String(nameRaw).trim() : "";
    const display = !hasFk ? "Unassigned" : name || "—";
    return (
      <span className="inline-flex w-full min-h-[2.25rem] items-center text-sm font-medium text-alloy-midnight/90">
        {display}
      </span>
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
        className={inputClass}
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
        className={inputClass}
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
        className={selectClass}
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
    // LEGACY: contact-based identity (do not extend). TODO: migrate to person_id
    "primary_contact_id",
    // LEGACY: contact-based identity (do not extend). TODO: migrate to person_id
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
        className={selectClass}
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

  if (refOpts && refOpts.length > 0 && presentationEntityType === "locations") {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onFieldChange(key, e.target.value || null)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={selectClass}
      >
        <option value="">—</option>
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
    const scheduleCanceled =
      presentationEntityType === "schedules" &&
      record.canceled_at != null &&
      String(record.canceled_at).trim() !== "";
    if (scheduleCanceled) {
      const lab = statusDefs.find((s) => s.status_key === valStr)?.status_label ?? valStr;
      return (
        <span className="inline-flex w-full items-center rounded border border-admin-border bg-alloy-stone/5 px-2 py-1.5 text-sm text-alloy-midnight/80">
          {lab || "—"}
        </span>
      );
    }
    let options = statusDefs.filter((s) => s.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (presentationEntityType === "schedules") {
      options = options.filter((s) => !isScheduleCanceledStatusKey(s.status_key));
    }
    if (valStr && !options.some((s) => s.status_key === valStr)) {
      if (!(presentationEntityType === "schedules" && isScheduleCanceledStatusKey(valStr))) {
        options = [...options, { status_key: valStr, status_label: valStr, sort_order: 9999, is_active: true }];
      }
    }
    return (
      <select
        value={valStr}
        onChange={(e) => onFieldChange(key, e.target.value || null)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={selectClass}
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
        className={selectClass}
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
      className={inputClass}
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
  customSectionHeaderRight = {},
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
  scheduleOverviewRows,
  scheduleRecordLayout,
  sectionSurface = "default",
  personChildLifecycleOverview = false,
  fieldErrorsByKey,
  fieldPolicyChromeByKey,
  fieldLabelByKey = {},
}: EntityDrawerOverviewProps) {
  const config = getEntityPresentation(entityType);
  const baseSections = overviewSectionsOverride ?? config.drawer?.overviewSections ?? [];

  const fieldIndex = flattenOverviewFieldIndex(baseSections);
  const useScheduleLayoutV2 =
    entityType === "schedules" && isScheduleLayoutV2(scheduleRecordLayout ?? undefined);
  const layoutBlocks = scheduleRecordLayout?.layout_blocks;
  const rowKeySet =
    entityType === "schedules" && useScheduleLayoutV2 && layoutBlocks?.length
      ? collectResolvedKeysFromScheduleLayoutBlocks(layoutBlocks)
      : scheduleOverviewRows && scheduleOverviewRows.length > 0 && entityType === "schedules"
        ? collectScheduleRowResolvedKeys(scheduleOverviewRows)
        : null;
  const sections = rowKeySet
    ? scheduleSectionsAfterRowExtraction(baseSections, rowKeySet, customSectionContent)
    : baseSections;

  const record = useMemo(() => (data ?? {}) as Record<string, unknown>, [data]);
  const scheduleSnapshot = useMemo(
    () => (entityType === "schedules" ? getScheduleSnapshot(record) : null),
    [entityType, record]
  );

  const unmappedFieldErrors = useMemo(() => {
    if (!fieldErrorsByKey || Object.keys(fieldErrorsByKey).length === 0) return [];
    return listUnmappedFieldValidationErrors(fieldErrorsByKey, new Set(fieldIndex.keys()), fieldLabelByKey);
  }, [fieldErrorsByKey, fieldIndex, fieldLabelByKey]);

  if (!baseSections.length) return null;

  const editFormData = formData ?? record;
  const handleFieldChange = onFieldChange ?? (() => {});
  const handleBlur = onBlur ?? (() => {});
  /** Revert one field to record value and blur (Escape). */
  const handleEscape = (key: string) => {
    handleFieldChange(key, record[key]);
    handleBlur();
  };

  const renderOverviewField = (
    field: EntityDrawerFieldConfig,
    opts?: {
      row?: boolean;
      scheduleFieldTier?: ScheduleFieldVisualTier;
      /** v2 snapshot: label + value only — no card chrome (operational summary). */
      scheduleChromePresentation?: "cards" | "flat";
    }
  ): ReactNode => {
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
    if (displayFallback === undefined && entityType === "schedules" && scheduleSnapshot) {
      const fromSnap = scheduleOverviewValueFromSnapshot(scheduleSnapshot, key);
      if (fromSnap !== undefined) displayFallback = fromSnap;
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
    const policyChrome = fieldPolicyChromeByKey?.[key];
    const policyReadOnly = policyChrome?.readOnly === true;
    const showFieldEdit = !!(isEditing && canEdit && field.editable && !policyReadOnly && onFieldChange);
    const fieldError = fieldErrorsByKey?.[key] ?? null;
    const rawForRead = displayFallback !== undefined ? displayFallback : record[key];
    const rawValue = showFieldEdit
      ? (() => {
          const ed = editFormData[key];
          if (ed !== undefined && ed !== null && String(ed).trim() !== "") return ed;
          return record[key];
        })()
      : rawForRead;
    let displayValue = formatFieldValue(rawValue, field, getStatusLabel, record, onOpenDrawer, entityType);
    if (!showFieldEdit && selectOptionsByFieldKey?.[key]?.length) {
        const labeled = labelForLocationMetadataSelectValue(key, rawValue, selectOptionsByFieldKey[key]);
        if (labeled) displayValue = labeled;
    }
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
          selectOptionsByFieldKey,
          entityType,
          !!fieldError
        )
      : undefined;
    const scheduleSnapRow = !!(opts?.row && entityType === "schedules");
    const usePremiumPersonFields = entityType === "persons" && sectionSurface === "premium";
    const density: "default" | "compact" = scheduleSnapRow || usePremiumPersonFields ? "compact" : "default";
    const tier = opts?.scheduleFieldTier;
    const fieldProps = {
      label: scheduleSnapRow ? "" : field.label,
      value: displayValue,
      span: field.span ?? 1,
      editNode,
      isEditing: showFieldEdit,
      density,
      showLabel: !scheduleSnapRow,
      errorMessage: fieldError,
      readOnlyHint:
        policyReadOnly && !showFieldEdit
          ? policyChrome?.readOnlyReason?.trim() ||
            (policyChrome?.linkedSourceLabel
              ? `${policyChrome.linkedSourceLabel} (read-only)`
              : "Read-only (policy)")
          : policyChrome?.linkedSourceLabel && showFieldEdit
            ? `Edits save to ${policyChrome.linkedSourceLabel.toLowerCase()}`
            : null,
      ...(scheduleSnapRow && tier ? { valueEmphasis: tier } : {}),
    };
    if (scheduleSnapRow && opts?.scheduleChromePresentation === "flat") {
      const valClass =
        tier === "primary"
          ? "text-[15px] font-semibold tracking-tight text-alloy-midnight"
          : tier === "supporting"
            ? "text-xs font-normal text-alloy-forge/85"
            : "text-sm font-medium text-alloy-midnight/88";
      return (
        <div key={field.key} className="min-w-0" data-schedule-flat-field={field.key}>
          <div className="mb-0.5 text-[8px] font-semibold tracking-[0.1em] text-alloy-forge/50">{field.label}</div>
          <div className={`${valClass} leading-snug`}>{showFieldEdit ? <>{editNode}</> : <>{displayValue}</>}</div>
        </div>
      );
    }
    if (scheduleSnapRow) {
      return (
        <ScheduleSnapCell key={field.key} label={field.label} tier={tier ?? "secondary"}>
          <EntityDrawerField {...fieldProps} />
        </ScheduleSnapCell>
      );
    }
    return <EntityDrawerField key={field.key} {...fieldProps} />;
  };

  const rowGridClass = (n: number) =>
    n <= 1
      ? "grid-cols-1"
      : n === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : n === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  const renderScheduleChromeField = (
    token: string,
    cellKey: string,
    tierBreak: boolean,
    presentation: "cards" | "flat" = "cards"
  ) => {
    const resolvedKey = resolveScheduleOverviewRowFieldKey(token);
    const tier = getScheduleOverviewFieldTier(resolvedKey);
    if (resolvedKey === "_contact_email" && !shouldShowScheduleContactEmailRow(record)) {
      return null;
    }
    let field = fieldIndex.get(resolvedKey);
    if (!field) {
      field = {
        key: resolvedKey,
        label: scheduleOverviewRowTokenLabel(token),
        span: 1,
        renderHint: "text",
        editable: false,
      };
    }
    const groupClass = tierBreak
      ? "min-w-0 mt-3 border-t border-alloy-stone/15 pt-3 sm:mt-0 sm:border-t-0 sm:border-l sm:border-alloy-stone/25 sm:pt-0 sm:pl-3"
      : "min-w-0";
    return (
      <div key={cellKey} className={groupClass}>
        {renderOverviewField(field, {
          row: true,
          scheduleFieldTier: tier,
          scheduleChromePresentation: presentation,
        })}
      </div>
    );
  };

  const personPremiumOverview =
    entityType === "persons" && sectionSurface === "premium" && !personChildLifecycleOverview;

  return (
    <div
      className={`${
        personChildLifecycleOverview
          ? "space-y-0 pt-2 pb-0"
          : personPremiumOverview
            ? `${oppInqLeadSummaryShellClassName} space-y-1 px-1 py-1`
            : sectionSurface === "premium"
            ? entityType === "persons"
              ? "space-y-0 pt-2 pb-0"
              : "space-y-0 pt-4 pb-1"
            : `space-y-0 ${entityType === "schedules" ? "pt-2 [&_section[data-entity-section]]:mb-3" : "pt-4"}`
      }`}
      data-entity-drawer-overview
      data-section-surface={sectionSurface}
    >
      {unmappedFieldErrors.length > 0 ? (
        <div
          className="mb-3 rounded-md border border-alloy-ember/30 bg-red-50 px-3 py-2 text-sm text-alloy-ember"
          role="alert"
          data-drawer-field-validation-summary
        >
          <p className="font-medium">Fix these fields (not shown in the current view):</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {unmappedFieldErrors.map((e) => (
              <li key={e.field_key}>
                <span className="font-medium">{e.label}</span>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {useScheduleLayoutV2 && layoutBlocks?.length && entityType === "schedules" ? (
        <div className="mb-2 space-y-1.5" data-schedule-layout-version="2">
          {layoutBlocks.map((block) => {
            if (block.type === "section_group") return null;
            if (block.type === "snapshot") {
              return (
                <div
                  key={block.key}
                  data-schedule-layout-block="snapshot"
                  data-block-key={block.key}
                  className="rounded-lg border border-admin-border/40 bg-white px-2 py-1.5 shadow-sm sm:px-2.5 sm:py-2"
                >
                  {block.title ? (
                    <p className="mb-1.5 text-[9px] font-semibold tracking-[0.12em] text-alloy-forge/60">
                      {block.title}
                    </p>
                  ) : null}
                  <div className="divide-y divide-alloy-stone/15">
                    {block.groups.map((group, gi) => (
                      <div
                        key={`${block.key}-g-${gi}`}
                        className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3"
                      >
                        <span className="shrink-0 pt-0.5 text-[8px] font-semibold tracking-[0.12em] text-alloy-forge/45 sm:w-[7.5rem]">
                          {group.label}
                        </span>
                        <div
                          className={`min-w-0 flex-1 grid gap-x-3 gap-y-1.5 ${rowGridClass(
                            Math.min(4, Math.max(1, group.fields.length))
                          )}`}
                        >
                          {group.fields.map((token, ci) => {
                            const prevResolvedKey = ci > 0 ? resolveScheduleOverviewRowFieldKey(group.fields[ci - 1]!) : null;
                            const resolvedKey = resolveScheduleOverviewRowFieldKey(token);
                            const prevTier =
                              prevResolvedKey != null ? getScheduleOverviewFieldTier(prevResolvedKey) : null;
                            const tier = getScheduleOverviewFieldTier(resolvedKey);
                            const tierBreak = ci > 0 && prevTier != null && tier !== prevTier;
                            return renderScheduleChromeField(
                              token,
                              `${block.key}-${gi}-${ci}-${resolvedKey}`,
                              tierBreak,
                              "flat"
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return (
              <div
                key={block.key}
                data-schedule-layout-block="secondary_summary"
                data-block-key={block.key}
                className="border-t border-alloy-stone/20 pt-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-10 gap-y-2">
                  {block.fields.map((token) => {
                    const resolvedKey = resolveScheduleOverviewRowFieldKey(token);
                    if (!scheduleSnapshot) return null;
                    if (resolvedKey === "service_type") {
                      const text = scheduleSnapshot.service.label?.trim() || "—";
                      return (
                        <div key={`${block.key}-svc`} className="min-w-0">
                          <span className="mr-2 text-[8px] font-semibold tracking-[0.1em] text-alloy-forge/45">
                            Service
                          </span>
                          <span className="text-[13px] font-medium text-alloy-midnight/90">{text}</span>
                        </div>
                      );
                    }
                    if (resolvedKey === "price_cents") {
                      const cents = scheduleSnapshot.service.price;
                      const text =
                        cents != null && Number.isFinite(cents) ? formatMoneyFromCents(cents) : "—";
                      return (
                        <div key={`${block.key}-price`} className="min-w-0">
                          <span className="mr-2 text-[8px] font-semibold tracking-[0.1em] text-alloy-forge/45">
                            Price
                          </span>
                          <span className="text-[13px] font-semibold tabular-nums text-alloy-midnight">{text}</span>
                        </div>
                      );
                    }
                    return renderScheduleChromeField(
                      token,
                      `${block.key}-ss-${resolvedKey}`,
                      false,
                      "flat"
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : scheduleOverviewRows && scheduleOverviewRows.length > 0 && entityType === "schedules" ? (
        <div
          className="mb-3 rounded-lg border border-admin-border/40 bg-white/90 px-2 py-2 shadow-sm sm:px-2.5"
          data-schedule-overview-rows="true"
          data-schedule-layout-version="1"
        >
          <p className="px-0.5 pb-1.5 text-[9px] font-semibold tracking-[0.12em] text-alloy-forge/70">
            Visit details
          </p>
          <div className="space-y-3">
            {scheduleOverviewRows.map((row, ri) => (
              <div
                key={`row-${ri}`}
                className={`grid gap-x-2.5 gap-y-2 ${rowGridClass(Math.min(4, Math.max(1, row.length)))}`}
              >
                {row.map((token, ci) => {
                  const resolvedKey = resolveScheduleOverviewRowFieldKey(token);
                  const prevResolvedKey = ci > 0 ? resolveScheduleOverviewRowFieldKey(row[ci - 1]!) : null;
                  const tier = getScheduleOverviewFieldTier(resolvedKey);
                  const prevTier = prevResolvedKey != null ? getScheduleOverviewFieldTier(prevResolvedKey) : null;
                  const tierBreak = ci > 0 && prevTier != null && tier !== prevTier;
                  return renderScheduleChromeField(token, `${ri}-${ci}-${resolvedKey}`, tierBreak);
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {sections.map((section: EntityDrawerSectionConfig) => {
        const effectiveSectionSurface = personChildLifecycleOverview
          ? childLifecycleSectionSurface(section.key)
          : sectionSurface;
        const hasSubsections = (section.subsections?.length ?? 0) > 0;
        const hasTopFields = section.fields && section.fields.length > 0;
        const hasFields = hasTopFields || hasSubsections;
        const customContent = customSectionContent[section.key];
        const headerRight = customSectionHeaderRight[section.key];

        const gridInner =
          section.gridCols === 2
            ? personPremiumOverview
              ? "grid-cols-1 gap-x-2 gap-y-1 sm:grid-cols-2"
              : "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1";

        const subsectionTitleClass =
          effectiveSectionSurface === "premium"
            ? personPremiumOverview
              ? oppInqEyebrow
              : "text-[10px] font-semibold tracking-[0.1em] text-alloy-midnight/50 border-b border-alloy-stone/15 pb-1.5 mb-2.5"
            : "text-xs font-semibold tracking-wider text-alloy-forge/80 border-b border-admin-border pb-2 mb-3";

        const children: ReactNode =
          customContent ??
          (hasSubsections ? (
            <div className={`${section.gridCols === 2 ? "md:col-span-2" : ""} w-full ${effectiveSectionSurface === "premium" ? "space-y-5" : "space-y-6"}`}>
              {section.subsections!.map((sub) => (
                <div key={sub.title}>
                  <p className={subsectionTitleClass}>{sub.title}</p>
                  <div className={`grid ${effectiveSectionSurface === "premium" ? "gap-x-4 gap-y-3" : "gap-x-6 gap-y-4"} ${gridInner}`}>
                    {sub.fields.map((f) => renderOverviewField(f))}
                  </div>
                </div>
              ))}
            </div>
          ) : hasTopFields ? (
            section.fields!.map((f) => renderOverviewField(f))
          ) : null);

        const sectionWrapperClass = personPremiumOverview ? `${oppInqInnerCardCompact} mb-1 min-h-0` : "";

        if (!hasFields && !customContent) return null;

        return (
          <div key={section.key} className={sectionWrapperClass}>
          <EntityDrawerSection config={section} surface={effectiveSectionSurface} headerRight={headerRight}>
            {children}
          </EntityDrawerSection>
          </div>
        );
      })}
    </div>
  );
}
