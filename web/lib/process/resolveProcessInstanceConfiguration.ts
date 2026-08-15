/**
 * D-96 — THE one owner of "which Business Process configuration governs this running journey?"
 *
 * ## The branch this module exists to contain
 *
 * ```
 *   process_instance.business_process_revision_id
 *        │ non-null  ──►  business_process_revisions.payload   (immutable, self-contained per D-97)
 *        │ null      ──►  departments.metadata.lifecycle_builder_v1   (live projection, compat only)
 * ```
 *
 * That branch is written HERE and nowhere else. If a second consumer reimplemented it, the two
 * would eventually disagree about which configuration governs the same instance, and the operator
 * would see one answer in Current Work and a different one at commit — the same class of defect
 * D-92 closed for requirements.
 *
 * ## Why the pin is a reference and not a copy
 *
 * `business_process_revisions` is immutable (UPDATE and DELETE are blocked) and, since D-97, every
 * stage in a published payload carries an explicit `requirements_v1`. So a revision answers every
 * configuration question on its own — stage list, operating plan, action catalog, canonical
 * requirements — with no department metadata anywhere in the path. Copying configuration onto the
 * instance would create a second authority that could drift from the artifact it came from.
 *
 * **A pinned instance never reads live legacy requirement metadata.** Not as a fallback, not for
 * one section. That is the whole guarantee, and it is why requirements-only pinning is forbidden:
 * pinning the requirement set while the stage list and action catalog still came from live metadata
 * would be one journey governed by two configurations that no publish keeps in step.
 *
 * ## Unpinned is a real state, not a gap
 *
 * Instances that predate the pin stay NULL and resolve from the live projection, exactly as they
 * did before. No backfill: which revision governed a journey that started before revisions existed
 * is not derivable, and writing a plausible id would fabricate a governance record.
 *
 * ## What this does NOT own
 *
 * Class-B surfaces — builder authoring, form coverage, latest-config discovery — must keep showing
 * CURRENT configuration and must not call this. An operator editing the Business Process is asking
 * "what does this configuration say now?", not "what governs some particular child?".
 *
 * @see supabase/migrations/20260816120000_process_instances_business_process_revision_pin.sql
 * @see lib/businessProcesses/configuration/normalizePublishedStageRequirements.ts — D-97
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchDepartmentMetadataForActivity } from "@/lib/admin/loadOpportunityActivitySignal";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
    parseLifecycleBuilderV1,
    type LifecycleBuilderProcessRecord,
    type LifecycleBuilderStageRecord,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { cachedConfigRead } from "@/lib/runtime/provisioning/configReadCache";

/** The minimum an instance must carry for its configuration to be resolvable. */
export type ProcessInstanceConfigurationSubject = {
    readonly id?: string | null;
    readonly process_key: string;
    readonly stage_key?: string | null;
    readonly business_process_revision_id?: string | null;
};

export type ProcessInstanceConfigurationSource = "pinned_revision" | "live_projection";

export type ProcessInstanceConfiguration = {
    /** Null when the instance is unpinned — the compatibility path, never a failure. */
    readonly revisionId: string | null;
    readonly source: ProcessInstanceConfigurationSource;
    /** The raw governing payload, as stored. Null when nothing is configured at all. */
    readonly payload: Record<string, unknown> | null;
    readonly builder: LifecycleBuilderV1 | null;
    /** The process within the governing payload that matches the instance's `process_key`. */
    readonly process: LifecycleBuilderProcessRecord | null;
    /** The instance's current stage AS THE GOVERNING REVISION defines it. Null when it has none. */
    readonly stage: LifecycleBuilderStageRecord | null;
};

const EMPTY: ProcessInstanceConfiguration = {
    revisionId: null,
    source: "live_projection",
    payload: null,
    builder: null,
    process: null,
    stage: null,
};

/**
 * A revision payload, memoised per tenant.
 *
 * Safe to cache without a TTL concern: a revision row is immutable by trigger, so the value can
 * never go stale. The `dept:` prefix keeps it inside the tenant scope
 * `invalidateTenantConfigReadCache` already clears, so a publish cannot leave a stranded entry
 * under some prefix nothing busts.
 */
