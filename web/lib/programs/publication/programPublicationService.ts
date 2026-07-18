import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildConfigurationDeliveryPlan,
    normalizeConfigurationTargets,
} from "@/lib/configPublication/deliveryPlan";
import { loadConfigurationPublicationEvidence } from "@/lib/configPublication/evidenceService";
import type {
    ConfigurationDeliveryAttemptRecord,
    ConfigurationDistributionRunRecord,
    ConfigurationDistributionTargetRecord,
    ConfigurationPublicationRecord,
    ConfigurationTargetPreview,
} from "@/lib/configPublication/types";
import {
    PROGRAM_PUBLICATION_PROVIDER_KEY,
    PROGRAM_PUBLICATION_PROVIDER_VERSION,
    previewProgramDelivery,
    type ProgramConsumerContext,
} from "@/lib/programs/publication/programPublicationAdapter";
import {
    programPayloadChecksum,
    validateProgramPayload,
    type ProgramDraft,
    type ProgramPayload,
    type ProgramRevision,
} from "@/lib/programs/publication/programPublicationModel";

type DbRow = Record<string, unknown>;

export type ProgramCatalogItem = {
    id: string;
    key: string;
    lifecycleStatus: "active" | "retired";
    draft: ProgramDraft;
    revisions: ProgramRevision[];
    publications: ConfigurationPublicationRecord[];
    latestPublication: ConfigurationPublicationRecord | null;
};

export type ProgramDistributionTargetResult = ConfigurationDistributionTargetRecord;

export type ProgramDistributionRun = ConfigurationDistributionRunRecord;

export type ProgramAssignment = {
    id: string;
    programId: string;
    locationId: string;
    locationLabel: string;
    publicationId: string;
    revisionId: string;
    revisionNumber: number | null;
    consumedAt: string;
    deliveredByRunId: string;
};

export type ProgramPublicationSnapshot = {
    programs: ProgramCatalogItem[];
    locations: Array<{ id: string; label: string }>;
    runs: ProgramDistributionRun[];
    attempts: ConfigurationDeliveryAttemptRecord[];
    assignments: ProgramAssignment[];
};

function stringValue(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
    const result = stringValue(value).trim();
    return result || null;
}

