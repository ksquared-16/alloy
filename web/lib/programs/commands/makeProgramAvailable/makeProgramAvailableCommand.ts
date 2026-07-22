import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { partitionMakeProgramAvailableTargets } from "@/lib/programs/commands/makeProgramAvailable/makeProgramAvailableEligibility";
import {
    buildMakeProgramAvailableRefreshTargets,
    MAKE_PROGRAM_AVAILABLE_COMMAND_KEY,
    type MakeProgramAvailableCommandInput,
    type MakeProgramAvailableCommitResult,
    type MakeProgramAvailablePreview,
} from "@/lib/programs/commands/makeProgramAvailable/makeProgramAvailableModel";
import {
    assignProgramDistribution,
    createProgramDraft,
    loadLatestProgramPublication,
    publishProgramDraft,
    resolveProgramTargetsSoft,
    updateProgramDraft,
    validateProgramDraft,
} from "@/lib/programs/publication/programPublicationService";
import type { ConfigurationPublicationRecord } from "@/lib/configPublication/types";
import type { ProgramRevision } from "@/lib/programs/publication/programPublicationModel";

type DbRow = Record<string, unknown>;

function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function requiredIdempotencyKey(value: string): string {
    const key = value.trim();
    if (key.length < 8) throw new Error("Idempotency key is required (min 8 characters).");
    if (key.length > 128) throw new Error("Idempotency key is too long.");
    return key;
}

