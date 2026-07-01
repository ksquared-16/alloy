import { describe, it, expect } from "vitest";
import {
    createParentPacketFromTemplate,
    type ParentPacketTemplateDeps,
} from "@/lib/pos/packet/createParentPacketFromTemplate";
import type { MintPacketPublicLinkResult } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";

interface FakeState {
    form: { id: string; name: string | null; key: string } | null;
    versions: Array<{ id: string; version_number: number; status: string }>;
    packetKeys: Set<string>;
    failPacketInsert?: boolean;
    failItemInsert?: boolean;
    linkResult?: MintPacketPublicLinkResult;
}

function makeFakeDeps(state: FakeState) {
    const calls = {
        published: [] as string[],
        packetDefs: [] as { key: string; name: string; metadata: Record<string, unknown> }[],
        items: [] as { packetDefinitionId: string; pinnedVersionId: string | null; sequenceIndex: number }[],
        mintBodies: [] as Record<string, unknown>[],
    };
    const deps: ParentPacketTemplateDeps = {
        async getFormDefinition() {
            return state.form;
        },
        async listVersions() {
            return state.versions;
        },
        async publishVersion(_org, versionId) {
            calls.published.push(versionId);
            // mark as published in state so re-reads would see it
            const v = state.versions.find((x) => x.id === versionId);
            if (v) v.status = "published";
            return { ok: true };
        },
        async listPacketDefinitionKeys() {
            return state.packetKeys;
        },
        async insertPacketDefinition({ key, name, metadata }) {
            if (state.failPacketInsert) throw new Error("insert def boom");
            calls.packetDefs.push({ key, name, metadata });
            return { id: "pkt-1" };
        },
        async insertPacketItem({ packetDefinitionId, pinnedVersionId, sequenceIndex }) {
            if (state.failItemInsert) throw new Error("insert item boom");
            calls.items.push({ packetDefinitionId, pinnedVersionId, sequenceIndex });
        },
        async mintPacketLink({ body }) {
            calls.mintBodies.push(body);
            return (
                state.linkResult ?? {
                    ok: true,
                    data: {
                        plaintext_token: "tok_abc",
                        embed_path: "/forms/embed/tok_abc",
                        embed_url: "https://app.test/forms/embed/tok_abc",
                        packet_definition_id: "pkt-1",
                        first_step_sequence_index: 0,
                    },
                }
            );
        },
    };
    return { deps, calls };
}

const baseInput = { orgId: "org1", formDefinitionId: "form-1", publishedByUserId: "user-1", embedBaseUrl: "https://app.test" };

