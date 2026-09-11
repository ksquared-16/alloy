/**
 * Converting a legacy attendance producer into a Developer Platform installation.
 *
 * ── WHAT MAY BE CARRIED, AND WHAT MAY NOT ──
 *
 * `producer_key` is the hinge. It has been the durable provenance identity on
 * both sides since B.1 — it is what reaches a canonical fact as `source_key` —
 * so converting a producer to an installation that keeps the same
 * `producer_key` means every fact the producer already authored stays attributed
 * to the same author. Nothing is rewritten, and history does not move.
 *
 * That also makes the conversion its own idempotency key: an installation
 * already carrying this `producer_key` IS this producer, converted. Re-running
 * finds it rather than creating a second one.
 *
 * ── THE CREDENTIAL IS DELIBERATELY NOT CARRIED ──
 *
 * A legacy producer holds `credential_hash`, a SHA-256 of a bearer secret.
 * Developer Platform credentials are a different scheme with a different
 * lifecycle. Copying the hash across would produce an installation that appears
 * provisioned and cannot authenticate, which is worse than one that plainly has
 * no credential yet. So the installation is created WITHOUT a credential and
 * says so: issuing one is a deliberate act by an operator, not a side effect of
 * a migration.
 *
 * ── AMBIGUITY IS NOT RESOLVED BY GUESSING ──
 *
 * A producer whose boundary cannot be established exactly is left alone. The
 * tempting move — no sites recorded, so grant the organization — is precisely a
 * broadening, and it would hand an external caller every site in the tenant. A
 * producer that cannot be converted without inventing something stays a
 * producer, and is reported as unresolved with the reason.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type LegacyProducerRow = {
    id: string;
    org_id: string;
    provider_key: string;
    producer_key: string;
    label: string | null;
    status: string;
    capabilities: string[] | null;
};

export type LegacyProducerSite = { producer_id: string; site_location_id: string };

export type LegacyMappingRow = {
    producer_id: string;
    external_entity_type: string;
    external_id: string;
    child_customer_member_id: string | null;
    location_id: string | null;
    status: string;
};

export type ConversionPlan = {
    producerId: string;
    producerKey: string;
    orgId: string;
    /** Derived from the provider, never invented per producer. */
    applicationSlug: string;
    grantedScopes: string[];
    boundaryMode: "locations";
    locationBoundary: string[];
    resourceRefs: Array<{
        resource_type: "child" | "location";
        external_id: string;
        child_customer_member_id: string | null;
        location_id: string | null;
    }>;
    /** Always false. Stated rather than implied — see the header. */
    carriesCredential: false;
};

export type ConversionDecision =
    | { ok: true; plan: ConversionPlan }
    | { ok: false; code: ConversionRefusal; detail: string };

export type ConversionRefusal =
    | "producer_not_active"
    | "no_boundary_recorded"
    | "no_producer_key"
    | "ambiguous_mapping"
    | "unmappable_capability";

/**
 * The public scope a legacy capability corresponds to.
 *
 * An unknown capability is NOT dropped silently: dropping it would quietly
 * convert a producer into a less capable installation and the difference would
 * only surface as a refused write much later.
 */
const CAPABILITY_TO_SCOPE: Readonly<Record<string, string>> = Object.freeze({
    "attendance.record": "attendance.write",
    "attendance.capture": "attendance.write",
    "locations.read": "locations.read",
});