async function loadRevisionPayload(
    supabase: SupabaseClient,
    orgId: string,
    revisionId: string,
): Promise<Record<string, unknown> | null> {
    return cachedConfigRead(`dept:${orgId}:bprev:${revisionId}`, async () => {
        const { data, error } = await supabase
            .from("business_process_revisions")
            .select("payload")
            .eq("id", revisionId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        const payload = (data as { payload?: unknown } | null)?.payload;
        return payload != null && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : null;
    });
}

function selectProcessAndStage(
    builder: LifecycleBuilderV1 | null,
    processKey: string,
    stageKey: string | null,
): { process: LifecycleBuilderProcessRecord | null; stage: LifecycleBuilderStageRecord | null } {
    if (!builder) return { process: null, stage: null };
    const process = builder.processes.find((p) => p.key === processKey) ?? null;
    if (!process || !stageKey) return { process, stage: null };
    return { process, stage: process.stages.find((s) => s.key === stageKey) ?? null };
}

/**
 * Resolve the governing configuration for one running process instance.
 *
 * `departmentMetadata` is the COMPATIBILITY input and is used only on the unpinned path. Callers on
 * the Class-A runtime path already hold it, so passing it avoids a second read; `departmentId` is
 * the fallback for callers that do not. Neither is consulted when the instance is pinned — a pinned
 * instance must not be able to see live configuration even by accident, which is why the pinned
 * branch returns before either is touched.
 */
export async function resolveProcessInstanceConfiguration(input: {
    readonly supabase: SupabaseClient;
    readonly orgId: string;
    readonly processInstance: ProcessInstanceConfigurationSubject;
    /** Live projection input for the UNPINNED path only. */
    readonly departmentMetadata?: unknown;
    /** Read only when `departmentMetadata` is absent and the instance is unpinned. */
    readonly departmentId?: string | null;
}): Promise<ProcessInstanceConfiguration> {
    const processKey = (input.processInstance.process_key ?? "").trim();
    const stageKey = (input.processInstance.stage_key ?? "").trim() || null;
    const revisionId = (input.processInstance.business_process_revision_id ?? "").trim() || null;

    if (revisionId) {
        const payload = await loadRevisionPayload(input.supabase, input.orgId, revisionId);
        // A pinned revision that cannot be read is NOT downgraded to live configuration. The pin is
        // FK-backed and the row is undeletable, so an unreadable payload means something is wrong
        // with the artifact — and quietly serving live configuration would hide that behind a
        // journey silently changing which rules govern it, the exact failure D-96 prevents.
        const builder = payload ? parseLifecycleBuilderV1(payload) : null;
        return {
            revisionId,
            source: "pinned_revision",
            payload,
            builder,
            ...selectProcessAndStage(builder, processKey, stageKey),
        };
    }

    const metadata =
        input.departmentMetadata !== undefined
            ? input.departmentMetadata
            : await fetchDepartmentMetadataForActivity(input.supabase, input.orgId, input.departmentId);
    if (metadata == null) return EMPTY;

    const builderPayload =
        metadata != null && typeof metadata === "object" && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)[LIFECYCLE_BUILDER_METADATA_KEY]
            : null;
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    return {
        revisionId: null,
        source: "live_projection",
        payload:
            builderPayload != null && typeof builderPayload === "object" && !Array.isArray(builderPayload)
                ? (builderPayload as Record<string, unknown>)
                : null,
        builder,
        ...selectProcessAndStage(builder, processKey, stageKey),
    };
}

/**
 * Does the governing configuration state this stage's requirements ITSELF?
 *
 * True for any stage of a revision published under D-97, and for a stage authored canonically
 * before it. False means the answer still depends on live department metadata — which is the honest
 * state of a revision published BEFORE D-97 normalization existed, since a published revision is
 * immutable and back-filling one would be rewriting history.
 *
 * Exposed so a consumer can tell "governed by the revision" from "governed by the revision for
 * everything except its requirements" rather than assuming the stronger claim.
 */
export function governingStageStatesItsOwnRequirements(
    configuration: ProcessInstanceConfiguration,
): boolean {
    return configuration.stage?.requirements_v1 !== undefined;
}
