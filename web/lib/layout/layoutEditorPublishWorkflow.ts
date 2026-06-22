/**
 * Visual layout editor — save/publish workflow helpers (Phase 5.12).
 */

import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { duplicateEntityLayoutDraft } from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import { invalidateDrawerLayoutRuntimeBodyCacheForApiPath } from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";

/** Fork a published layout row into a new editable draft. */
export async function forkPublishedLayoutToDraft(source: EntityLayoutRecord): Promise<EntityLayoutRecord> {
    if (source.status !== "published") return source;
    return duplicateEntityLayoutDraft(source.id);
}

/** Notify live drawer runtimes that org layout changed — bust session cache + queue listeners. */
export function dispatchOpportunityDrawerLayoutPublished(doc: LayoutDoc): void {
    dispatchDrawerLayoutPublished(doc, "/api/admin/layout-runtime/opportunity-drawer-body");
}

export function dispatchPersonDrawerLayoutPublished(doc: LayoutDoc): void {
    dispatchDrawerLayoutPublished(doc, "/api/admin/layout-runtime/person-drawer-body");
}

export function dispatchChildDrawerLayoutPublished(doc: LayoutDoc): void {
    dispatchDrawerLayoutPublished(doc, "/api/admin/layout-runtime/child-drawer-body");
}

/** Notify work-unit queue runtimes after queue row layout publish. */
export function dispatchOpportunityQueueLayoutPublished(doc: LayoutDoc): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent("adminv2:entity-layout-published", {
            detail: { entityType: doc.entityType, surface: doc.surface },
        }),
    );
}

function dispatchDrawerLayoutPublished(doc: LayoutDoc, apiPath: string): void {
    if (typeof window === "undefined") return;
    invalidateDrawerLayoutRuntimeBodyCacheForApiPath(apiPath);
    window.dispatchEvent(
        new CustomEvent("adminv2:entity-layout-published", {
            detail: { entityType: doc.entityType, surface: doc.surface },
        }),
    );
}

export function parseLayoutDocFromRecord(record: EntityLayoutRecord): LayoutDoc {
    const parsed = parseLayoutDoc(record.doc, { inferSurfaceKey: true });
    if (!parsed.ok || !parsed.doc) {
        throw new Error(parsed.errors.join("; ") || "Invalid layout document");
    }
    return parsed.doc;
}
