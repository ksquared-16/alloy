import type { EntityDrawerFieldConfig, EntityDrawerSectionConfig, EntityPresentationType } from "@/lib/entityPresentation";
import { getEntityPresentation } from "@/lib/entityPresentation";

/** Entity drawers that use unified status_definitions + status_key in overview. */
export const ENTITY_TYPES_WITH_UNIFIED_DRAWER_STATUS: ReadonlySet<EntityPresentationType> = new Set([
  "jobs",
  "schedules",
  "opportunities",
  "vendors",
  "customers",
  "persons",
  "locations",
  "documents",
  "contacts",
  "customer_members",
  "subscriptions",
]);

/** Strip these so a single canonical status control can be injected (no raw FK rows). */
const LEGACY_STATUS_FIELD_KEYS = new Set([
  "status_key",
  "_status_display",
  "job_status_id",
  "schedule_status_id",
  "vendor_status_id",
  "payment_status_id",
]);

function cloneField(f: EntityDrawerFieldConfig): EntityDrawerFieldConfig {
  return { ...f, ...(f.linkTarget ? { linkTarget: { ...f.linkTarget } } : {}) };
}

export function extractCanonicalStatusFieldFromPresentation(t: EntityPresentationType): EntityDrawerFieldConfig | null {
  const sections = getEntityPresentation(t).drawer?.overviewSections ?? [];
  const allFields: EntityDrawerFieldConfig[] = [];
  for (const s of sections) {
    for (const f of s.fields ?? []) allFields.push(f);
    for (const sub of s.subsections ?? []) {
      for (const f of sub.fields ?? []) allFields.push(f);
    }
  }
  const statusKeyField = allFields.find((f) => f.renderHint === "status" && f.key === "status_key");
  if (statusKeyField) return cloneField(statusKeyField);
  const displayOnly = allFields.find((f) => f.renderHint === "status" && f.key === "_status_display");
  return displayOnly ? cloneField(displayOnly) : null;
}

function stripFields(fields: EntityDrawerFieldConfig[]): EntityDrawerFieldConfig[] {
  return fields.filter((f) => !LEGACY_STATUS_FIELD_KEYS.has(f.key));
}

function stripSection(s: EntityDrawerSectionConfig): EntityDrawerSectionConfig {
  const fields = stripFields(s.fields ?? []);
  const subsections = s.subsections
    ?.map((sub) => ({
      ...sub,
      fields: stripFields(sub.fields ?? []),
    }))
    .filter((sub) => sub.fields.length > 0);
  return { ...s, fields, subsections };
}

/**
 * Ensures exactly one Status row in config-driven overview: strip legacy keys, prepend canonical field from presentation.
 */
export function mergeUnifiedStatusIntoConfigOverview(
  presentationType: EntityPresentationType,
  sections: EntityDrawerSectionConfig[]
): EntityDrawerSectionConfig[] {
  if (!ENTITY_TYPES_WITH_UNIFIED_DRAWER_STATUS.has(presentationType)) {
    return sections;
  }
  if (sections.length === 0) {
    return sections;
  }
  const canonical = extractCanonicalStatusFieldFromPresentation(presentationType);
  if (!canonical) return sections;

  const stripped = sections.filter((s) => s.key !== "__unified_status").map((s) => stripSection(s));

  const statusSection: EntityDrawerSectionConfig = {
    key: "__unified_status",
    title: "Status",
    defaultExpanded: true,
    collapsible: false,
    gridCols: 2,
    fields: [{ ...canonical, label: canonical.label || "Status", locked: true }],
    locked: true,
  };

  let result = [statusSection, ...stripped];

  if (presentationType === "jobs") {
    const jobSectionRank: Record<string, number> = {
      __unified_status: -1,
      job_details: 0,
      property_service: 1,
      customer_location: 2,
      scheduling: 3,
      pricing: 4,
      notes: 5,
      record_info: 6,
    };
    const rank = (k: string) => (jobSectionRank[k] !== undefined ? jobSectionRank[k]! : 50);
    result = [...result].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
  }

  return result;
}
