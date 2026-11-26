/**
 * What a support engineer may see about an inbound message Alloy could not attribute.
 *
 * The ingress table holds real messages from real people whose owning organization
 * is unknown. Diagnostics must be enough to find a stuck message and identify a
 * STOP holding sends — and nothing more. Two things are deliberately unreachable
 * from this projection:
 *
 *   - the message BODY, because a parent's words are not diagnostic data
 *   - candidate ORG and BINDING ids, because in a cross-org ambiguity those
 *     identify other tenants' configuration
 *
 * Kept as a pure function so those guarantees are testable rather than asserted
 * about the shape of a route handler.
 */

export type IngressDiagnosticSource = {
    id: string;
    provider?: string | null;
    channel?: string | null;
    provider_message_id?: string | null;
    from_address?: string | null;
    to_address?: string | null;
    received_at?: string | null;
    routing_disposition?: string | null;
    compliance_keyword?: string | null;
    compliance_hold_active?: boolean | null;
    candidate_binding_ids?: unknown;
    candidate_org_ids?: unknown;
    /** Present on the row; must never reach the projection. */
    body?: string | null;
};

export type IngressDiagnosticRow = {
    id: string;
    provider: string | null;
    channel: string | null;
    provider_message_id: string | null;
    sender: string;
    destination: string;
    received_at: string | null;
    routing_disposition: string | null;
    compliance_keyword: string | null;
    compliance_hold_active: boolean;
    candidate_binding_count: number;
    candidate_org_count: number;
};

/** Last four digits only — enough to correlate with a provider console, not to contact anyone. */
export function maskIngressAddress(raw: unknown): string {
    const digits = String(raw ?? "").replace(/\D/g, "");
    return digits.length >= 4 ? `…${digits.slice(-4)}` : "—";
}

function countOf(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
}

export function projectIngressDiagnosticRow(row: IngressDiagnosticSource): IngressDiagnosticRow {
    return {
        id: row.id,
        provider: row.provider ?? null,
        channel: row.channel ?? null,
        provider_message_id: row.provider_message_id ?? null,
        sender: maskIngressAddress(row.from_address),
        destination: maskIngressAddress(row.to_address),
        received_at: row.received_at ?? null,
        routing_disposition: row.routing_disposition ?? null,
        compliance_keyword: row.compliance_keyword ?? null,
        compliance_hold_active: row.compliance_hold_active === true,
        candidate_binding_count: countOf(row.candidate_binding_ids),
        candidate_org_count: countOf(row.candidate_org_ids),
    };
}
