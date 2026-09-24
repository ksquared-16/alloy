/**
 * A COMPLETED ENROLLMENT PACKET HAD NOWHERE TO GO.
 *
 * The on-ramp from packet completion to a Processing Case is marker-gated, and the doctrine has
 * always said the marker may ride the packet definition, the version, OR the public link. The
 * decision only ever read the first two — so the only reachable home was the packet DEFINITION's
 * metadata, which `POST /api/admin/forms/packet-definitions` writes once at creation and no route
 * updates.
 *
 * MEASURED on the certification stack: both enrollment packet definitions carry exactly
 * `{"created_via":"adminV2_packet_definitions"}`. Every enrollment return therefore completed,
 * rendered its artifact, and opened nothing — no case, no proposals, no operator review.
 *
 * A packet launched from the enrollment route is an operator sending a named child's paperwork to a
 * named family and expecting to review what comes back. The link says so; every other packet is
 * untouched and still declined.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { shouldOpenProcessingCaseForPacket } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromPacketCompletionSafe";

const REAL_DEFINITION_METADATA = { created_via: "adminV2_packet_definitions" };

describe("which packets open a Processing case", () => {
    it("declines a packet nothing has marked — legacy behaviour, unchanged", () => {
        expect(
            shouldOpenProcessingCaseForPacket({
                packetDefinitionMetadata: REAL_DEFINITION_METADATA,
                packetSessionMetadata: {},
            }),
        ).toBe(false);
    });

    it("opens for a link the enrollment launch marked, with the definition unchanged", () => {
        expect(
            shouldOpenProcessingCaseForPacket({
                // Exactly what the certification stack holds today.
                packetDefinitionMetadata: REAL_DEFINITION_METADATA,
                packetSessionMetadata: {},
                publicLinkMetadata: { form_context_mode: "packet", pos_connected: true },
            }),
        ).toBe(true);
    });

    it("still opens for a definition an operator marked directly", () => {
        expect(shouldOpenProcessingCaseForPacket({ packetDefinitionMetadata: { pos_connected: true } })).toBe(true);
    });

    it("declines a link that is merely an enrollment launch without the marker", () => {
        expect(
            shouldOpenProcessingCaseForPacket({
                packetDefinitionMetadata: REAL_DEFINITION_METADATA,
                publicLinkMetadata: { form_context_mode: "packet", source_entity_type: "opportunity" },
            }),
        ).toBe(false);
    });
});

describe("the on-ramp actually reads the link", () => {
    const src = readFileSync(
        new URL("../../lib/pos/processingCase/maybeOpenProcessingCaseFromPacketCompletionSafe.ts", import.meta.url)
            .pathname,
        "utf8",
    );

    it("loads the link the session was started from", () => {
        expect(src).toContain("started_via_public_link_id");
        expect(src).toContain('from("form_public_links")');
    });

    it("passes it into the decision", () => {
        const at = src.indexOf("shouldOpenProcessingCaseForPacket({");
        expect(at).toBeGreaterThan(0);
        expect(src.slice(at, at + 300)).toContain("publicLinkMetadata");
    });

    it("opens through the existing service, not a new one", () => {
        expect(src).toContain("openProcessingCaseFromSource");
        expect(src).toContain('sourceKind: "form_packet_session"');
    });
});

describe("the enrollment launch marks what it mints", () => {
    const route = readFileSync(
        new URL("../../app/api/admin/opportunities/[id]/enrollment-packet-launch/route.ts", import.meta.url).pathname,
        "utf8",
    );

    it("marks the link POS-connected", () => {
        expect(route).toContain("meta.pos_connected = true");
    });

    it("sends the metadata even when the operator added no note", () => {
        // It used to be dropped whenever `meta` was empty, which is the common case.
        expect(route).toContain("metadata: meta,");
        expect(route).not.toContain("...(Object.keys(meta).length ? { metadata: meta } : {})");
    });
});
