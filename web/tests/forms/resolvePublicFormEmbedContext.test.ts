import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    isPacketPublicLinkMetadata,
    resolvePublicFormEmbedContext,
} from "@/lib/public/forms/resolvePublicFormEmbedContext";

const PID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const hoisted = vi.hoisted(() => ({
    mockResolveLink: vi.fn(),
    mockDeriveFks: vi.fn(),
    mockEnsure: vi.fn(),
    mockListDefItems: vi.fn(),
    mockLoadName: vi.fn(),
    mockResolveEnvelope: vi.fn(),
}));

vi.mock("@/lib/public/forms/resolvePublicFormLink", () => ({
    resolvePublicFormLinkByToken: (...args: unknown[]) => hoisted.mockResolveLink(...args),
}));

vi.mock("@/lib/forms/formLaunchFkDerivation", () => ({
    deriveSubmissionFksFromLaunchMetadata: (...args: unknown[]) => hoisted.mockDeriveFks(...args),
}));

vi.mock("@/lib/forms/packets/formPacketService", async (importOriginal) => {
    const orig = await importOriginal<typeof import("@/lib/forms/packets/formPacketService")>();
    return {
        ...orig,
        ensurePacketSessionForPublicLink: (...args: unknown[]) => hoisted.mockEnsure(...args),
        listPacketDefinitionItems: (...args: unknown[]) => hoisted.mockListDefItems(...args),
        loadPacketDefinitionName: (...args: unknown[]) => hoisted.mockLoadName(...args),
        resolveActiveStepEnvelope: (...args: unknown[]) => hoisted.mockResolveEnvelope(...args),
    };
});

const baseLink = {
    linkId: "llllllll-llll-4lll-8lll-llllllllllll",
    orgId: "oooooooo-oooo-4ooo-8ooo-oooooooooooo",
    formDefinitionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    formDefinitionVersionId: "vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv",
    schemaJson: { schema_version: 1, title: "A", sections: [], fields: [] },
    pdfMappingJson: null,
    expiresAt: null,
    allowedEmbedOrigins: null as string[] | null,
    linkMetadata: {} as Record<string, unknown>,
    formKey: "k",
    formName: "Single",
    formKind: "center",
};

describe("resolvePublicFormEmbedContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        hoisted.mockResolveLink.mockResolvedValue({ ok: true as const, value: { ...baseLink } });
        hoisted.mockDeriveFks.mockResolvedValue({
            person_id: null,
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
        });
    });

    it("isPacketPublicLinkMetadata requires packet mode and valid packet_definition_id", () => {
        expect(isPacketPublicLinkMetadata({})).toBe(false);
        expect(isPacketPublicLinkMetadata({ form_context_mode: "packet" })).toBe(false);
        expect(
            isPacketPublicLinkMetadata({ form_context_mode: "packet", packet_definition_id: PID })
        ).toBe(true);
    });

    it("single-form link passes through base schema and null packet fields", async () => {
        const r = await resolvePublicFormEmbedContext({} as SupabaseClient, "tok");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.packet).toBeNull();
        expect(r.value.packetTerminal).toBe(false);
        expect(r.value.schemaJson).toEqual(baseLink.schemaJson);
        expect(hoisted.mockEnsure).not.toHaveBeenCalled();
    });

    it("packet in progress resolves active step envelope and packet meta", async () => {
        hoisted.mockResolveLink.mockResolvedValueOnce({
            ok: true as const,
            value: {
                ...baseLink,
                linkMetadata: { form_context_mode: "packet", packet_definition_id: PID },
            },
        });
        hoisted.mockEnsure.mockResolvedValueOnce({
            session: {
                id: "ssssssss-ssss-4sss-8sss-ssssssssssss",
                status: "in_progress",
                current_sequence_index: 0,
            },
            items: [
                {
                    id: "iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii",
                    status: "active",
                    sequence_index: 0,
                    packet_item_id: "pppppppp-pppp-4ppp-8ppp-pppppppppppp",
                },
            ],
            error: null,
        });
        hoisted.mockLoadName.mockResolvedValueOnce("Enrollment packet");
        hoisted.mockListDefItems.mockResolvedValueOnce({
            data: [
                {
                    id: "pppppppp-pppp-4ppp-8ppp-pppppppppppp",
                    sequence_index: 0,
                    form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                    pinned_form_definition_version_id: null,
                },
            ],
            error: null,
        });
        const stepSchema = { schema_version: 1, title: "Step1", sections: [], fields: [] };
        hoisted.mockResolveEnvelope.mockResolvedValueOnce({
            envelope: {
                formDefinitionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                formDefinitionVersionId: "vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv",
                schemaJson: stepSchema,
                pdfMappingJson: null,
                formKey: "step",
                formName: "Step One",
                formKind: "family",
            },
            error: null,
        });

        const r = await resolvePublicFormEmbedContext({} as SupabaseClient, "tok");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.packetTerminal).toBe(false);
        expect(r.value.schemaJson).toEqual(stepSchema);
        expect(r.value.formName).toBe("Step One");
        expect(r.value.packet).toMatchObject({
            packet_definition_id: PID,
            packet_name: "Enrollment packet",
            current_sequence_index: 0,
            total_steps: 1,
            current_session_item_id: "iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii",
        });
    });

    it("completed packet session yields packetTerminal without schema", async () => {
        hoisted.mockResolveLink.mockResolvedValueOnce({
            ok: true as const,
            value: {
                ...baseLink,
                linkMetadata: { form_context_mode: "packet", packet_definition_id: PID },
            },
        });
        hoisted.mockEnsure.mockResolvedValueOnce({
            session: {
                id: "ssssssss-ssss-4sss-8sss-ssssssssssss",
                status: "completed",
                current_sequence_index: 1,
            },
            items: [
                {
                    id: "a",
                    status: "submitted",
                    sequence_index: 0,
                    packet_item_id: "p1",
                },
                {
                    id: "b",
                    status: "submitted",
                    sequence_index: 1,
                    packet_item_id: "p2",
                },
            ],
            error: null,
        });
        hoisted.mockLoadName.mockResolvedValueOnce("Done");

        const r = await resolvePublicFormEmbedContext({} as SupabaseClient, "tok");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.packetTerminal).toBe(true);
        expect(r.value.schemaJson).toBeNull();
        expect(r.value.packet?.total_steps).toBe(2);
    });
});
