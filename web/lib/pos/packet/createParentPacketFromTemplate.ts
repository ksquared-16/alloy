/**
 * POS Packet Runtime Foundation (Sprint 1) — generate a parent packet from a generated
 * Alloy form template.
 *
 * This is the single operator action behind:
 *   generated form template → packet → share link → parent route → packet shell.
 *
 * It is pure orchestration over the EXISTING forms-packet runtime — it creates no new
 * tables and no second packet system. Steps:
 *   1. ensure the template form has a PUBLISHED version (publish the latest draft if none,
 *      since packet steps require a published version);
 *   2. create a `form_packet_definition`;
 *   3. add ONE `form_packet_item` (sequence 0, follow-latest-published);
 *   4. mint a packet public link (`mintPacketPublicLinkForAdmin`) → the parent URL.
 *
 * The packet is generated from the Alloy form template, never from a PDF (PDF stays an
 * output target). Storage ops are injected (DI) so orchestration is unit-testable without
 * a database, mirroring `createFormFromCaseDraft`. The production wiring lives in
 * `makeParentPacketTemplateDeps`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";
import {
    dbGetFormDefinition,
    dbListVersionsForForm,
    dbPublishVersion,
    dbListPacketDefinitionKeys,
} from "@/lib/admin/forms/formsAdminDb";
import { mintPacketPublicLinkForAdmin, type MintPacketPublicLinkResult } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";

export interface ParentPacketLaunchFromEntity {
    entity_type: "person" | "customer" | "customer_member" | "opportunity";
    entity_id: string;
    prefill_enabled?: boolean;
}

export interface CreateParentPacketInput {
    orgId: string;
    formDefinitionId: string;
    /** Override the packet name. Defaults to "<form name> — Parent Packet". */
    name?: string;
    /** User performing the action (used when publishing a draft version). */
    publishedByUserId: string;
    /** Base URL for the embed link, derived from the request (mirrors packet-links route). */
    embedBaseUrl: string | null;
    /** When the form has no published version: publish the latest draft (default true). */
    autopublish?: boolean;
    /** Optional record to launch from (drives prefill + entity linkage downstream). */
    launchFromEntity?: ParentPacketLaunchFromEntity;
}

export type CreateParentPacketErrorCode =
    | "not_found"
    | "no_publishable_version"
    | "publish_failed"
    | "packet_create_failed"
    | "link_failed";

export type CreateParentPacketResult =
    | {
          ok: true;
          packetDefinitionId: string;
          formDefinitionId: string;
          /** The published version used as the first (and only) step. */
          publishedVersionId: string;
          /** True when the form already had a published version (no publish performed). */
          alreadyPublished: boolean;
          publicLink: {
              token: string;
              embedPath: string;
              embedUrl: string | null;
              firstStepSequenceIndex: number;
          };
      }
    | { ok: false; code: CreateParentPacketErrorCode; message: string };

/** Injected storage operations. No matching/duplicate-detection logic lives here. */
export interface ParentPacketTemplateDeps {
    getFormDefinition(
        orgId: string,
        formId: string
    ): Promise<{ id: string; name: string | null; key: string; metadata?: Record<string, unknown> } | null>;
    listVersions(orgId: string, formId: string): Promise<Array<{ id: string; version_number: number; status: string }>>;
    publishVersion(orgId: string, versionId: string, userId: string): Promise<{ ok: boolean; message?: string }>;
    listPacketDefinitionKeys(orgId: string): Promise<Set<string>>;
    insertPacketDefinition(input: {
        orgId: string;
        key: string;
        name: string;
        metadata: Record<string, unknown>;
    }): Promise<{ id: string }>;
    insertPacketItem(input: {
        orgId: string;
        packetDefinitionId: string;
        formDefinitionId: string;
        pinnedVersionId: string | null;
        sequenceIndex: number;
        metadata: Record<string, unknown>;
    }): Promise<void>;
    mintPacketLink(input: {
        orgId: string;
        embedBaseUrl: string | null;
        body: Record<string, unknown>;
    }): Promise<MintPacketPublicLinkResult>;
}

const byVersionDesc = (a: { version_number: number }, b: { version_number: number }) => b.version_number - a.version_number;

