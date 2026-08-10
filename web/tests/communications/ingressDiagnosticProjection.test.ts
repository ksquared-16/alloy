/**
 * Support can find an unattributable message without being able to read it.
 *
 * `communication_inbound_ingress` holds real messages from real people whose
 * owning organization is unknown. Support needs enough to find a stuck message and
 * spot a STOP that is holding sends; it must not become a way to read a parent's
 * words, or to learn another tenant's configuration from a cross-org ambiguity.
 *
 * These are the leak-prevention guarantees, tested against the projection itself
 * rather than asserted about the shape of a route handler.
 */
import { describe, expect, it } from "vitest";
import {
    maskIngressAddress,
    projectIngressDiagnosticRow,
} from "@/lib/communications/ingress/ingressDiagnosticProjection";

const row = {
    id: "ing-1",
    provider: "twilio",
    channel: "sms",
    provider_message_id: "SM_abc123",
    from_address: "+15551234567",
    to_address: "+15559876543",
    received_at: "2026-08-10T12:00:00Z",
    routing_disposition: "cross_org_ambiguous",
    compliance_keyword: "stop",
    compliance_hold_active: true,
    candidate_binding_ids: ["bind-a", "bind-b"],
    candidate_org_ids: ["org-a", "org-b"],
    body: "STOP texting me",
};

describe("ingress diagnostic projection", () => {
    it("never exposes the message body", () => {
        const out = projectIngressDiagnosticRow(row);

        expect(JSON.stringify(out)).not.toContain("STOP texting me");
        expect(out).not.toHaveProperty("body");
    });

    it("never exposes candidate org or binding ids", () => {
        // In a cross-org ambiguity these identify another tenant's configuration.
        const out = projectIngressDiagnosticRow(row);
        const serialized = JSON.stringify(out);

        expect(serialized).not.toContain("org-a");
        expect(serialized).not.toContain("bind-a");
        expect(out).not.toHaveProperty("candidate_org_ids");
        expect(out).not.toHaveProperty("candidate_binding_ids");
    });

    it("reports candidate counts, which are enough to diagnose", () => {
        const out = projectIngressDiagnosticRow(row);

        expect(out.candidate_org_count).toBe(2);
        expect(out.candidate_binding_count).toBe(2);
    });

    it("reduces addresses to last four digits", () => {
        const out = projectIngressDiagnosticRow(row);

        expect(out.sender).toBe("…4567");
        expect(out.destination).toBe("…6543");
        expect(JSON.stringify(out)).not.toContain("5551234567");
    });

    it("answers the three questions support actually has", () => {
        // What arrived, why it is stuck, and whether it is holding sends.
        const out = projectIngressDiagnosticRow(row);

        expect(out.provider_message_id).toBe("SM_abc123");
        expect(out.routing_disposition).toBe("cross_org_ambiguous");
        expect(out.compliance_hold_active).toBe(true);
        expect(out.compliance_keyword).toBe("stop");
        expect(out.received_at).toBe("2026-08-10T12:00:00Z");
    });

    it("does not invent a hold that is not set", () => {
        const out = projectIngressDiagnosticRow({ ...row, compliance_hold_active: null });
        expect(out.compliance_hold_active).toBe(false);
    });

    it("masks unusable addresses instead of leaking a fragment", () => {
        expect(maskIngressAddress(null)).toBe("—");
        expect(maskIngressAddress("")).toBe("—");
        expect(maskIngressAddress("+12")).toBe("—");
    });

    it("tolerates a missing candidate array", () => {
        const out = projectIngressDiagnosticRow({ id: "ing-2" });
        expect(out.candidate_org_count).toBe(0);
        expect(out.candidate_binding_count).toBe(0);
    });
});
