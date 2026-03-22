import type { ContextBlockConfig, ContextRelationshipGroupConfig, WorkspaceLevel } from "../context-config";
import type {
  ContextBlockVm,
  ContextRelationshipGroupVm,
  ContextRelationshipItemVm,
} from "../workspace-types";

/**
 * Raw related rows keyed by relationship group key (adapter input).
 * Shape is intentionally loose — map from your API into this before calling normalize.
 */
export type ContextRelationshipRawData = Record<
  string,
  Array<{
    id: string;
    [field: string]: unknown;
  }>
>;

export type NormalizeContextOptions = {
  level: WorkspaceLevel;
  role?: string;
};

function groupVisible(config: ContextRelationshipGroupConfig, opts: NormalizeContextOptions): boolean {
  if (!config.visibility.levels.includes(opts.level)) return false;
  if (config.visibility.roles?.length && opts.role) {
    return config.visibility.roles.includes(opts.role);
  }
  if (config.visibility.roles?.length && !opts.role) return false;
  return true;
}

function itemToVm(
  row: Record<string, unknown>,
  previewFields: string[],
  actionIds: string[]
): ContextRelationshipItemVm {
  const id = String(row.id ?? "");
  const fields: Record<string, string> = {};
  for (const k of previewFields) {
    const v = row[k];
    if (v != null) fields[k] = String(v);
  }
  const previewLine =
    previewFields
      .map((k) => fields[k])
      .filter(Boolean)
      .join(" · ") || String(row.title ?? row.name ?? id);

  return {
    id,
    previewLine,
    fields,
    quickActions: actionIds.map((aid) => ({ id: aid, label: formatActionLabel(aid) })),
  };
}

function formatActionLabel(actionId: string): string {
  return actionId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Maps ContextBlockConfig + raw related entities into ContextBlockVm.
 * No industry-specific branching — only config + data.
 */
export function normalizeContextRelationshipGroups(
  config: ContextBlockConfig | null | undefined,
  rawByGroup: ContextRelationshipRawData,
  opts: NormalizeContextOptions
): ContextBlockVm {
  if (!config?.relationship_groups?.length) {
    return { groups: [] };
  }

  const groups: ContextRelationshipGroupVm[] = [];

  for (const g of [...config.relationship_groups].sort((a, b) => a.order - b.order)) {
    if (!groupVisible(g, opts)) continue;
    const rows = rawByGroup[g.key] ?? [];
    const sliced = rows.slice(0, g.display.max_items);
    const items = sliced.map((row) =>
      itemToVm(row as Record<string, unknown>, g.display.preview_fields, g.actions)
    );
    groups.push({
      key: g.key,
      label: g.label,
      order: g.order,
      expanded: g.display.default_expanded,
      items,
    });
  }

  return { title: undefined, groups };
}
