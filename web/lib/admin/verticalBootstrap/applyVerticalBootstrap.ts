/**
 * Applies a validated vertical bootstrap payload to an org.
 *
 * Note: operations run sequentially via the Supabase client (no single DB transaction in v1).
 * Rows are upserted by natural keys so re-running after a partial failure converges toward the target state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareQueueDefinitionPatch } from "@/lib/agent/v0/applyWorkUnitQueueDefinitionUpdate";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";
import { parseVerticalBootstrapPayload } from "@/lib/admin/verticalBootstrap/parseVerticalBootstrapPayload";
import { previewVerticalBootstrap } from "@/lib/admin/verticalBootstrap/previewVerticalBootstrap";
import type { VerticalBootstrapApplyResult, VerticalBootstrapApplySummary } from "@/lib/admin/verticalBootstrap/types";
import { getQueueDefinitionStoredVersion } from "@/lib/rrs/queue/queueDefinitionV1";

export async function applyVerticalBootstrap(
    supabase: SupabaseClient,
    orgId: string,
    rawPayload: unknown
): Promise<VerticalBootstrapApplyResult> {
    const parsed = parseVerticalBootstrapPayload(rawPayload);
    if (!parsed.ok) {
        return { ok: false, error: parsed.errors.join("; ") };
    }

    const preflight = await previewVerticalBootstrap(supabase, orgId, rawPayload);
    if (!preflight.ok) {
        return { ok: false, error: preflight.errors.join("; ") };
    }

    const payload = parsed.payload;
    const summary: VerticalBootstrapApplySummary = {
        departments_created: 0,
        departments_updated: 0,
        status_definitions_created: 0,
        status_definitions_updated: 0,
        work_units_created: 0,
        work_units_updated: 0,
    };

    const now = new Date().toISOString();

    const deptIdByKey = new Map<string, string>();

    for (const d of payload.departments) {
        const { data: existing, error: fetchErr } = await supabase
            .from("departments")
            .select("id, name, description, sort_order, is_active, metadata")
            .eq("org_id", orgId)
            .eq("key", d.key)
            .maybeSingle();

        if (fetchErr) {
            return { ok: false, error: `departments[${d.key}]: ${fetchErr.message}` };
        }

        const meta = d.metadata && typeof d.metadata === "object" && !Array.isArray(d.metadata) ? d.metadata : {};

        if (!existing) {
            const { data: created, error: insErr } = await supabase
                .from("departments")
                .insert({
                    org_id: orgId,
                    key: d.key,
                    name: d.name,
                    description: d.description ?? null,
                    sort_order: d.sort_order ?? 0,
                    is_active: d.is_active !== false,
                    metadata: meta,
                    updated_at: now,
                })
                .select("id")
                .single();

            if (insErr || !created) {
                return { ok: false, error: `departments[${d.key}]: ${insErr?.message ?? "insert failed"}` };
            }
            summary.departments_created += 1;
            deptIdByKey.set(d.key, (created as { id: string }).id);
        } else {
            const ex = existing as {
                id: string;
                name: string;
                description: string | null;
                sort_order: number;
                is_active: boolean;
                metadata: Record<string, unknown> | null;
            };
            const sort = d.sort_order ?? 0;

            // A bootstrap INITIALIZES; it never overwrites an established department.
            //
            // This previously wrote `metadata: meta` — a full replace of the column from the
            // blueprint constant — destroying every process, stage, perspective and work view
            // under `lifecycle_builder_v1`. Worse, the equality check INVERTED: a department with
            // no authored config compared equal and was skipped, while a department *with*
            // authored config was guaranteed unequal, so the destructive write fired precisely
            // where there was something to lose.
            //
            // Now: publication-owned lifecycle configuration is never supplied by a blueprint to
            // an existing department, and existing keys win over blueprint keys. The database
            // guard (20260730130000) enforces the lifecycle half independently of this code.
            const existingMeta = (ex.metadata ?? {}) as Record<string, unknown>;
            const { lifecycle_builder_v1: _publicationOwned, ...blueprintMeta } = meta as Record<
                string,
                unknown
            >;
            const mergedMeta = { ...blueprintMeta, ...existingMeta };

            const same =
                ex.name === d.name &&
                (ex.description ?? null) === (d.description ?? null) &&
                ex.sort_order === sort &&
                ex.is_active === (d.is_active !== false) &&
                JSON.stringify(existingMeta) === JSON.stringify(mergedMeta);
            deptIdByKey.set(d.key, ex.id);
            if (same) {
                continue;
            }
            const { error: upErr } = await supabase
                .from("departments")
                .update({
                    name: d.name,
                    description: d.description ?? null,
                    sort_order: sort,
                    is_active: d.is_active !== false,
                    metadata: mergedMeta,
                    updated_at: now,
                })
                .eq("id", ex.id)
                .eq("org_id", orgId);

            if (upErr) {
                return { ok: false, error: `departments[${d.key}]: ${upErr.message}` };
            }
            summary.departments_updated += 1;
        }
    }

    for (const k of new Set(payload.work_units.map((w) => w.department_key))) {
        if (!deptIdByKey.has(k)) {
            const { data: row, error } = await supabase
                .from("departments")
                .select("id")
                .eq("org_id", orgId)
                .eq("key", k)
                .maybeSingle();
            if (error) {
                return { ok: false, error: `departments resolve[${k}]: ${error.message}` };
            }
            if (row) {
                deptIdByKey.set(k, (row as { id: string }).id);
            }
        }
    }

    for (const s of payload.status_definitions) {
        const { data: existing, error: fetchErr } = await supabase
            .from("status_definitions")
            .select("id, status_label, sort_order, is_active, metadata")
            .eq("org_id", orgId)
            .eq("entity_type", s.entity_type)
            .eq("status_key", s.status_key)
            .is("industry_key", null)
            .maybeSingle();

        if (fetchErr) {
            return { ok: false, error: `status_definitions[${s.entity_type}/${s.status_key}]: ${fetchErr.message}` };
        }

        const metadata = normalizeStatusDefinitionMetadata(s.metadata);
        const sort = s.sort_order ?? 100;

        if (!existing) {
            const { error: insErr } = await supabase.from("status_definitions").insert({
                org_id: orgId,
                entity_type: s.entity_type,
                status_key: s.status_key,
                status_label: s.status_label,
                sort_order: sort,
                is_active: s.is_active !== false,
                is_system: false,
                metadata,
                industry_key: null,
            });

            if (insErr) {
                return { ok: false, error: `status_definitions[${s.entity_type}/${s.status_key}]: ${insErr.message}` };
            }
            summary.status_definitions_created += 1;
        } else {
            const ex = existing as {
                id: string;
                status_label: string;
                sort_order: number;
                is_active: boolean;
                metadata: Record<string, unknown> | null;
            };
            const same =
                ex.status_label === s.status_label &&
                ex.sort_order === sort &&
                ex.is_active === (s.is_active !== false) &&
                JSON.stringify(ex.metadata ?? {}) === JSON.stringify(metadata);
            if (same) {
                continue;
            }
            const { error: upErr } = await supabase
                .from("status_definitions")
                .update({
                    status_label: s.status_label,
                    sort_order: sort,
                    is_active: s.is_active !== false,
                    metadata,
                })
                .eq("id", ex.id)
                .eq("org_id", orgId);

            if (upErr) {
                return { ok: false, error: `status_definitions[${s.entity_type}/${s.status_key}]: ${upErr.message}` };
            }
            summary.status_definitions_updated += 1;
        }
    }

    for (const w of payload.work_units) {
        const department_id = deptIdByKey.get(w.department_key);
        if (!department_id) {
            return { ok: false, error: `work_units[${w.department_key}/${w.key}]: department not found after apply` };
        }

        const { data: existing, error: fetchErr } = await supabase
            .from("work_units")
            .select("id, name, description, sort_order, is_active, queue_definition, metadata")
            .eq("org_id", orgId)
            .eq("department_id", department_id)
            .eq("key", w.key)
            .maybeSingle();

        if (fetchErr) {
            return { ok: false, error: `work_units[${w.department_key}/${w.key}]: ${fetchErr.message}` };
        }

        const wuMeta =
            w.metadata && typeof w.metadata === "object" && !Array.isArray(w.metadata) ? w.metadata : {};
        const sort = w.sort_order ?? 0;

        if (!existing) {
            const { error: insErr } = await supabase.from("work_units").insert({
                org_id: orgId,
                department_id,
                key: w.key,
                name: w.name,
                description: w.description ?? null,
                sort_order: sort,
                is_active: w.is_active !== false,
                queue_definition: w.queue_definition ?? {},
                metadata: wuMeta,
                updated_at: now,
            });
            if (insErr) {
                return { ok: false, error: `work_units[${w.department_key}/${w.key}]: ${insErr.message}` };
            }
            summary.work_units_created += 1;
            continue;
        }

        const ex = existing as {
            id: string;
            name: string;
            description: string | null;
            sort_order: number;
            is_active: boolean;
            queue_definition: unknown;
            metadata: Record<string, unknown> | null;
        };

        const qdPayload = (w.queue_definition ?? {}) as Record<string, unknown>;
        const incomingForPatch = Object.keys(qdPayload).length === 0 ? null : qdPayload;
        const prep = prepareQueueDefinitionPatch(
            ex.queue_definition,
            incomingForPatch,
            getQueueDefinitionStoredVersion(ex.queue_definition)
        );
        if (!prep.ok) {
            return { ok: false, error: `work_units[${w.department_key}/${w.key}]: ${prep.error}` };
        }

        const same =
            ex.name === w.name &&
            (ex.description ?? null) === (w.description ?? null) &&
            ex.sort_order === sort &&
            ex.is_active === (w.is_active !== false) &&
            JSON.stringify(ex.metadata ?? {}) === JSON.stringify(wuMeta) &&
            JSON.stringify(ex.queue_definition ?? {}) === JSON.stringify(prep.nextQueueDefinition);

        if (same) {
            continue;
        }

        const { error: upErr } = await supabase
            .from("work_units")
            .update({
                name: w.name,
                description: w.description ?? null,
                sort_order: sort,
                is_active: w.is_active !== false,
                queue_definition: prep.nextQueueDefinition,
                metadata: wuMeta,
                updated_at: now,
            })
            .eq("id", ex.id)
            .eq("org_id", orgId);

        if (upErr) {
            return { ok: false, error: `work_units[${w.department_key}/${w.key}]: ${upErr.message}` };
        }
        summary.work_units_updated += 1;
    }

    return { ok: true, summary };
}