function normalizeLocationIds(ids: readonly string[]): string[] {
    return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

async function loadProgramIdentity(input: {
    supabase: SupabaseClient;
    orgId: string;
    programId: string;
}): Promise<{ key: string; label: string; lifecycleStatus: string }> {
    const { data: program, error: programError } = await input.supabase
        .from("programs")
        .select("id, program_key, lifecycle_status")
        .eq("org_id", input.orgId)
        .eq("id", input.programId)
        .maybeSingle();
    if (programError) throw new Error(`Load Program: ${programError.message}`);
    if (!program) throw new Error("Program was not found in this Organization.");
    const row = program as DbRow;
    const { data: draft, error: draftError } = await input.supabase
        .from("program_drafts")
        .select("label")
        .eq("org_id", input.orgId)
        .eq("program_id", input.programId)
        .maybeSingle();
    if (draftError) throw new Error(`Load Program draft: ${draftError.message}`);
    const label =
        (typeof (draft as DbRow | null)?.label === "string"
            ? String((draft as DbRow).label).trim()
            : "")
        || String(row.program_key);
    return {
        key: String(row.program_key),
        label,
        lifecycleStatus: String(row.lifecycle_status ?? "active"),
    };
}

async function resolvePublishedRevision(input: {
    supabase: SupabaseClient;
    orgId: string;
    program: MakeProgramAvailableCommandInput["program"];
}): Promise<
    | {
          ok: true;
          programId: string;
          label: string;
          key: string;
          lifecycleState: string;
          publication: ConfigurationPublicationRecord;
          revision: ProgramRevision;
          willPublish: false;
      }
    | {
          ok: false;
          programId: string | null;
          label: string;
          key: string | null;
          lifecycleState: string;
          publicationRequired: true;
          willPublish: boolean;
          reason: string;
      }
> {
    if (input.program.kind === "new") {
        const label = input.program.input.label.trim();
        const key = input.program.input.key.trim();
        return {
            ok: false,
            programId: null,
            label,
            key,
            lifecycleState: "draft",
            publicationRequired: true,
            willPublish: true,
            reason: "Create, validate, and publish will run before Locations are associated.",
        };
    }

    const identity = await loadProgramIdentity({
        supabase: input.supabase,
        orgId: input.orgId,
        programId: input.program.programId,
    });

    if (identity.lifecycleStatus === "retired") {
        return {
            ok: false,
            programId: input.program.programId,
            label: identity.label,
            key: identity.key,
            lifecycleState: "retired",
            publicationRequired: true,
            willPublish: false,
            reason: "A retired Program cannot be made available at Locations.",
        };
    }

    let published = await loadLatestProgramPublication({
        supabase: input.supabase,
        orgId: input.orgId,
        programId: input.program.programId,
    });

    if (input.program.publicationId) {
        const { data: publicationRow, error } = await input.supabase
            .from("configuration_publications")
            .select("id, subject_id")
            .eq("org_id", input.orgId)
            .eq("domain_key", "programs")
            .eq("id", input.program.publicationId)
            .maybeSingle();
        if (error) throw new Error(`Load Program publication: ${error.message}`);
        if (!publicationRow) {
            return {
                ok: false,
                programId: input.program.programId,
                label: identity.label,
                key: identity.key,
                lifecycleState: identity.lifecycleStatus,
                publicationRequired: true,
                willPublish: false,
                reason: "The requested publication was not found.",
            };
        }
        if (String((publicationRow as DbRow).subject_id) !== input.program.programId) {
            return {
                ok: false,
                programId: input.program.programId,
                label: identity.label,
                key: identity.key,
                lifecycleState: identity.lifecycleStatus,
                publicationRequired: true,
                willPublish: false,
                reason: "Publication does not belong to this Program.",
            };
        }
        // Explicit publication must still resolve to a loadable revision for this org/program.
        if (!published || published.publication.id !== input.program.publicationId) {
            // Fall back to latest when the requested id is not the latest — still require some publication.
            if (!published) {
                return {
                    ok: false,
                    programId: input.program.programId,
                    label: identity.label,
                    key: identity.key,
                    lifecycleState: identity.lifecycleStatus,
                    publicationRequired: true,
                    willPublish: false,
                    reason: "Only published Program revisions may be made available at Locations.",
                };
            }
        }
    }

    if (!published) {
        return {
            ok: false,
            programId: input.program.programId,
            label: identity.label,
            key: identity.key,
            lifecycleState: "draft",
            publicationRequired: true,
            willPublish: false,
            reason: "Only published Program revisions may be made available at Locations.",
        };
    }

    return {
        ok: true,
        programId: input.program.programId,
        label: published.revision.label || identity.label,
        key: published.revision.programKey || identity.key,
        lifecycleState: "published",
        publication: published.publication,
        revision: published.revision,
        willPublish: false,
    };
}

function buildPreviewFromPartition(input: {
    program: MakeProgramAvailablePreview["program"];
    requestedLocationIds: string[];
    partition: ReturnType<typeof partitionMakeProgramAvailableTargets>;
    plannedOperations: string[];
}): MakeProgramAvailablePreview {
    const eligible =
        input.partition.newAssociations.length + input.partition.alreadyAvailable.length;
    return {
        program: input.program,
        requestedLocationIds: input.requestedLocationIds,
        newAssociations: input.partition.newAssociations,
        alreadyAvailable: input.partition.alreadyAvailable,
        blocked: input.partition.blocked,
        locallyConfigured: input.partition.locallyConfigured,
        retainedLocalConfiguration: input.partition.retainedLocalConfiguration,
        plannedOperations: input.plannedOperations,
        impact: {
            requested: input.requestedLocationIds.length,
            eligible,
            unchanged: input.partition.alreadyAvailable.length,
            blocked: input.partition.blocked.length,
        },
    };
}

export async function previewMakeProgramAvailable(
    supabase: SupabaseClient,
    input: MakeProgramAvailableCommandInput,
): Promise<MakeProgramAvailablePreview> {
    requiredIdempotencyKey(input.idempotencyKey);
    const requestedLocationIds = normalizeLocationIds(input.locationIds);
    if (requestedLocationIds.length === 0) throw new Error("Choose at least one Location.");

    const resolved = await resolvePublishedRevision({
        supabase,
        orgId: input.orgId,
        program: input.program,
    });

    if (!resolved.ok) {
        const plannedOperations =
            resolved.willPublish
                ? [
                      "create_draft",
                      "validate_draft",
                      "publish",
                      "assign_selected_locations",
                  ]
                : [];
        // Without a published revision we cannot evaluate Location associations yet.
        // Still soft-check Location existence/scope for early blockers.
        const locationBlocks: MakeProgramAvailablePreview["blocked"] = [];
        if (resolved.willPublish || resolved.programId) {
            const { data: locations, error } = await supabase
                .from("locations")
                .select("id, label, is_active, location_type")
                .eq("org_id", input.orgId)
                .in("id", requestedLocationIds);
            if (error) throw new Error(`Resolve Locations: ${error.message}`);
            const byId = new Map(
                ((locations ?? []) as DbRow[]).map((row) => [String(row.id), row]),
            );
            for (const locationId of requestedLocationIds) {
                const row = byId.get(locationId);
                if (!row) {
                    locationBlocks.push({
                        locationId,
                        locationLabel: "Unknown Location",
                        code: "location_not_found",
                        reason: "Location was not found in this Organization.",
                    });
                    continue;
                }
                if (String(row.location_type) !== "site") {
                    locationBlocks.push({
                        locationId,
                        locationLabel: String(row.label ?? "Location"),
                        code: "location_not_site",
                        reason: "Only site Locations can receive Program availability.",
                    });
                    continue;
                }
                if (row.is_active === false) {
                    locationBlocks.push({
                        locationId,
                        locationLabel: String(row.label ?? "Location"),
                        code: "location_inactive",
                        reason: "This Location is inactive.",
                    });
                    continue;
                }
                if (
                    input.allowedSiteLocationIds != null
                    && !input.allowedSiteLocationIds.includes(locationId)
                ) {
                    locationBlocks.push({
                        locationId,
                        locationLabel: String(row.label ?? "Location"),
                        code: "location_out_of_scope",
                        reason: "This Location is outside your allowed site scope.",
                    });
                }
            }
        }

        return {
            program: {
                id: resolved.programId,
                label: resolved.label,
                key: resolved.key,
                lifecycleState: resolved.lifecycleState,
                publicationRequired: true,
                publicationId: null,
                revisionId: null,
                willPublish: resolved.willPublish,
            },
            requestedLocationIds,
            newAssociations: [],
            alreadyAvailable: [],
            blocked: [
                {
                    locationId: "*",
                    locationLabel: "Program",
                    code: "publication_required",
                    reason: resolved.reason,
                },
                ...locationBlocks,
            ],
            locallyConfigured: [],
            retainedLocalConfiguration: [],
            plannedOperations,
            impact: {
                requested: requestedLocationIds.length,
                eligible: 0,
                unchanged: 0,
                blocked: 1 + locationBlocks.length,
            },
        };
    }

    const soft = await resolveProgramTargetsSoft({
        supabase,
        orgId: input.orgId,
        revision: resolved.revision,
        targetIds: requestedLocationIds,
        allowedSiteLocationIds: input.allowedSiteLocationIds,
    });
    const partition = partitionMakeProgramAvailableTargets({
        resolved: soft,
        nextRevisionId: resolved.revision.id,
    });

    return buildPreviewFromPartition({
        program: {
            id: resolved.programId,
            label: resolved.label,
            key: resolved.key,
            lifecycleState: resolved.lifecycleState,
            publicationRequired: false,
            publicationId: resolved.publication.id,
            revisionId: resolved.revision.id,
            willPublish: false,
        },
        requestedLocationIds,
        partition,
        plannedOperations: [
            partition.newAssociations.length > 0
                ? `associate_${partition.newAssociations.length}_locations`
                : "no_new_associations",
            partition.alreadyAvailable.length > 0
                ? `retain_${partition.alreadyAvailable.length}_existing`
                : "no_existing_associations",
            "preserve_local_configuration",
            "write_distribution_audit",
        ],
    });
}

type StoredOperation = {
    id: string;
    program_id: string | null;
    publication_id: string | null;
    revision_id: string | null;
    status: string;
    result: MakeProgramAvailableCommitResult | null;
};

async function loadIdempotentOperation(input: {
    supabase: SupabaseClient;
    orgId: string;
    idempotencyKey: string;
}): Promise<StoredOperation | null> {
    const { data, error } = await input.supabase
        .from("configuration_command_operations")
        .select("id, program_id, publication_id, revision_id, status, result")
        .eq("org_id", input.orgId)
        .eq("command_key", MAKE_PROGRAM_AVAILABLE_COMMAND_KEY)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
    if (error) {
        const message = error.message.toLowerCase();
        if (
            message.includes("configuration_command_operations")
            || message.includes("does not exist")
            || message.includes("schema cache")
        ) {
            return null;
        }
        throw new Error(`Load command operation: ${error.message}`);
    }
    if (!data) return null;
    const row = data as DbRow;
    return {
        id: String(row.id),
        program_id: row.program_id == null ? null : String(row.program_id),
        publication_id: row.publication_id == null ? null : String(row.publication_id),
        revision_id: row.revision_id == null ? null : String(row.revision_id),
        status: String(row.status),
        result:
            row.result != null && typeof row.result === "object"
                ? (row.result as MakeProgramAvailableCommitResult)
                : null,
    };
}

async function upsertOperationStart(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    entryPoint: string;
}): Promise<{ id: string; replay: StoredOperation | null; durable: boolean }> {
    const existing = await loadIdempotentOperation({
        supabase: input.supabase,
        orgId: input.orgId,
        idempotencyKey: input.idempotencyKey,
    });
    if (existing?.status === "committed" || existing?.status === "partial" || existing?.status === "blocked") {
        return { id: existing.id, replay: existing, durable: true };
    }
    if (existing) {
        return { id: existing.id, replay: null, durable: true };
    }

    const { data, error } = await input.supabase
        .from("configuration_command_operations")
        .insert({
            org_id: input.orgId,
            command_key: MAKE_PROGRAM_AVAILABLE_COMMAND_KEY,
            idempotency_key: input.idempotencyKey,
            status: "running",
            request_fingerprint: input.requestFingerprint,
            entry_point: input.entryPoint,
            created_by: input.actorUserId,
        })
        .select("id")
        .maybeSingle();

    if (error) {
        const message = error.message.toLowerCase();
        if (
            message.includes("configuration_command_operations")
            || message.includes("does not exist")
            || message.includes("schema cache")
        ) {
            // Migration not applied yet — proceed without durable compound idempotency.
            return {
                id: `ephemeral:${input.idempotencyKey}`,
                replay: null,
                durable: false,
            };
        }
        if (message.includes("duplicate")) {
            const again = await loadIdempotentOperation({
                supabase: input.supabase,
                orgId: input.orgId,
                idempotencyKey: input.idempotencyKey,
            });
            if (again) {
                if (
                    again.status === "committed"
                    || again.status === "partial"
                    || again.status === "blocked"
                ) {
                    return { id: again.id, replay: again, durable: true };
                }
                return { id: again.id, replay: null, durable: true };
            }
        }
        throw new Error(`Create command operation: ${error.message}`);
    }
    return { id: String((data as DbRow).id), replay: null, durable: true };
}

