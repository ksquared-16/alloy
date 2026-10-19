/**
 * A MANUAL SHARE IS NEVER AN ENROLLMENT LAUNCH.
 *
 * Staging: a real child still in `new_inquiry` held Enrollment paperwork minted through the manual
 * packet-link path — any packet, caller metadata trusted, no journey, no eligibility, no payer.
 * The requirement-derived Enrollment packet is now minted only by Start Enrollment's launcher; the
 * Enrollment-reserved metadata cannot be injected by a manual caller; authored packets share as before.
 * And a link's payer is honoured only while they belong to the paperwork's own household.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/forms/intake/defaultPublicLinkMetadata", () => ({
    mergePublicLinkMetadataForCreate: vi.fn(async (_s: unknown, p: { clientMetadata: Record<string, unknown> }) => ({ ...p.clientMetadata })),
}));
vi.mock("@/lib/admin/forms/formsAdminDb", () => ({
    dbInsertFormPublicLink: vi.fn(async (_s: unknown, row: Record<string, unknown>) => {
        inserted.rows.push(row);
        return { data: { id: "link-new", ...row }, error: null };
    }),
}));
vi.mock("@/lib/forms/workflow/opportunityEnrollmentPacketProjections", () => ({ emitOpportunityEnrollmentPacketCreatedSafe: vi.fn(async () => ({ error: null })) }));

import { ENROLLMENT_PACKET_NOT_SHAREABLE_CODE, mintPacketPublicLinkForAdmin } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";
import { resolveParticipantPayer } from "@/lib/enrollment/financial/participantEnrollmentPayment";

type Row = Record<string, unknown>;
function fake(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                order: () => api,
                limit: () => api,
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (res: (v: unknown) => void) => res({ data: rows(), error: null }),
            };
            return api;
        },
    };
}

const ORG = "org-1";
const ENROLLMENT_PACKET = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_PACKET = "22222222-2222-4222-8222-222222222222";
const world = () => fake({
    form_packet_definitions: [
        { id: ENROLLMENT_PACKET, org_id: ORG, metadata: { derived_from: "business_process_requirements" } },
        { id: DOCUMENT_PACKET, org_id: ORG, metadata: { created_via: "pos_packet_compose" } },
    ],
    form_packet_items: [
        { packet_definition_id: ENROLLMENT_PACKET, org_id: ORG, form_definition_id: "form-1", pinned_form_definition_version_id: null, sequence_index: 0 },
        { packet_definition_id: DOCUMENT_PACKET, org_id: ORG, form_definition_id: "form-1", pinned_form_definition_version_id: null, sequence_index: 0 },
    ],
    form_definition_versions: [{ id: "v1", org_id: ORG, form_definition_id: "form-1", status: "published" }],
    form_definitions: [{ id: "form-1", org_id: ORG, key: "admissions", metadata: {} }],
});
const mint = (packet: string, extra: Row = {}, purpose?: "enrollment_start") =>
    mintPacketPublicLinkForAdmin({ supabase: world() as never, orgId: ORG, embedBaseUrl: null, body: { packet_definition_id: packet, ...extra }, ...(purpose ? { purpose } : {}) });

beforeEach(() => { inserted.rows = []; });

describe("the Enrollment packet is sent only by Start Enrollment", () => {
    it("a manual share of the Enrollment packet is refused, and no link is written", async () => {
        const r = await mint(ENROLLMENT_PACKET, { launch_from_entity: undefined });
        expect(r.ok).toBe(false);
        expect(!r.ok && r.status).toBe(409);
        expect(!r.ok && r.code).toBe(ENROLLMENT_PACKET_NOT_SHAREABLE_CODE);
        expect(inserted.rows).toEqual([]);
    });

    it("forged Enrollment provenance in the body does not unlock it", async () => {
        const r = await mint(ENROLLMENT_PACKET, { metadata: { created_via: "enrollment_start", purpose: "enrollment_start" } });
        expect(r.ok).toBe(false);
        expect(inserted.rows).toEqual([]);
    });

    it("Start Enrollment's launcher still mints it, with its Enrollment provenance intact", async () => {
        const r = await mint(ENROLLMENT_PACKET, { metadata: { created_via: "enrollment_start", stage_key: "enrolling", recipient_person_id: "p-parent" } }, "enrollment_start");
        expect(r.ok).toBe(true);
        expect(inserted.rows[0]!.metadata).toMatchObject({ created_via: "enrollment_start", stage_key: "enrolling", recipient_person_id: "p-parent" });
    });
});

describe("a document packet shares as before — without Enrollment-reserved metadata", () => {
    it("is minted, keeps its own provenance, and cannot carry a stage, payer, revision pin or journey", async () => {
        const r = await mint(DOCUMENT_PACKET, { metadata: {
            created_via: "pos_packet_compose", note: "kept",
            stage_key: "enrolling", recipient_person_id: "p-other-family", derived_from_business_process_revision_id: "rev-1", process_instance_id: "pi-1",
        } });
        expect(r.ok).toBe(true);
        const meta = inserted.rows[0]!.metadata as Row;
        expect(meta).toMatchObject({ created_via: "pos_packet_compose", note: "kept" });
        for (const k of ["stage_key", "recipient_person_id", "derived_from_business_process_revision_id", "process_instance_id"]) expect(meta).not.toHaveProperty(k);
    });

    it("cannot claim to be an Enrollment launch", async () => {
        await mint(DOCUMENT_PACKET, { metadata: { created_via: "enrollment_start" } });
        expect(inserted.rows[0]!.metadata).not.toHaveProperty("created_via");
    });
});

describe("a link's payer is honoured only inside the paperwork's own household", () => {
    const payerWorld = (linkedHousehold: string | null) => fake({
        form_public_links: [{ id: "link-1", org_id: ORG, metadata: { recipient_person_id: "p-parent" } }],
        persons: [{ id: "p-parent", org_id: ORG, first_name: "Pat", last_name: "Parent" }],
        customer_persons: linkedHousehold ? [{ org_id: ORG, customer_id: linkedHousehold, person_id: "p-parent", role_type: "primary_contact" }] : [],
    });

    it("the household's own contact is the payer", async () => {
        expect(await resolveParticipantPayer(payerWorld("house-a") as never, { orgId: ORG, linkId: "link-1", customerId: "house-a" })).toEqual({ personId: "p-parent", name: "Pat Parent" });
    });

    it("a person from another household is not offered as payer", async () => {
        expect(await resolveParticipantPayer(payerWorld("house-b") as never, { orgId: ORG, linkId: "link-1", customerId: "house-a" })).toBeNull();
        expect(await resolveParticipantPayer(payerWorld(null) as never, { orgId: ORG, linkId: "link-1", customerId: "house-a" })).toBeNull();
    });
});
