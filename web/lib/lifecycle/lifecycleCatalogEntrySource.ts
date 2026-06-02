/**
 * Catalog row provenance — primary Lifecycle Builder only lists explicit
 * `departments.metadata.lifecycle_builder_v1.processes[]` entries (no synthesis).
 */

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

export const LIFECYCLE_CATALOG_CONFIG_SOURCE = "departments.metadata.lifecycle_builder_v1" as const;

export type LifecycleCatalogEntryOrigin =
    | "departments.metadata.lifecycle_builder_v1"
    | "client_session_stale_identity"
    | "unknown";

export type LifecycleCatalogTraceRow = {
    display_name: string;
    lifecycle_id: string;
    department_id: string;
    department_key: string;
    process_id: string;
    process_key: string;
    config_source: typeof LIFECYCLE_CATALOG_CONFIG_SOURCE;
    metadata_path: string;
    catalog_source: LifecycleCatalogEntry["source"];
    activation_owned: boolean;
    /** Human-readable; not a second catalog source. */
    notes: string;
};

export function traceRowFromCatalogEntry(entry: LifecycleCatalogEntry): LifecycleCatalogTraceRow {
    return {
        display_name: entry.lifecycle_name,
        lifecycle_id: entry.id,
        department_id: entry.department_id,
        department_key: entry.department_key,
        process_id: entry.process_id,
        process_key: entry.process_key,
        config_source: LIFECYCLE_CATALOG_CONFIG_SOURCE,
        metadata_path: `departments.metadata.${LIFECYCLE_BUILDER_METADATA_KEY}.processes[] (process.id=${entry.process_id})`,
        catalog_source: entry.source,
        activation_owned: entry.activation_owned,
        notes:
            entry.activation_owned
                ? "Builder-owned department row; process from saved lifecycle_builder_v1."
                : "Shared department row; process from saved lifecycle_builder_v1 (not synthesized from work_units or status_stages).",
    };
}

export function formatLifecycleCatalogTrace(rows: LifecycleCatalogTraceRow[]): string {
    if (!rows.length) return "No catalog rows (empty lifecycle_builder_v1.processes across all departments).";
    return rows
        .map(
            (r, i) =>
                `${i + 1}. ${r.display_name}\n` +
                `   lifecycle_id: ${r.lifecycle_id}\n` +
                `   department_id: ${r.department_id} (key=${r.department_key})\n` +
                `   process_id: ${r.process_id} (key=${r.process_key})\n` +
                `   source: ${r.config_source}\n` +
                `   metadata_path: ${r.metadata_path}\n` +
                `   catalog_source: ${r.catalog_source}, activation_owned: ${r.activation_owned}\n` +
                `   notes: ${r.notes}`
        )
        .join("\n\n");
}