function recordValue(value: unknown): Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function arrayValue(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function mapProgramPayload(program: DbRow, row: DbRow): ProgramPayload {
    return {
        programKey: stringValue(program.program_key).trim(),
        label: stringValue(row.label).trim(),
        description: nullableString(row.description),
        category: nullableString(row.category),
        eligibility: recordValue(row.eligibility),
        audience: recordValue(row.audience),
        requiredResourceType: nullableString(row.required_resource_type),
        qualificationRequirements: arrayValue(row.qualification_requirements),
        defaultPolicyRefs: recordValue(row.default_policy_refs),
        defaultCommercialPosture: recordValue(row.default_commercial_posture),
    };
}

function mapDraft(program: DbRow, row: DbRow): ProgramDraft {
    return {
        ...mapProgramPayload(program, row),
        id: stringValue(row.id),
        programId: stringValue(row.program_id),
        status: row.draft_status === "validated" ? "validated" : "draft",
        baseRevisionId: nullableString(row.base_revision_id),
        validationErrors: arrayValue(row.validation_errors).map(String),
        updatedAt: stringValue(row.updated_at),
    };
}

function mapRevision(row: DbRow): ProgramRevision {
    return {
        ...mapProgramPayload({ program_key: row.program_key }, row),
        id: stringValue(row.id),
        programId: stringValue(row.program_id),
        revisionNumber: Number(row.revision_number),
        payloadChecksum: stringValue(row.payload_checksum),
        publishedAt: stringValue(row.published_at),
    };
}

function mapPublication(row: DbRow): ConfigurationPublicationRecord {
    return {
        id: stringValue(row.id),
        orgId: stringValue(row.org_id),
        domainKey: stringValue(row.domain_key),
        subjectId: stringValue(row.subject_id),
        revision: {
            id: stringValue(row.revision_id),
            number: Number(row.revision_number),
            checksum: stringValue(row.payload_checksum),
        },
        publishedAt: stringValue(row.published_at),
    };
}

function assertNoError(error: { message: string } | null, operation: string): void {
    if (error) throw new Error(`${operation}: ${error.message}`);
}

async function loadProgramRows(supabase: SupabaseClient, orgId: string) {
    const [programsResult, draftsResult, revisionsResult] = await Promise.all([
        supabase
            .from("programs")
            .select("id, org_id, program_key, lifecycle_status, created_at")
            .eq("org_id", orgId)
            .order("program_key"),
        supabase
            .from("program_drafts")
            .select("*")
            .eq("org_id", orgId),
        supabase
            .from("program_revisions")
            .select("*")
            .eq("org_id", orgId)
            .order("revision_number", { ascending: false }),
    ]);
    assertNoError(programsResult.error, "Load Programs");
    assertNoError(draftsResult.error, "Load Program drafts");
    assertNoError(revisionsResult.error, "Load Program revisions");
    return {
        programs: (programsResult.data ?? []) as DbRow[],
        drafts: (draftsResult.data ?? []) as DbRow[],
        revisions: (revisionsResult.data ?? []) as DbRow[],
    };
}

export async function loadProgramPublicationSnapshot(
    supabase: SupabaseClient,
    orgId: string,
): Promise<ProgramPublicationSnapshot> {
    const [programRows, locationsResult, evidence] = await Promise.all([
        loadProgramRows(supabase, orgId),
        supabase
            .from("locations")
            .select("id, label")
            .eq("org_id", orgId)
            .eq("location_type", "site")
            .eq("is_active", true)
            .order("label"),
        loadConfigurationPublicationEvidence({
            supabase,
            orgId,
            domainKey: "programs",
        }),
    ]);
    assertNoError(locationsResult.error, "Load Locations");
    const locations = ((locationsResult.data ?? []) as DbRow[]).map((row) => ({
        id: stringValue(row.id),
        label: nullableString(row.label) ?? "Untitled Location",
    }));

    const programs = programRows.programs.flatMap((program): ProgramCatalogItem[] => {
        const programId = stringValue(program.id);
        const draftRow = programRows.drafts.find((row) => row.program_id === programId);
        if (!draftRow) return [];
        const revisions = programRows.revisions
            .filter((row) => row.program_id === programId)
            .map(mapRevision);
        const publications = evidence.publications.filter(
            (publication) => publication.subjectId === programId,
        );
        return [{
            id: programId,
            key: stringValue(program.program_key),
            lifecycleStatus: program.lifecycle_status === "retired" ? "retired" : "active",
            draft: mapDraft(program, draftRow),
            revisions,
            publications,
            latestPublication: publications[0] ?? null,
        }];
    });

    const revisionNumberById = new Map(
        programs.flatMap((program) =>
            program.revisions.map((revision) => [revision.id, revision.revisionNumber] as const),
        ),
    );
    const locationLabelById = new Map(locations.map((location) => [location.id, location.label]));
    const assignments: ProgramAssignment[] = evidence.consumptions.map((consumption) => ({
        id: consumption.id,
        programId: consumption.subjectId,
        locationId: consumption.locationId,
        locationLabel: locationLabelById.get(consumption.locationId) ?? "Location",
        publicationId: consumption.publicationId,
        revisionId: consumption.revisionId,
        revisionNumber: revisionNumberById.get(consumption.revisionId) ?? null,
        consumedAt: consumption.consumedAt,
        deliveredByRunId: consumption.deliveredByRunId,
    }));

    return {
        programs,
        locations,
        runs: evidence.runs,
        attempts: evidence.attempts,
        assignments,
    };
}

export async function createProgramDraft(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    key: string;
    label: string;
}): Promise<string> {
    const key = input.key.trim();
    const label = input.label.trim();
    const errors = validateProgramPayload({
        programKey: key,
        label,
        description: null,
        category: null,
        eligibility: {},
        audience: {},
        requiredResourceType: null,
        qualificationRequirements: [],
        defaultPolicyRefs: {},
        defaultCommercialPosture: {},
    });
    if (errors.length) throw new Error(errors.join(" "));

    const { data: program, error: programError } = await input.supabase
        .from("programs")
        .insert({
            org_id: input.orgId,
            program_key: key,
            created_by: input.actorUserId,
        })
        .select("id")
        .single();
    assertNoError(programError, "Create Program");
    const programId = stringValue((program as DbRow).id);

    const { error: draftError } = await input.supabase.from("program_drafts").insert({
        org_id: input.orgId,
        program_id: programId,
        label,
        created_by: input.actorUserId,
        updated_by: input.actorUserId,
    });
    if (draftError) {
        await input.supabase
            .from("programs")
            .delete()
            .eq("org_id", input.orgId)
            .eq("id", programId);
        throw new Error(`Create Program draft: ${draftError.message}`);
    }
    return programId;
}

