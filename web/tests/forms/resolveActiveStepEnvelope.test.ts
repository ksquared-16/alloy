import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActiveStepEnvelope } from "@/lib/forms/packets/formPacketService";

const hoisted = vi.hoisted(() => ({
    mockLoadPublished: vi.fn(),
}));

vi.mock("@/lib/public/forms/loadPublishedFormEnvelope", () => ({
    loadPublishedFormEnvelope: (...args: unknown[]) => hoisted.mockLoadPublished(...args),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const SESS = "ssssssss-ssss-4sss-8sss-ssssssssssss";
const supabase = {} as SupabaseClient;

const activeItem = {
    id: "sess-item",
    packet_session_id: SESS,
    packet_item_id: "def-item",
    sequence_index: 0,
    status: "active",
    form_submission_id: "sub-1",
};

const defItems = [
    {
        id: "def-item",
        sequence_index: 0,
        form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        pinned_form_definition_version_id: "legacy-pin-version",
    },
];

describe("resolveActiveStepEnvelope", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        hoisted.mockLoadPublished.mockResolvedValue({
            formDefinitionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            formDefinitionVersionId: "resolved-ver",
            schemaJson: { schema_version: 1, title: "T", sections: [], fields: [] },
            pdfMappingJson: null,
            formKey: "k",
            formName: "N",
            formKind: "center",
        });
    });

    it("passes null pin when followLatestPublished so latest published wins over row pin", async () => {
        await resolveActiveStepEnvelope(supabase, ORG, activeItem, defItems, {
            followLatestPublished: true,
        });
        expect(hoisted.mockLoadPublished).toHaveBeenCalledWith(
            supabase,
            ORG,
            "ffffffff-ffff-4fff-8fff-ffffffffffff",
            null
        );
    });

    it("passes row pinned_form_definition_version_id when followLatestPublished is false", async () => {
        await resolveActiveStepEnvelope(supabase, ORG, activeItem, defItems);
        expect(hoisted.mockLoadPublished).toHaveBeenCalledWith(
            supabase,
            ORG,
            "ffffffff-ffff-4fff-8fff-ffffffffffff",
            "legacy-pin-version"
        );
    });

    it("passes null pin when row unpinned and followLatestPublished false", async () => {
        const unpinned = [{ ...defItems[0], pinned_form_definition_version_id: null }];
        await resolveActiveStepEnvelope(supabase, ORG, activeItem, unpinned);
        expect(hoisted.mockLoadPublished).toHaveBeenCalledWith(
            supabase,
            ORG,
            "ffffffff-ffff-4fff-8fff-ffffffffffff",
            null
        );
    });
});
