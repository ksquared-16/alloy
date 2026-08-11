/**
 * Attach inquiry-owned Program (and stage-entry wait-since) onto child-grain provisioning rows
 * when Placement System candidates are absent.
 *
 * Canonical Program for enrollment children is `inquiry_child.program` /
 * `desired_program_label` on opportunity_customer_members — the same truth the Children card
 * paints. Queue compact slots resolve `inquiry_child.program*` via placement_context; without
 * this attach, configured Waitlist Secondary fields stay empty while Focus Panel shows Toddler.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildProvisioningRowWithPlacement } from "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement";
import { formatCompactRelativeDurationIso } from "@/lib/format/formatCompactRelativeDuration";
import { loadLocationProgramCategoriesForOrg } from "@/lib/locations/loadLocationProgramCategoriesForOrg";

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function formatWaitSinceDisplay(iso: string | null | undefined, nowMs: number = Date.now()): string | null {
    if (!iso?.trim()) return null;
    return formatCompactRelativeDurationIso(iso.trim(), nowMs)?.compact ?? null;
}

/**
 * Fill program_label / wait_since fallbacks on child rows that lack a placement candidate.
 * Fail-open: never throws; returns input rows on error.
 */
export async function attachChildGrainInquiryProgramFallback(params: {
    supabase: SupabaseClient;
    orgId: string;
    childRows: readonly ChildProvisioningRowWithPlacement[];
}): Promise<ChildProvisioningRowWithPlacement[]> {
    const rows = params.childRows.map((r) => ({ ...r }));
    if (!rows.length) return rows;

    const memberIds = [
        ...new Set(
            rows
                .map((r) => str(r.subjectId) ?? str(r.legacyOcmId))
                .filter((id): id is string => Boolean(id)),
        ),
    ];
    if (!memberIds.length) return rows;

    try {
        const participationIds = [
            ...new Set(
                rows
                    .map((r) => str(r.participationId))
                    .filter((id): id is string => Boolean(id)),
            ),
        ];

        const [ocmByMember, ocmById, categories, piRes, cmRes] = await Promise.all([
            params.supabase
                .from("opportunity_customer_members")
                .select("id, customer_member_id, program_category_id, created_at, metadata")
                .eq("org_id", params.orgId)
                .in("customer_member_id", memberIds),
            params.supabase
                .from("opportunity_customer_members")
                .select("id, customer_member_id, program_category_id, created_at, metadata")
                .eq("org_id", params.orgId)
                .in("id", memberIds),
            loadLocationProgramCategoriesForOrg(params.supabase, params.orgId).catch(() => []),
            participationIds.length
                ? params.supabase
                      .from("process_instances")
                      .select("id, metadata, stage_entered_at, created_at")
                      .eq("org_id", params.orgId)
                      .in("id", participationIds)
                : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
            params.supabase
                .from("customer_members")
                .select("id, person_id, dob")
                .eq("org_id", params.orgId)
                .in("id", memberIds),
        ]);

        const labelByCategoryId = new Map<string, string>();
        const labelByKey = new Map<string, string>();
        for (const cat of categories) {
            const id = str((cat as { id?: unknown }).id);
            const key = str((cat as { key?: unknown }).key);
            const label = str((cat as { label?: unknown }).label) ?? key;
            if (id && label) labelByCategoryId.set(id, label);
            if (key && label) labelByKey.set(key, label);
        }

        const programFromMeta = (meta: Record<string, unknown> | null): string | null => {
            if (!meta) return null;
            const catId = str(meta.program_category_id);
            const metaLabel =
                str(meta.desired_program_label)
                ?? str(meta.demo_program_label)
                ?? str(meta.program_label)
                ?? null;
            const metaKey = str(meta.program_key) ?? str(meta.desired_program_key);
            return (
                (catId ? labelByCategoryId.get(catId) ?? null : null)
                ?? (metaKey ? labelByKey.get(metaKey) ?? null : null)
                ?? metaLabel
                ?? metaKey
                ?? null
            );
        };

        const byMember = new Map<string, { programLabel: string | null; createdAt: string | null }>();
        const ingestOcm = (raw: Record<string, unknown>) => {
            const cm = str(raw.customer_member_id);
            const ocm = str(raw.id);
            const catId = str(raw.program_category_id);
            const meta =
                raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
                    ? (raw.metadata as Record<string, unknown>)
                    : null;
            const programLabel =
                (catId ? labelByCategoryId.get(catId) ?? null : null)
                ?? programFromMeta(meta);
            const createdAt = str(raw.created_at);
            const payload = { programLabel, createdAt };
            if (cm) byMember.set(cm, payload);
            if (ocm) byMember.set(ocm, payload);
        };

        for (const raw of (ocmByMember.data ?? []) as Array<Record<string, unknown>>) ingestOcm(raw);
        for (const raw of (ocmById.data ?? []) as Array<Record<string, unknown>>) ingestOcm(raw);

        const byParticipation = new Map<
            string,
            { programLabel: string | null; waitSinceIso: string | null; stageEnteredAtIso: string | null }
        >();
        for (const raw of (piRes.data ?? []) as Array<Record<string, unknown>>) {
            const id = str(raw.id);
            if (!id) continue;
            const meta =
                raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
                    ? (raw.metadata as Record<string, unknown>)
                    : null;
            const stageEntered = str(raw.stage_entered_at);
            byParticipation.set(id, {
                programLabel: programFromMeta(meta),
                waitSinceIso: stageEntered ?? str(raw.created_at),
                stageEnteredAtIso: stageEntered,
            });
        }

        const personIds = [
            ...new Set(
                ((cmRes.data ?? []) as Array<Record<string, unknown>>)
                    .map((r) => str(r.person_id))
                    .filter((id): id is string => Boolean(id)),
            ),
        ];
        const dobByMember = new Map<string, string>();
        for (const raw of (cmRes.data ?? []) as Array<Record<string, unknown>>) {
            const id = str(raw.id);
            const cmDob = str(raw.dob)?.slice(0, 10) ?? null;
            if (id && cmDob) dobByMember.set(id, cmDob);
        }
        if (personIds.length) {
            const { data: persons } = await params.supabase
                .from("persons")
                .select("id, date_of_birth")
                .in("id", personIds);
            const dobByPerson = new Map<string, string>();
            for (const p of (persons ?? []) as Array<Record<string, unknown>>) {
                const id = str(p.id);
                const dob = str(p.date_of_birth)?.slice(0, 10) ?? null;
                if (id && dob) dobByPerson.set(id, dob);
            }
            for (const raw of (cmRes.data ?? []) as Array<Record<string, unknown>>) {
                const id = str(raw.id);
                const personId = str(raw.person_id);
                const fromPerson = personId ? dobByPerson.get(personId) ?? null : null;
                if (id && fromPerson) dobByMember.set(id, fromPerson);
            }
        }

        const nowMs = Date.now();
        for (const child of rows) {
            const hit =
                byMember.get(str(child.subjectId) ?? "")
                ?? byMember.get(str(child.legacyOcmId) ?? "")
                ?? null;
            const piHit = byParticipation.get(str(child.participationId) ?? "") ?? null;

            const hasPlacementProgram = Boolean(
                str(child.placementWaitlistRow?.program_room_group_label)
                ?? str(child.placementWaitlistRow?.program_key),
            );
            const programLabel = hit?.programLabel ?? piHit?.programLabel ?? null;
            if (!hasPlacementProgram && programLabel) {
                child.inquiryProgramLabel = programLabel;
            }

            if (piHit?.stageEnteredAtIso) {
                child.stageEnteredAtIso = piHit.stageEnteredAtIso;
            }

            // Prefer process-instance stage entry for wait-since display even when Placement
            // stamped opportunity.created_at (historical bug — freezes lead age as "4d").
            const stageWait =
                formatWaitSinceDisplay(piHit?.waitSinceIso, nowMs)
                ?? formatWaitSinceDisplay(child.updatedAt, nowMs)
                ?? formatWaitSinceDisplay(hit?.createdAt ?? null, nowMs);
            if (stageWait) child.inquiryWaitSinceLabel = stageWait;

            const dob =
                dobByMember.get(str(child.subjectId) ?? "")
                ?? dobByMember.get(str(child.legacyOcmId) ?? "")
                ?? null;
            if (dob) child.dateOfBirthIso = dob;
        }

        return rows;
    } catch {
        return params.childRows.map((r) => ({ ...r }));
    }
}