const EDITABLE_DRAFT_FIELDS = new Set([
    "label",
    "description",
    "category",
    "eligibility",
    "audience",
    "required_resource_type",
    "qualification_requirements",
    "default_policy_refs",
    "default_commercial_posture",
]);

export async function updateProgramDraft(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    programId: string;
    patch: Record<string, unknown>;
}): Promise<void> {
    const patch = Object.fromEntries(
        Object.entries(input.patch).filter(([key]) => EDITABLE_DRAFT_FIELDS.has(key)),
    );
    if (Object.keys(patch).length === 0) throw new Error("No editable Program fields were supplied.");
    const { error } = await input.supabase
        .from("program_drafts")
        .update({
            ...patch,
            draft_status: "draft",
            validation_errors: [],
            validated_at: null,
            validated_by: null,
            updated_by: input.actorUserId,
            updated_at: new Date().toISOString(),
        })
        .eq("org_id", input.orgId)
        .eq("program_id", input.programId);
    assertNoError(error, "Update Program draft");
}

async function loadDraftPayload(
    supabase: SupabaseClient,
    orgId: string,
    programId: string,
): Promise<{ draftRow: DbRow; payload: ProgramPayload }> {
    const [programResult, draftResult] = await Promise.all([
        supabase
            .from("programs")
            .select("id, program_key")
            .eq("org_id", orgId)
            .eq("id", programId)
            .single(),
        supabase
            .from("program_drafts")
            .select("*")
            .eq("org_id", orgId)
            .eq("program_id", programId)
            .single(),
    ]);
    assertNoError(programResult.error, "Load Program");
    assertNoError(draftResult.error, "Load Program draft");
    const program = programResult.data as DbRow;
    const draftRow = draftResult.data as DbRow;
    return { draftRow, payload: mapProgramPayload(program, draftRow) };
}

export async function validateProgramDraft(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    programId: string;
}): Promise<string[]> {
    const { draftRow, payload } = await loadDraftPayload(
        input.supabase,
        input.orgId,
        input.programId,
    );
    const errors = validateProgramPayload(payload);
    const { error } = await input.supabase
        .from("program_drafts")
        .update({
            draft_status: errors.length === 0 ? "validated" : "draft",
            validation_errors: errors,
            validated_at: errors.length === 0 ? new Date().toISOString() : null,
            validated_by: errors.length === 0 ? input.actorUserId : null,
            updated_by: input.actorUserId,
            updated_at: new Date().toISOString(),
        })
        .eq("org_id", input.orgId)
        .eq("id", stringValue(draftRow.id));
    assertNoError(error, "Validate Program draft");
    return errors;
}

export async function publishProgramDraft(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    programId: string;
}): Promise<Record<string, unknown>> {
    const { payload } = await loadDraftPayload(input.supabase, input.orgId, input.programId);
    const errors = validateProgramPayload(payload);
    if (errors.length) throw new Error(errors.join(" "));
    const { data, error } = await input.supabase.rpc("publish_program_revision_v1", {
        p_org_id: input.orgId,
        p_program_id: input.programId,
        p_actor_user_id: input.actorUserId,
        p_payload_checksum: programPayloadChecksum(payload),
    });
    assertNoError(error, "Publish Program");
    return recordValue(data);
}

