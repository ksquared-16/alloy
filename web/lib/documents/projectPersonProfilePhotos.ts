/**
 * Request-scoped profile-photo projection onto person-keyed record rows.
 *
 * Durable truth is `persons.metadata.profile_photo_document_id`. Callers mint
 * actor-scoped URLs via `resolveProfilePhotosForActor` and inject
 * `resolved_photo_url` — never persist signed URLs back to person metadata.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentActor } from "@/lib/documents/assertDocumentAccess";
import {
    profilePhotoDocumentId,
    resolveProfilePhotosForActor,
    type PersonPhotoInput,
} from "@/lib/documents/profilePhotoPresentation";
import { applyResolvedPhotoUrls } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";

export function documentActorFromAdminParts(parts: {
    ok: boolean;
    failureStatus?: 401 | 403;
    userId?: string;
    orgId?: string;
    role?: string;
    roleKeys?: readonly string[];
    permissionKeys?: readonly string[];
}): DocumentActor {
    return {
        ok: parts.ok,
        failureStatus: parts.ok ? undefined : parts.failureStatus,
        userId: parts.userId,
        orgId: parts.orgId,
        role: parts.role,
        roleKeys: parts.roleKeys ? [...parts.roleKeys] : [],
        permissionKeys: parts.permissionKeys ? [...parts.permissionKeys] : [],
    };
}

/** Build a DocumentActor from a successful admin route gate. */
export function documentActorFromAdminGate(gate: {
    userId: string;
    orgId: string;
    role: string;
    roleKeys: readonly string[];
    access: { permissionKeys: readonly string[] };
}): DocumentActor {
    return documentActorFromAdminParts({
        ok: true,
        userId: gate.userId,
        orgId: gate.orgId,
        role: gate.role,
        roleKeys: gate.roleKeys,
        permissionKeys: gate.access.permissionKeys,
    });
}

/**
 * Resolve actor-scoped photo URLs for people referenced by `rows` and inject
 * `resolved_photo_url` keyed by **person_id** (not inquiry-child / OCM id).
 */
export async function projectResolvedProfilePhotosOntoRows<T extends Record<string, unknown>>(params: {
    supabase: SupabaseClient;
    orgId: string;
    actor: DocumentActor | null | undefined;
    rows: T[];
    personIdKey?: keyof T & string;
    /** Optional preloaded personId → metadata (skips fetch for those ids). */
    metadataByPersonId?: Map<string, Record<string, unknown> | null | undefined>;
}): Promise<T[]> {
    const { supabase, orgId, actor, rows } = params;
    const personIdKey = (params.personIdKey ?? "person_id") as keyof T & string;
    if (!actor?.ok || rows.length === 0) return rows;

    const personIds = [
        ...new Set(
            rows
                .map((r) => {
                    const v = r[personIdKey];
                    return typeof v === "string" && v.trim() ? v.trim() : null;
                })
                .filter((id): id is string => Boolean(id)),
        ),
    ];
    if (personIds.length === 0) return rows;

    const metadataByPersonId = new Map(params.metadataByPersonId ?? []);
    const missing = personIds.filter((id) => !metadataByPersonId.has(id));
    if (missing.length > 0) {
        const { data } = await supabase
            .from("persons")
            .select("id, metadata")
            .eq("org_id", orgId)
            .in("id", missing);
        for (const row of (data ?? []) as { id: string; metadata?: Record<string, unknown> | null }[]) {
            metadataByPersonId.set(row.id, row.metadata ?? null);
        }
    }

    const people: PersonPhotoInput[] = [];
    for (const personId of personIds) {
        const metadata = metadataByPersonId.get(personId) ?? null;
        if (!profilePhotoDocumentId(metadata)) continue;
        people.push({ personId, metadata });
    }
    if (people.length === 0) return rows;

    const resolved = await resolveProfilePhotosForActor({ supabase, actor, people });
    return applyResolvedPhotoUrls(rows, resolved, personIdKey);
}

/**
 * Project photos onto `_inquiry_children` arrays nested on queue / opportunity rows.
 * Mutates each row's `_inquiry_children` in place (new child objects) for the batch.
 */
export async function projectResolvedProfilePhotosOntoInquiryChildrenRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    actor: DocumentActor | null | undefined;
    rows: Array<Record<string, unknown>>;
    metadataByPersonId?: Map<string, Record<string, unknown> | null | undefined>;
}): Promise<Array<Record<string, unknown>>> {
    const { supabase, orgId, actor, rows } = params;
    if (!actor?.ok || rows.length === 0) return rows;

    const childRows: Array<Record<string, unknown>> = [];
    for (const row of rows) {
        const children = row._inquiry_children;
        if (!Array.isArray(children)) continue;
        for (const child of children) {
            if (child != null && typeof child === "object" && !Array.isArray(child)) {
                childRows.push(child as Record<string, unknown>);
            }
        }
    }
    if (childRows.length === 0) return rows;

    const projected = await projectResolvedProfilePhotosOntoRows({
        supabase,
        orgId,
        actor,
        rows: childRows,
        personIdKey: "person_id",
        metadataByPersonId: params.metadataByPersonId,
    });

    // Remap projected children back by person_id (and fall back to object identity index).
    const byPersonId = new Map<string, Record<string, unknown>>();
    for (const child of projected) {
        const pid = typeof child.person_id === "string" ? child.person_id.trim() : "";
        if (pid) byPersonId.set(pid, child);
    }

    return rows.map((row) => {
        const children = row._inquiry_children;
        if (!Array.isArray(children) || children.length === 0) return row;
        const nextChildren = children.map((child) => {
            if (child == null || typeof child !== "object" || Array.isArray(child)) return child;
            const raw = child as Record<string, unknown>;
            const pid = typeof raw.person_id === "string" ? raw.person_id.trim() : "";
            return (pid && byPersonId.get(pid)) || raw;
        });
        return { ...row, _inquiry_children: nextChildren };
    });
}
