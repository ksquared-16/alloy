/**
 * WORK THE PROCESS LAUNCHED IS WORK PROCESSING CAN SEE.
 *
 * Found while certifying the Processing lineage under a published governing revision. A stage whose
 * requirement NAMES an existing packet — which is the model the real Enrollment configuration uses —
 * reaches `launchParticipantEnrollment`, mints a link stamped with the governing revision, creates
 * the session, and the family completes it. Then nothing happens:
 * `shouldOpenProcessingCaseForPacket` finds no `pos_connected` marker on the packet definition, the
 * session or the link, and refuses to open a case.
 *
 * `ensureRequirementDerivedPacketDefinition` stamps the marker on a packet it CREATES, and says why
 * in its own comment. The packet-requirement model never reaches that code, so the marker had no
 * home. It now lives on the link the launcher mints, which is the only artifact that exists
 * *because* a published revision required it.
 *
 * THE GATE ITSELF IS NOT WEAKENED. These tests assert that too, because the tempting fix — letting
 * any completed packet open Processing — is the one thing the Director decision forbids.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shouldOpenProcessingCaseForPacket } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromPacketCompletionSafe";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const LAUNCHER = "lib/enrollment/participantLaunch/launchParticipantEnrollment.ts";
const GATE = "lib/pos/processingCase/maybeOpenProcessingCaseFromPacketCompletionSafe.ts";

/** The metadata a Studio-authored packet actually carries — measured, not imagined. */
const STUDIO_PACKET = { created_via: "adminV2_packet_definitions" };

describe("the gate still refuses everything it refused before", () => {
    it("a Studio packet sent from its own Distribution panel opens no Processing work", () => {
        expect(
            shouldOpenProcessingCaseForPacket({
                packetDefinitionMetadata: STUDIO_PACKET,
                packetSessionMetadata: {},
                // A Distribution-panel link: no process provenance of any kind.
                publicLinkMetadata: { label: "ZZ CERT Capability Packet link", intake: false },
            }),
        ).toBe(false);
    });

    it("an empty surface opens nothing", () => {
        expect(
            shouldOpenProcessingCaseForPacket({
                packetDefinitionMetadata: {},
                packetSessionMetadata: {},
                publicLinkMetadata: {},
            }),
        ).toBe(false);
    });

    it("a governing revision id ALONE is not a licence — the marker is the gate", () => {
        // Deliberate: the fix must not be "trust anything that mentions a revision".
        expect(
            shouldOpenProcessingCaseForPacket({
                packetDefinitionMetadata: STUDIO_PACKET,
                packetSessionMetadata: {},
                publicLinkMetadata: {
                    created_via: "enrollment_start",
                    derived_from_business_process_revision_id: "8565c745-a9d4-4d04-a519-915d5da2d706",
                },
            }),
        ).toBe(false);
    });
});

describe("a process-governed launch declares itself", () => {
    it("the minted link carries the marker beside the governing revision", () => {
        /*
         * BOUND TO THE MINT'S OWN METADATA LITERAL.
         *
         * An earlier version of this test sliced from the first occurrence of
         * `mintPacketPublicLinkForAdmin` — which is the IMPORT, at the top of the file — so the
         * slice was almost the whole module and the resume block's own `pos_connected: true`
         * satisfied it. Deleting the marker from the mint left the test green. The assertion is
         * now the literal sequence the mint writes, so removing any part of it fails.
         */
        const src = read(LAUNCHER);
        expect(src).toMatch(
            /created_via: "enrollment_start",\s*\n\s*derived_from_business_process_revision_id: revisionId,\s*\n\s*stage_key: stageKey,[\s\S]{0,1600}?\n\s*pos_connected: true,/,
        );
    });

    it("and the gate then admits exactly that link", () => {
        expect(
            shouldOpenProcessingCaseForPacket({
                packetDefinitionMetadata: STUDIO_PACKET,
                packetSessionMetadata: {},
                publicLinkMetadata: {
                    created_via: "enrollment_start",
                    derived_from_business_process_revision_id: "8565c745-a9d4-4d04-a519-915d5da2d706",
                    stage_key: "enrolling",
                    pos_connected: true,
                },
            }),
        ).toBe(true);
    });

    it("a session resumed on an older link is corrected rather than left invisible", () => {
        const src = read(LAUNCHER);
        expect(src).toContain("resumedMeta.pos_connected !== true");
        expect(src).toContain("metadata: { ...resumedMeta, pos_connected: true }");
    });

    it("the marker is put on the LINK, not onto the administrator's packet", () => {
        // The referenced packet is an authored asset that may also be sent by hand; stamping it
        // would make every hand-send open Processing, which is the gate's whole point.
        const src = read(LAUNCHER);
        expect(src).not.toMatch(/form_packet_definitions[\s\S]{0,400}pos_connected/);
    });
});

describe("the gate's own shape is unchanged", () => {
    it("it still reads the three metadata homes and nothing else", () => {
        const src = read(GATE);
        expect(src).toContain("isPosConnectedSurface({");
        expect(src).toContain("definitionMetadata: args.packetDefinitionMetadata");
        expect(src).toContain("linkMetadata: args.packetSessionMetadata");
        expect(src).toContain("isPosConnectedMetadata(args.publicLinkMetadata)");
    });

    it("no revision-derived escape hatch was added to it", () => {
        expect(read(GATE)).not.toMatch(/derived_from_business_process_revision_id/);
    });
});