describe("createParentPacketFromTemplate", () => {
    it("uses an existing published version without publishing", async () => {
        const { deps, calls } = makeFakeDeps({
            form: { id: "form-1", name: "MO500", key: "mo500" },
            versions: [
                { id: "v1", version_number: 1, status: "archived" },
                { id: "v2", version_number: 2, status: "published" },
            ],
            packetKeys: new Set(),
        });
        const res = await createParentPacketFromTemplate(deps, baseInput);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.alreadyPublished).toBe(true);
        expect(res.publishedVersionId).toBe("v2");
        expect(calls.published).toEqual([]);
        expect(res.publicLink.token).toBe("tok_abc");
        expect(res.publicLink.embedUrl).toBe("https://app.test/forms/embed/tok_abc");
    });

    it("publishes the latest draft when no published version exists", async () => {
        const { deps, calls } = makeFakeDeps({
            form: { id: "form-1", name: "MO500", key: "mo500" },
            versions: [
                { id: "v1", version_number: 1, status: "draft" },
                { id: "v2", version_number: 2, status: "draft" },
            ],
            packetKeys: new Set(),
        });
        const res = await createParentPacketFromTemplate(deps, baseInput);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.alreadyPublished).toBe(false);
        expect(res.publishedVersionId).toBe("v2"); // latest draft
        expect(calls.published).toEqual(["v2"]);
    });

    it("creates ONE follow-latest step and mints a link with the packet id", async () => {
        const { deps, calls } = makeFakeDeps({
            form: { id: "form-1", name: "MO500", key: "mo500" },
            versions: [{ id: "v2", version_number: 2, status: "published" }],
            packetKeys: new Set(),
        });
        await createParentPacketFromTemplate(deps, baseInput);
        expect(calls.items).toHaveLength(1);
        expect(calls.items[0]).toMatchObject({ packetDefinitionId: "pkt-1", pinnedVersionId: null, sequenceIndex: 0 });
        expect(calls.mintBodies[0]).toMatchObject({ packet_definition_id: "pkt-1" });
    });

    it("defaults the packet name and allocates a non-colliding key", async () => {
        const { deps, calls } = makeFakeDeps({
            form: { id: "form-1", name: "MO500", key: "mo500" },
            versions: [{ id: "v2", version_number: 2, status: "published" }],
            packetKeys: new Set(["mo500_parent_packet"]),
        });
        await createParentPacketFromTemplate(deps, baseInput);
        expect(calls.packetDefs[0].name).toBe("MO500 — Parent Packet");
        expect(calls.packetDefs[0].key).not.toBe("mo500_parent_packet"); // de-duped
        expect(calls.packetDefs[0].metadata.source_form_definition_id).toBe("form-1");
    });

    it("forwards launch_from_entity into the mint body", async () => {
        const { deps, calls } = makeFakeDeps({
            form: { id: "form-1", name: "MO500", key: "mo500" },
            versions: [{ id: "v2", version_number: 2, status: "published" }],
            packetKeys: new Set(),
        });
        await createParentPacketFromTemplate(deps, {
            ...baseInput,
            launchFromEntity: { entity_type: "opportunity", entity_id: "opp-9", prefill_enabled: true },
        });
        expect(calls.mintBodies[0].launch_from_entity).toEqual({ entity_type: "opportunity", entity_id: "opp-9", prefill_enabled: true });
    });

    it("returns not_found when the form is missing", async () => {
        const { deps } = makeFakeDeps({ form: null, versions: [], packetKeys: new Set() });
        const res = await createParentPacketFromTemplate(deps, baseInput);
        expect(res).toMatchObject({ ok: false, code: "not_found" });
    });

    it("errors no_publishable_version when there is nothing to publish", async () => {
        const { deps } = makeFakeDeps({
            form: { id: "form-1", name: "MO500", key: "mo500" },
            versions: [{ id: "v1", version_number: 1, status: "archived" }],
            packetKeys: new Set(),
        });
        const res = await createParentPacketFromTemplate(deps, baseInput);
        expect(res).toMatchObject({ ok: false, code: "no_publishable_version" });
    });

    it("respects autopublish=false", async () => {
        const { deps, calls } = makeFakeDeps({
            form: { id: "form-1", name: "MO500", key: "mo500" },
            versions: [{ id: "v1", version_number: 1, status: "draft" }],
            packetKeys: new Set(),
        });
        const res = await createParentPacketFromTemplate(deps, { ...baseInput, autopublish: false });
        expect(res).toMatchObject({ ok: false, code: "no_publishable_version" });
        expect(calls.published).toEqual([]);
    });

    it("surfaces a link_failed error from the minter", async () => {
        const { deps } = makeFakeDeps({
            form: { id: "form-1", name: "MO500", key: "mo500" },
            versions: [{ id: "v2", version_number: 2, status: "published" }],
            packetKeys: new Set(),
            linkResult: { ok: false, status: 400, message: "Packet definition has no steps" },
        });
        const res = await createParentPacketFromTemplate(deps, baseInput);
        expect(res).toMatchObject({ ok: false, code: "link_failed", message: "Packet definition has no steps" });
    });

    it("maps a packet insert failure to packet_create_failed", async () => {
        const { deps } = makeFakeDeps({
            form: { id: "form-1", name: "MO500", key: "mo500" },
            versions: [{ id: "v2", version_number: 2, status: "published" }],
            packetKeys: new Set(),
            failPacketInsert: true,
        });
        const res = await createParentPacketFromTemplate(deps, baseInput);
        expect(res).toMatchObject({ ok: false, code: "packet_create_failed" });
    });
});
