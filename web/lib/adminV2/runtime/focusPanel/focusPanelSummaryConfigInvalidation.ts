/**
 * Server-side invalidation for the provisioning answer's `fps:` config read (A — commit-critical
 * published Summary composition).
 *
 * The Work Unit provisioning answer carries the applicable published Focus Panel Summary doc,
 * config-cached under `fps:{orgId}`. Any write that changes WHICH variant resolves — publish,
 * rollback (publishes a new version), or deleting a published row — must bust that read so the next
 * answer carries the new composition immediately (the same doctrine as `act:`/`hdr:`/`qrl:`).
 * Scoped: only rows on the Focus Panel Summary surface bust it; other layout surfaces never touch it.
 */

import { invalidateConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";
import {
    FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
    FOCUS_PANEL_SUMMARY_SURFACE,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";

/** The slice of an entity-layout record the invalidation decision needs. */
type LayoutRecordScope = { entityType: string; surface: string };

export function invalidateFocusPanelSummaryConfigRead(orgId: string, record: LayoutRecordScope): void {
    if (
        record.entityType !== FOCUS_PANEL_SUMMARY_ENTITY_TYPE ||
        record.surface !== FOCUS_PANEL_SUMMARY_SURFACE
    ) {
        return;
    }
    invalidateConfigReadCache(`fps:${orgId}`);
}
