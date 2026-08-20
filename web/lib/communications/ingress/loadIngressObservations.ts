/**
 * What Alloy has actually OBSERVED about inbound email, per binding.
 *
 * Receiving readiness is answered from arrival, not from configuration (see
 * `bindingReadiness.ts`). Two things count as arrival evidence and this module
 * gathers both:
 *
 *   1. `communication_ingress_routes.last_inbound_at` — stamped when a message
 *      is attributed through that route. The fast path, and the one that carries
 *      the destination.
 *   2. the newest INBOUND email message on the binding in canonical history.
 *
 * The second exists so that introducing the route model does not report a
 * direct-delivery arrangement that has been receiving mail for months as
 * unproven. A message that genuinely arrived is evidence whichever table
 * recorded it; refusing to count it would be a pessimistic lie rather than an
 * optimistic one, but still not what happened.
 *
 * Everything here is org-scoped at the query. A binding id alone never reaches
 * across a tenant boundary.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { IngressRouteObservation } from "@/lib/communications/bindingReadiness";

export type IngressObservations = {
    /** The delivery route on file for a binding, by binding id. */
    routeByBindingId: Map<string, IngressRouteObservation>;
    /** Newest observed inbound per binding id, ISO. */
    observedInboundAtByBindingId: Map<string, string>;
};

export const EMPTY_INGRESS_OBSERVATIONS: IngressObservations = {
    routeByBindingId: new Map(),
    observedInboundAtByBindingId: new Map(),
};

function newer(a: string | undefined, b: string | null | undefined): string | undefined {
    const right = String(b ?? "").trim();
    if (!right) return a;
    if (!a) return right;
    return right > a ? right : a;
}

export async function loadIngressObservations(
    supabase: SupabaseClient,
    orgId: string,
    bindingIds: string[]
): Promise<IngressObservations> {
    const ids = [...new Set(bindingIds.filter((id) => String(id ?? "").trim()))];
    if (ids.length === 0) return EMPTY_INGRESS_OBSERVATIONS;

    const routeByBindingId = new Map<string, IngressRouteObservation>();
    const observedInboundAtByBindingId = new Map<string, string>();

    const { data: routes } = await supabase
        .from("communication_ingress_routes")
        .select("communication_provider_binding_id, destination, last_inbound_at")
        .eq("org_id", orgId)
        .in("communication_provider_binding_id", ids);

    for (const raw of routes ?? []) {
        const row = raw as {
            communication_provider_binding_id: string;
            destination: string;
            last_inbound_at: string | null;
        };
        const bindingId = String(row.communication_provider_binding_id);
        routeByBindingId.set(bindingId, {
            destination: String(row.destination ?? ""),
            lastInboundAt: row.last_inbound_at ?? null,
        });
        const stamped = newer(observedInboundAtByBindingId.get(bindingId), row.last_inbound_at);
        if (stamped) observedInboundAtByBindingId.set(bindingId, stamped);
    }

    // Canonical history. Ordered newest-first and capped: only the most recent
    // arrival per binding is needed, and the cap keeps a busy tenant from pulling
    // its whole inbox to answer a configuration page.
    const { data: messages } = await supabase
        .from("communication_messages")
        .select("communication_provider_binding_id, created_at")
        .eq("org_id", orgId)
        .eq("channel", "email")
        .eq("direction", "inbound")
        .in("communication_provider_binding_id", ids)
        .order("created_at", { ascending: false })
        .limit(200);

    for (const raw of messages ?? []) {
        const row = raw as { communication_provider_binding_id: string | null; created_at: string | null };
        const bindingId = String(row.communication_provider_binding_id ?? "").trim();
        if (!bindingId) continue;
        const observed = newer(observedInboundAtByBindingId.get(bindingId), row.created_at);
        if (observed) observedInboundAtByBindingId.set(bindingId, observed);
    }

    return { routeByBindingId, observedInboundAtByBindingId };
}