async function finalizeOperation(input: {
    supabase: SupabaseClient;
    orgId: string;
    operationId: string;
    result: MakeProgramAvailableCommitResult;
    durable: boolean;
}): Promise<void> {
    if (!input.durable || input.operationId.startsWith("ephemeral:")) return;
    const { error } = await input.supabase
        .from("configuration_command_operations")
        .update({
            status: input.result.status,
            program_id: input.result.programId,
            publication_id: input.result.publicationId,
            revision_id: input.result.revisionId,
            distribution_run_id: input.result.distributionRunId,
            result: input.result,
            completed_at: new Date().toISOString(),
        })
        .eq("org_id", input.orgId)
        .eq("id", input.operationId);
    if (error) throw new Error(`Finalize command operation: ${error.message}`);
}

async function writeGroupedAuditEvent(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    operationId: string;
    result: MakeProgramAvailableCommitResult;
    entryPoint: string;
    requestedLocationIds: string[];
}): Promise<void> {
    const { error } = await input.supabase.from("workflow_events").insert({
        org_id: input.orgId,
        event_type: "configuration.program.make_available",
        entity_type: "program",
        entity_id: input.result.programId,
        action_type: "make_available",
        payload: {
            operation_id: input.operationId,
            command_key: MAKE_PROGRAM_AVAILABLE_COMMAND_KEY,
            status: input.result.status,
            program_id: input.result.programId,
            revision_id: input.result.revisionId,
            publication_id: input.result.publicationId,
            created_program: input.result.createdProgram,
            published_program: input.result.publishedProgram,
            requested_location_ids: input.requestedLocationIds,
            associated_location_ids: input.result.associatedLocationIds,
            unchanged_location_ids: input.result.unchangedLocationIds,
            blocked: input.result.blocked,
            failed: input.result.failed,
            entry_point: input.entryPoint,
            distribution_run_id: input.result.distributionRunId,
            idempotent_replay: input.result.idempotentReplay,
            actor_user_id: input.actorUserId,
        },
    });
    // Audit must not roll back a successful association — log and continue if schema rejects.
    if (error) {
        console.error("[make-program-available] audit write failed", error.message);
    }
}