export async function createParentPacketFromTemplate(
    deps: ParentPacketTemplateDeps,
    input: CreateParentPacketInput
): Promise<CreateParentPacketResult> {
    const { orgId, formDefinitionId } = input;
    const autopublish = input.autopublish ?? true;

    const form = await deps.getFormDefinition(orgId, formDefinitionId);
    if (!form) {
        return { ok: false, code: "not_found", message: "Form template not found in this organization" };
    }

    // 1) Ensure a published version exists.
    const versions = await deps.listVersions(orgId, formDefinitionId);
    const published = versions.filter((v) => v.status === "published").sort(byVersionDesc);
    let publishedVersionId: string;
    let alreadyPublished: boolean;

    if (published.length > 0) {
        publishedVersionId = published[0].id;
        alreadyPublished = true;
    } else {
        if (!autopublish) {
            return {
                ok: false,
                code: "no_publishable_version",
                message: "Form template has no published version. Publish it first or enable autopublish.",
            };
        }
        const drafts = versions.filter((v) => v.status === "draft").sort(byVersionDesc);
        if (drafts.length === 0) {
            return {
                ok: false,
                code: "no_publishable_version",
                message: "Form template has no draft or published version to publish.",
            };
        }
        const pub = await deps.publishVersion(orgId, drafts[0].id, input.publishedByUserId);
        if (!pub.ok) {
            return { ok: false, code: "publish_failed", message: pub.message ?? "Failed to publish form template" };
        }
        publishedVersionId = drafts[0].id;
        alreadyPublished = false;
    }

    // 2) Create the packet definition.
    const baseName = input.name?.trim() || `${form.name ?? form.key} — Parent Packet`;
    const taken = await deps.listPacketDefinitionKeys(orgId);
    const key = allocateUniqueKey(slugKeyFromDisplayName(baseName), taken);

    let packetDefinitionId: string;
    try {
        const pkt = await deps.insertPacketDefinition({
            orgId,
            key,
            name: baseName,
            metadata: { created_via: "pos_packet_from_template", source_form_definition_id: formDefinitionId },
        });
        packetDefinitionId = pkt.id;
    } catch (e) {
        return { ok: false, code: "packet_create_failed", message: e instanceof Error ? e.message : "Failed to create packet definition" };
    }

    // 3) Add the single step (follow latest published — pinned null keeps links valid across republishes).
    try {
        await deps.insertPacketItem({
            orgId,
            packetDefinitionId,
            formDefinitionId,
            pinnedVersionId: null,
            sequenceIndex: 0,
            metadata: { step_label: form.name ?? form.key, created_via: "pos_packet_from_template" },
        });
    } catch (e) {
        return { ok: false, code: "packet_create_failed", message: e instanceof Error ? e.message : "Failed to add packet step" };
    }

    // 4) Mint the parent share link.
    const body: Record<string, unknown> = {
        packet_definition_id: packetDefinitionId,
        label: baseName,
        metadata: { created_via: "pos_packet_from_template", source_form_definition_id: formDefinitionId },
    };
    if (input.launchFromEntity) body.launch_from_entity = input.launchFromEntity;

    const link = await deps.mintPacketLink({ orgId, embedBaseUrl: input.embedBaseUrl, body });
    if (!link.ok) {
        return { ok: false, code: "link_failed", message: link.message };
    }

    return {
        ok: true,
        packetDefinitionId,
        formDefinitionId,
        publishedVersionId,
        alreadyPublished,
        publicLink: {
            token: link.data.plaintext_token,
            embedPath: link.data.embed_path,
            embedUrl: link.data.embed_url,
            firstStepSequenceIndex: link.data.first_step_sequence_index,
        },
    };
}

/** Production wiring of `ParentPacketTemplateDeps` over Supabase + existing form helpers. */
export function makeParentPacketTemplateDeps(supabase: SupabaseClient): ParentPacketTemplateDeps {
    return {
        async getFormDefinition(orgId, formId) {
            const { data, error } = await dbGetFormDefinition(supabase, orgId, formId);
            if (error) throw new Error(error.message);
            if (!data) return null;
            const row = data as { id: string; name: string | null; key: string; metadata?: Record<string, unknown> };
            return { id: row.id, name: row.name, key: row.key, metadata: row.metadata };
        },
        async listVersions(orgId, formId) {
            const { data, error } = await dbListVersionsForForm(supabase, orgId, formId);
            if (error) throw new Error(error.message);
            return (data ?? []) as Array<{ id: string; version_number: number; status: string }>;
        },
        async publishVersion(orgId, versionId, userId) {
            const { data, error } = await dbPublishVersion(supabase, orgId, versionId, userId);
            if (error) return { ok: false, message: error.message };
            if (!data) return { ok: false, message: "Version is not a draft or was not found" };
            return { ok: true };
        },
        listPacketDefinitionKeys(orgId) {
            return dbListPacketDefinitionKeys(supabase, orgId);
        },
        async insertPacketDefinition({ orgId, key, name, metadata }) {
            const { data, error } = await supabase
                .from("form_packet_definitions")
                .insert({ org_id: orgId, key, name, description: null, is_active: true, metadata })
                .select("id")
                .single();
            if (error) throw new Error(error.message);
            return { id: (data as { id: string }).id };
        },
        async insertPacketItem({ orgId, packetDefinitionId, formDefinitionId, pinnedVersionId, sequenceIndex, metadata }) {
            const { error } = await supabase.from("form_packet_items").insert({
                org_id: orgId,
                packet_definition_id: packetDefinitionId,
                sequence_index: sequenceIndex,
                form_definition_id: formDefinitionId,
                pinned_form_definition_version_id: pinnedVersionId,
                metadata,
            });
            if (error) throw new Error(error.message);
        },
        mintPacketLink({ orgId, embedBaseUrl, body }) {
            return mintPacketPublicLinkForAdmin({ supabase, orgId, embedBaseUrl, body });
        },
    };
}
