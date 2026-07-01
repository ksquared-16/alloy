import { ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { resolveRecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";
import { buildPersonEnrollmentActivityEntries } from "@/lib/admin/person/buildPersonEnrollmentActivityEntries";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

/** Linked family-lead enrollment pipeline rail for child drawer (opportunity-owned stages). */
export function resolvePersonDrawerChildEnrollmentProgress(record: Record<string, unknown>) {
    const mirror = (record._enrollment_mirror as PersonEnrollmentMirrorRow[]) ?? [];
    const opps = (record._enrollment_opportunities as PersonEnrollmentOpportunityRow[]) ?? [];
    const entry = buildPersonEnrollmentActivityEntries(mirror, opps)[0] ?? null;
    if (!entry?.opportunity_id) return null;

    const mirrorRow = mirror.find((row) => String(row.opportunity_id ?? "").trim() === entry.opportunity_id);
    const oppRow = opps.find((row) => String(row.opportunity_id ?? "").trim() === entry.opportunity_id);
    const statusKey =
        trimOrNull(mirrorRow?.opportunity_status_key) ??
        trimOrNull(oppRow?.status_key) ??
        null;

    const model = resolveRecordLifecycleRailModel({
        queueDefinition: ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2_BUNDLE.def,
        currentStatusKey: statusKey,
    });

    if (!model?.steps.length) return null;

    return {
        model,
        opportunityId: entry.opportunity_id,
        opportunityName: trimOrNull(entry.opportunity_name),
        statusLabel: trimOrNull(entry.status_label),
    };
}

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s.length > 0 ? s : null;
}