/** A stable application slug for a provider. Derived, so two runs agree. */
export function applicationSlugForProvider(providerKey: string): string {
    return `legacy-${String(providerKey ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/**
 * Decide what one producer becomes — without writing anything.
 *
 * Separated from execution so the decision is testable on its own and so an
 * operator can see every conversion before any of them happens.
 */
export function planConversion(input: {
    producer: LegacyProducerRow;
    sites: LegacyProducerSite[];
    mappings: LegacyMappingRow[];
}): ConversionDecision {
    const { producer } = input;

    if (!producer.producer_key?.trim()) {
        return { ok: false, code: "no_producer_key", detail: "Without a producer key the conversion has no stable identity and provenance would break." };
    }
    if (producer.status !== "active") {
        // A revoked producer must not come back as a working installation.
        return { ok: false, code: "producer_not_active", detail: `Producer status is "${producer.status}".` };
    }

    const siteIds = [...new Set(input.sites.filter((s) => s.producer_id === producer.id).map((s) => s.site_location_id))].sort();
    if (siteIds.length === 0) {
        return {
            ok: false,
            code: "no_boundary_recorded",
            detail: "No producer sites are recorded. Granting the organization instead would broaden the boundary, so this producer is left unconverted.",
        };
    }

    const scopes = new Set<string>();
    for (const cap of producer.capabilities ?? []) {
        const scope = CAPABILITY_TO_SCOPE[cap];
        if (!scope) {
            return { ok: false, code: "unmappable_capability", detail: `Capability "${cap}" has no public scope; converting would silently drop it.` };
        }
        scopes.add(scope);
    }

    const refs: ConversionPlan["resourceRefs"] = [];
    const seen = new Map<string, string>();
    for (const m of input.mappings.filter((m) => m.producer_id === producer.id && m.status === "active")) {
        const type = m.external_entity_type === "child" ? "child" : m.external_entity_type === "location" ? "location" : null;
        if (!type) continue;
        const target = type === "child" ? m.child_customer_member_id : m.location_id;
        if (!target) continue;
        const key = `${type}:${m.external_id}`;
        const prior = seen.get(key);
        if (prior && prior !== target) {
            // Two active rows claiming one external id. Picking either would be a guess.
            return { ok: false, code: "ambiguous_mapping", detail: `External id "${m.external_id}" maps to more than one ${type}.` };
        }
        if (prior) continue;
        seen.set(key, target);
        refs.push({
            resource_type: type,
            external_id: m.external_id,
            child_customer_member_id: type === "child" ? target : null,
            location_id: type === "location" ? target : null,
        });
    }
    // Deterministic order, so two runs produce byte-identical plans.
    refs.sort((a, b) => (a.resource_type + a.external_id).localeCompare(b.resource_type + b.external_id));

    return {
        ok: true,
        plan: {
            producerId: producer.id,
            producerKey: producer.producer_key,
            orgId: producer.org_id,
            applicationSlug: applicationSlugForProvider(producer.provider_key),
            grantedScopes: [...scopes].sort(),
            boundaryMode: "locations",
            locationBoundary: siteIds,
            resourceRefs: refs,
            carriesCredential: false,
        },
    };
}


export type ConversionOutcome =
    | { ok: true; installationId: string; created: boolean; refsWritten: number }
    | { ok: false; code: "write_failed" | "boundary_would_broaden"; detail: string };

/**
 * Apply a plan, at most once per producer.
 *
 * Replay-safe by construction: the installation is looked up by
 * (org, producer_key) before anything is created, so running this twice converges
 * on one installation rather than two. Resource refs are written per external id
 * and skipped when already present, for the same reason.
 *
 * The boundary is re-checked against the plan at write time. An installation that
 * already exists with a WIDER boundary is not narrowed and not widened — it is
 * refused, because silently changing an existing external caller's reach is not
 * a migration outcome anyone asked for.
 */
export async function applyConversion(
    supabase: SupabaseClient,
    plan: ConversionPlan,
): Promise<ConversionOutcome> {
    const app = await supabase
        .from("developer_applications")
        .select("id")
        .eq("slug", plan.applicationSlug)
        .limit(1);
    let applicationId = ((app.data ?? []) as Array<{ id: string }>)[0]?.id ?? "";

    if (!applicationId) {
        const created = await supabase
            .from("developer_applications")
            .insert({
                slug: plan.applicationSlug,
                name: plan.applicationSlug,
                publisher: "alloy-legacy-conversion",
                ownership_mode: "tenant_private",
                environment: "production",
                status: "active",
            })
            .select("id")
            .single();
        if (created.error) return { ok: false, code: "write_failed", detail: created.error.message };
        applicationId = (created.data as { id: string }).id;
    }

    // The idempotency key. One producer becomes one installation, ever.
    const existing = await supabase
        .from("app_installations")
        .select("id, location_boundary, boundary_mode")
        .eq("org_id", plan.orgId)
        .eq("producer_key", plan.producerKey)
        .limit(1);
    const prior = ((existing.data ?? []) as Array<{ id: string; location_boundary: string[] | null; boundary_mode: string }>)[0];

    if (prior) {
        const had = [...(prior.location_boundary ?? [])].sort();
        const want = [...plan.locationBoundary].sort();
        if (prior.boundary_mode !== plan.boundaryMode || had.join(",") !== want.join(",")) {
            return {
                ok: false,
                code: "boundary_would_broaden",
                detail: "An installation already carries this producer key with a different boundary; converting again would change an external caller's reach.",
            };
        }
        const refs = await writeRefs(supabase, prior.id, plan);
        return refs.ok
            ? { ok: true, installationId: prior.id, created: false, refsWritten: refs.written }
            : { ok: false, code: "write_failed", detail: refs.detail };
    }

    const inserted = await supabase
        .from("app_installations")
        .insert({
            application_id: applicationId,
            org_id: plan.orgId,
            producer_key: plan.producerKey,
            granted_scopes: plan.grantedScopes,
            boundary_mode: plan.boundaryMode,
            location_boundary: plan.locationBoundary,
            status: "active",
        })
        .select("id")
        .single();
    if (inserted.error) return { ok: false, code: "write_failed", detail: inserted.error.message };
    const installationId = (inserted.data as { id: string }).id;

    const refs = await writeRefs(supabase, installationId, plan);
    return refs.ok
        ? { ok: true, installationId, created: true, refsWritten: refs.written }
        : { ok: false, code: "write_failed", detail: refs.detail };
}

async function writeRefs(
    supabase: SupabaseClient,
    installationId: string,
    plan: ConversionPlan,
): Promise<{ ok: true; written: number } | { ok: false; detail: string }> {
    let written = 0;
    for (const ref of plan.resourceRefs) {
        const seen = await supabase
            .from("integration_resource_refs")
            .select("id")
            .eq("installation_id", installationId)
            .eq("resource_type", ref.resource_type)
            .eq("external_id", ref.external_id)
            .limit(1);
        if (((seen.data ?? []) as Array<{ id: string }>).length > 0) continue;
        const { error } = await supabase.from("integration_resource_refs").insert({
            installation_id: installationId,
            org_id: plan.orgId,
            resource_type: ref.resource_type,
            external_id: ref.external_id,
            child_customer_member_id: ref.child_customer_member_id,
            location_id: ref.location_id,
            status: "active",
        });
        if (error) return { ok: false, detail: error.message };
        written += 1;
    }
    return { ok: true, written };
}