async function loadPublicationAndRevision(input: {
    supabase: SupabaseClient;
    orgId: string;
    publicationId: string;
}): Promise<{ publication: ConfigurationPublicationRecord; revision: ProgramRevision }> {
    const { data: publicationRow, error: publicationError } = await input.supabase
        .from("configuration_publications")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("domain_key", "programs")
        .eq("id", input.publicationId)
        .single();
    assertNoError(publicationError, "Load Program publication");
    const publication = mapPublication(publicationRow as DbRow);
    const { data: revisionRow, error: revisionError } = await input.supabase
        .from("program_revisions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("id", publication.revision.id)
        .single();
    assertNoError(revisionError, "Load Program revision");
    return { publication, revision: mapRevision(revisionRow as DbRow) };
}

async function resolveProgramTargetContexts(input: {
    supabase: SupabaseClient;
    orgId: string;
    revision: ProgramRevision;
    targetIds: readonly string[];
    allowedSiteLocationIds: string[] | null;
}): Promise<Array<{
    target: { locationId: string; locationLabel: string };
    context: ProgramConsumerContext;
}>> {
    const uniqueIds = [...new Set(input.targetIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) throw new Error("Choose at least one Location.");
    if (
        input.allowedSiteLocationIds != null
        && uniqueIds.some((id) => !input.allowedSiteLocationIds!.includes(id))
    ) {
        throw new Error("One or more selected Locations are outside your allowed scope.");
    }

    const [locationsResult, categoriesResult, roomsResult] = await Promise.all([
        input.supabase
            .from("locations")
            .select("id, label")
            .eq("org_id", input.orgId)
            .eq("location_type", "site")
            .eq("is_active", true)
            .in("id", uniqueIds),
        input.supabase
            .from("location_program_categories")
            .select(
                "id, location_id, key, is_active, metadata, program_id, program_revision_id, local_description_override, local_authorization_evidence",
            )
            .eq("org_id", input.orgId)
            .in("location_id", uniqueIds),
        input.supabase
            .from("locations")
            .select("id, parent_location_id, metadata")
            .eq("org_id", input.orgId)
            .eq("location_type", "unit")
            .in("parent_location_id", uniqueIds),
    ]);
    assertNoError(locationsResult.error, "Resolve eligible Locations");
    assertNoError(categoriesResult.error, "Resolve Location Program offerings");
    assertNoError(roomsResult.error, "Resolve delivery-resource assignments");
    const locations = (locationsResult.data ?? []) as DbRow[];
    if (locations.length !== uniqueIds.length) {
        throw new Error("One or more selected Locations are inactive, missing, or ineligible.");
    }
    const categories = (categoriesResult.data ?? []) as DbRow[];
    const rooms = (roomsResult.data ?? []) as DbRow[];

    return locations.map((location) => {
        const locationId = stringValue(location.id);
        const category = categories.find(
            (row) =>
                row.location_id === locationId
                && (
                    row.program_id === input.revision.programId
                    || stringValue(row.key) === input.revision.programKey
                ),
        );
        const protectedResourceAssignmentCount = rooms.filter(
            (room) =>
                room.parent_location_id === locationId
                && nullableString(recordValue(room.metadata).category) === input.revision.programKey,
        ).length;
        return {
            target: {
                locationId,
                locationLabel: nullableString(location.label) ?? "Untitled Location",
            },
            context: {
                currentRevisionId: category ? nullableString(category.program_revision_id) : null,
                offeringExists: category != null,
                offered: category ? category.is_active !== false : null,
                localDescriptionOverride: category
                    ? nullableString(category.local_description_override)
                    : null,
                localAuthorizationEvidence: category
                    ? nullableString(category.local_authorization_evidence)
                    : null,
                protectedResourceAssignmentCount,
            },
        };
    });
}

export async function previewProgramDistribution(input: {
    supabase: SupabaseClient;
    orgId: string;
    publicationId: string;
    targetIds: readonly string[];
    allowedSiteLocationIds: string[] | null;
}): Promise<ConfigurationTargetPreview[]> {
    const { revision } = await loadPublicationAndRevision(input);
    const targets = await resolveProgramTargetContexts({
        ...input,
        revision,
    });
    return targets.map(({ target, context }) =>
        previewProgramDelivery({
            revision,
            locationId: target.locationId,
            locationLabel: target.locationLabel,
            context,
        }),
    );
}

async function executeProgramRunTargets(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    runId: string;
    locationIds: readonly string[];
}): Promise<Record<string, unknown>> {
    for (const locationId of input.locationIds) {
        const { error } = await input.supabase.rpc("assign_program_publication_target_v1", {
            p_org_id: input.orgId,
            p_run_id: input.runId,
            p_location_id: locationId,
            p_actor_user_id: input.actorUserId,
        });
        if (error) {
            const operatorMessage =
                error.message.includes("location_not_eligible")
                    ? "This Location is no longer eligible."
                    : error.message.includes("published_program_revision_required")
                        ? "The published Program revision is unavailable."
                        : "Delivery could not be completed. Retry is safe.";
            const { error: failureError } = await input.supabase.rpc(
                "record_configuration_delivery_failure_v1",
                {
                    p_org_id: input.orgId,
                    p_run_id: input.runId,
                    p_location_id: locationId,
                    p_actor_user_id: input.actorUserId,
                    p_error_code: "program_delivery_failed",
                    p_error_message: operatorMessage,
                },
            );
            assertNoError(failureError, "Record delivery failure");
        }
    }

    const { data, error } = await input.supabase.rpc(
        "finalize_configuration_distribution_run_v1",
        {
            p_org_id: input.orgId,
            p_run_id: input.runId,
        },
    );
    assertNoError(error, "Finalize distribution");
    return recordValue(data);
}

export async function assignProgramDistribution(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    publicationId: string;
    targetIds: readonly string[];
    allowedSiteLocationIds: string[] | null;
}): Promise<Record<string, unknown>> {
    const { publication, revision } = await loadPublicationAndRevision(input);
    const contexts = await resolveProgramTargetContexts({
        ...input,
        revision,
    });
    const targets = normalizeConfigurationTargets(contexts.map(({ target }) => target));
    const plan = buildConfigurationDeliveryPlan({
        publication,
        providerKey: PROGRAM_PUBLICATION_PROVIDER_KEY,
        providerVersion: PROGRAM_PUBLICATION_PROVIDER_VERSION,
        targets,
    });

    const { data: insertedRun, error: insertError } = await input.supabase
        .from("configuration_distribution_runs")
        .insert({
            org_id: input.orgId,
            publication_id: publication.id,
            domain_key: "programs",
            provider_key: plan.providerKey,
            provider_version: plan.providerVersion,
            idempotency_key: plan.idempotencyKey,
            target_set_checksum: plan.targetSetChecksum,
            status: "running",
            created_by: input.actorUserId,
            started_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

    let runId = nullableString((insertedRun as DbRow | null)?.id);
    if (insertError) {
        if (!insertError.message.toLowerCase().includes("duplicate")) {
            throw new Error(`Create distribution run: ${insertError.message}`);
        }
        const { data: existingRun, error: existingError } = await input.supabase
            .from("configuration_distribution_runs")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("idempotency_key", plan.idempotencyKey)
            .single();
        assertNoError(existingError, "Reload distribution run");
        runId = stringValue((existingRun as DbRow).id);
    }
    if (!runId) throw new Error("Distribution run was not persisted.");

    const { error: targetError } = await input.supabase
        .from("configuration_distribution_targets")
        .upsert(
            targets.map((target) => ({
                org_id: input.orgId,
                run_id: runId,
                location_id: target.locationId,
                status: "pending",
            })),
            { onConflict: "run_id,location_id", ignoreDuplicates: true },
        );
    assertNoError(targetError, "Persist distribution targets");

    const { data: pendingRows, error: pendingError } = await input.supabase
        .from("configuration_distribution_targets")
        .select("location_id")
        .eq("org_id", input.orgId)
        .eq("run_id", runId)
        .in("status", ["pending", "failed"]);
    assertNoError(pendingError, "Load retryable delivery targets");

    return executeProgramRunTargets({
        ...input,
        runId,
        locationIds: ((pendingRows ?? []) as DbRow[]).map((row) => stringValue(row.location_id)),
    });
}

export async function retryProgramDistribution(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    runId: string;
    allowedSiteLocationIds: string[] | null;
}): Promise<Record<string, unknown>> {
    const { data: run, error: runError } = await input.supabase
        .from("configuration_distribution_runs")
        .select("id, domain_key, provider_key")
        .eq("org_id", input.orgId)
        .eq("id", input.runId)
        .single();
    assertNoError(runError, "Load distribution run");
    const runRow = run as DbRow;
    if (
        runRow.domain_key !== "programs"
        || runRow.provider_key !== PROGRAM_PUBLICATION_PROVIDER_KEY
    ) {
        throw new Error("This delivery run does not belong to Programs.");
    }

    let failedQuery = input.supabase
        .from("configuration_distribution_targets")
        .select("location_id")
        .eq("org_id", input.orgId)
        .eq("run_id", input.runId)
        .eq("status", "failed");
    if (input.allowedSiteLocationIds != null) {
        failedQuery = failedQuery.in("location_id", input.allowedSiteLocationIds);
    }
    const { data: failedRows, error: failedError } = await failedQuery;
    assertNoError(failedError, "Load failed delivery targets");
    const locationIds = ((failedRows ?? []) as DbRow[]).map((row) =>
        stringValue(row.location_id),
    );
    if (locationIds.length === 0) throw new Error("There are no failed deliveries to retry.");

    return executeProgramRunTargets({
        ...input,
        locationIds,
    });
}