export async function commitMakeProgramAvailable(
    supabase: SupabaseClient,
    input: MakeProgramAvailableCommandInput,
): Promise<MakeProgramAvailableCommitResult> {
    const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey);
    const requestedLocationIds = normalizeLocationIds(input.locationIds);
    if (requestedLocationIds.length === 0) throw new Error("Choose at least one Location.");

    const entryPoint = input.entryPoint ?? "unknown";
    const requestFingerprint = sha256(
        JSON.stringify({
            program: input.program,
            locationIds: requestedLocationIds,
            originatingLocationId: input.originatingLocationId ?? null,
        }),
    );

    const { id: operationId, replay, durable } = await upsertOperationStart({
        supabase,
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        idempotencyKey,
        requestFingerprint,
        entryPoint,
    });

    if (replay?.result) {
        return { ...replay.result, idempotentReplay: true, operationId: replay.id };
    }

    // Re-resolve authority at commit time (do not trust preview).
    let createdProgram = false;
    let publishedProgram = false;
    let programId: string;
    let publicationId: string;
    let revisionId: string;

    if (input.program.kind === "new") {
        // Idempotent create: if operation already linked a program, reuse it.
        const existingOp = await loadIdempotentOperation({
            supabase,
            orgId: input.orgId,
            idempotencyKey,
        });
        if (existingOp?.program_id && existingOp.publication_id && existingOp.revision_id) {
            programId = existingOp.program_id;
            publicationId = existingOp.publication_id;
            revisionId = existingOp.revision_id;
        } else {
            programId = await createProgramDraft({
                supabase,
                orgId: input.orgId,
                actorUserId: input.actorUserId,
                key: input.program.input.key,
                label: input.program.input.label,
            });
            createdProgram = true;
            if (input.program.input.description != null) {
                await updateProgramDraft({
                    supabase,
                    orgId: input.orgId,
                    actorUserId: input.actorUserId,
                    programId,
                    patch: { description: input.program.input.description },
                });
            }
            const errors = await validateProgramDraft({
                supabase,
                orgId: input.orgId,
                actorUserId: input.actorUserId,
                programId,
            });
            if (errors.length > 0) {
                throw new Error(errors.join(" ") || "Program draft failed validation.");
            }
            await publishProgramDraft({
                supabase,
                orgId: input.orgId,
                actorUserId: input.actorUserId,
                programId,
            });
            publishedProgram = true;
            const published = await loadLatestProgramPublication({
                supabase,
                orgId: input.orgId,
                programId,
            });
            if (!published) {
                throw new Error("Publication id missing after publish.");
            }
            publicationId = published.publication.id;
            revisionId = published.revision.id;

            if (durable && !operationId.startsWith("ephemeral:")) {
                await supabase
                    .from("configuration_command_operations")
                    .update({
                        program_id: programId,
                        publication_id: publicationId,
                        revision_id: revisionId,
                    })
                    .eq("org_id", input.orgId)
                    .eq("id", operationId);
            }
        }
    } else {
        const published = await loadLatestProgramPublication({
            supabase,
            orgId: input.orgId,
            programId: input.program.programId,
        });
        if (!published) {
            const blockedResult: MakeProgramAvailableCommitResult = {
                status: "blocked",
                operationId,
                programId: input.program.programId,
                revisionId: "",
                publicationId: "",
                createdProgram: false,
                publishedProgram: false,
                associatedLocationIds: [],
                unchangedLocationIds: [],
                blocked: [
                    {
                        locationId: "*",
                        code: "publication_required",
                        reason: "Only published Program revisions may be made available at Locations.",
                    },
                ],
                failed: [],
                refreshTargets: buildMakeProgramAvailableRefreshTargets({
                    programId: input.program.programId,
                    associatedLocationIds: [],
                    originatingLocationId: input.originatingLocationId,
                }),
                distributionRunId: null,
                idempotentReplay: false,
            };
            await finalizeOperation({
                supabase,
                orgId: input.orgId,
                operationId,
                result: blockedResult,
                durable,
            });
            await writeGroupedAuditEvent({
                supabase,
                orgId: input.orgId,
                actorUserId: input.actorUserId,
                operationId,
                result: blockedResult,
                entryPoint,
                requestedLocationIds,
            });
            return blockedResult;
        }
        programId = input.program.programId;
        publicationId = published.publication.id;
        revisionId = published.revision.id;
    }

    const soft = await resolveProgramTargetsSoft({
        supabase,
        orgId: input.orgId,
        revision: (await loadLatestProgramPublication({
            supabase,
            orgId: input.orgId,
            programId,
        }))!.revision,
        targetIds: requestedLocationIds,
        allowedSiteLocationIds: input.allowedSiteLocationIds,
    });
    const partition = partitionMakeProgramAvailableTargets({
        resolved: soft,
        nextRevisionId: revisionId,
    });

    const assignTargetIds = partition.eligibleLocationIds;
    let distributionRunId: string | null = null;
    const failed: MakeProgramAvailableCommitResult["failed"] = [];

    if (assignTargetIds.length > 0) {
        const assignResult = await assignProgramDistribution({
            supabase,
            orgId: input.orgId,
            actorUserId: input.actorUserId,
            publicationId,
            targetIds: assignTargetIds,
            allowedSiteLocationIds: input.allowedSiteLocationIds,
        });
        distributionRunId =
            typeof assignResult.run_id === "string" ? assignResult.run_id : null;
        const failedCount = Number(assignResult.failed ?? 0);
        if (failedCount > 0) {
            // Per-target failure detail lives on distribution targets; mark partial.
            failed.push({
                locationId: "*",
                code: "distribution_partial_failure",
                retryable: true,
                reason: `${failedCount} Location delivery attempt(s) failed. Retry is safe.`,
            });
        }
    }

    const associatedLocationIds = [
        ...partition.newAssociations.map((row) => row.locationId),
        ...partition.alreadyAvailable.map((row) => row.locationId),
    ];
    const unchangedLocationIds = partition.alreadyAvailable.map((row) => row.locationId);
    const blocked = partition.blocked.map((row) => ({
        locationId: row.locationId,
        code: row.code,
        reason: row.reason,
    }));

    let status: MakeProgramAvailableCommitResult["status"] = "committed";
    if (associatedLocationIds.length === 0 && blocked.length > 0) status = "blocked";
    else if (failed.length > 0 || blocked.length > 0) status = "partial";

    const result: MakeProgramAvailableCommitResult = {
        status,
        operationId,
        programId,
        revisionId,
        publicationId,
        createdProgram,
        publishedProgram,
        associatedLocationIds,
        unchangedLocationIds,
        blocked,
        failed,
        refreshTargets: buildMakeProgramAvailableRefreshTargets({
            programId,
            associatedLocationIds,
            originatingLocationId: input.originatingLocationId,
        }),
        distributionRunId,
        idempotentReplay: false,
    };

    await finalizeOperation({
        supabase,
        orgId: input.orgId,
        operationId,
        result,
        durable,
    });
    await writeGroupedAuditEvent({
        supabase,
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        operationId,
        result,
        entryPoint,
        requestedLocationIds,
    });

    return result;
}
