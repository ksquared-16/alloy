import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEND ENROLLMENT PAPERWORK — one operator intent over owners that already exist.
 *
 * Every guard here is about a boundary that, if it moved, would quietly recreate the thing this
 * replaced: an operator choosing a packet, a link copied by hand, or a second enrollment created by
 * pressing Send twice.
 */

const mockStart = vi.fn();
vi.mock("@/lib/records/startEnrollmentService", () => ({
    startEnrollment: (...a: unknown[]) => mockStart(...a),
}));
vi.mock("@/lib/publicAppUrl", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/publicAppUrl")>();
    return { ...actual, resolvePublicAppOrigin: () => ({ ok: true, origin: "https://school.example" }) };
});

import { prepareEnrollmentPaperwork } from "@/lib/enrollment/paperwork/sendEnrollmentPaperwork";
import { orderEnrollmentPaperworkCandidates } from "@/lib/enrollment/paperwork/enrollmentPaperworkRecipient";
import { buildEnrollmentPaperworkMessage } from "@/lib/enrollment/paperwork/enrollmentPaperworkContent";
import { seedFromEnrollmentPaperworkDetail } from "@/lib/enrollment/paperwork/useEnrollmentPaperworkComposeSeed";
import { sendEnrollmentPaperworkAction } from "@/lib/adminV2/actions/definitions/sendEnrollmentPaperworkAction";

const ORG = "11111111-1111-4111-8111-111111111111";
const CHILD = "aaaaaaaa-0000-4000-8000-00000000000a";
const MUM = "bbbbbbbb-0000-4000-8000-00000000000b";
const GRAN = "bbbbbbbb-0000-4000-8000-00000000000c";

const WEB = process.cwd();
const code = (rel: string) =>
    readFileSync(path.join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

/** Enough of Supabase for the two reads the prepare makes after the launch. */
function supabaseWith(world: {
    child?: Record<string, unknown> | null;
    relationships?: Array<{ id: string; person_id: string; priority: number | null }>;
    roles?: Array<{ relationship_id: string; role_key: string }>;
    persons?: Array<Record<string, unknown>>;
}) {
    return {
        from(table: string) {
            const b: Record<string, unknown> = {};
            b.select = () => b;
            b.eq = () => b;
            b.in = () => b;
            b.order = () => b;
            b.maybeSingle = () =>
                Promise.resolve({ data: table === "customer_members" ? (world.child ?? null) : null, error: null });
            b.then = (resolve: (r: { data: unknown; error: unknown }) => void) => {
                if (table === "person_child_relationships") resolve({ data: world.relationships ?? [], error: null });
                else if (table === "person_child_relationship_roles") resolve({ data: world.roles ?? [], error: null });
                else if (table === "persons") resolve({ data: world.persons ?? [], error: null });
                else resolve({ data: [], error: null });
            };
            return b;
        },
    } as never;
}

const launched = (over: Record<string, unknown> = {}) => ({
    processInstanceId: "pi-1",
    customerMemberId: CHILD,
    customerId: "cust-1",
    opportunityId: null,
    enrollmentParticipationId: "ocm-1",
    participationCreated: false,
    contextOutcome: "context_free",
    reused: false,
    participantLaunch: {
        realized: true,
        value: {
            processInstanceId: "pi-1",
            sessionId: "sess-1",
            packetDefinitionId: "packet-enrollment-2026",
            publicLinkId: "link-1",
            stageKey: "enrolling",
            businessProcessRevisionId: "rev-34",
            participantPath: "/forms/embed/tok123",
            outcome: "created",
        },
    },
    ...over,
});

const world = {
    child: { id: CHILD, first_name: "Touree", display_name: "Touree Disposable0913" },
    relationships: [{ id: "rel-mum", person_id: MUM, priority: 1 }],
    roles: [{ relationship_id: "rel-mum", role_key: "parent" }],
    persons: [{ id: MUM, full_name: "Dana Rivera", email: "dana@example.com", phone: null }],
};

beforeEach(() => mockStart.mockReset());

describe("the send composes the start; it never replaces it", () => {
    it("delegates to enrollment.start and reports the episode it created or resumed", async () => {
        mockStart.mockResolvedValue(launched());
        const result = await prepareEnrollmentPaperwork(supabaseWith(world), {
            orgId: ORG,
            customerMemberId: CHILD,
        });
        expect(mockStart).toHaveBeenCalledTimes(1);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.draft.sessionId).toBe("sess-1");
        expect(result.draft.processInstanceId).toBe("pi-1");
        // The Process chose it; this is a report, never a selection.
        expect(result.draft.packetDefinitionId).toBe("packet-enrollment-2026");
    });

    it("a resend reaches the SAME episode rather than creating a second one", async () => {
        mockStart.mockResolvedValue(
            launched({
                reused: true,
                participantLaunch: {
                    realized: true,
                    value: { ...launched().participantLaunch.value, outcome: "resumed" },
                },
            }),
        );
        const first = await prepareEnrollmentPaperwork(supabaseWith(world), { orgId: ORG, customerMemberId: CHILD });
        const second = await prepareEnrollmentPaperwork(supabaseWith(world), { orgId: ORG, customerMemberId: CHILD });
        expect(first.ok && second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.draft.sessionId).toBe(first.draft.sessionId);
        expect(second.draft.launchOutcome).toBe("resumed");
        expect(second.draft.reusedJourney).toBe(true);
        // Two prepares, two starts — and the start's own idempotence is what makes that safe.
        expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it("builds the family URL from the canonical origin, not from a request", async () => {
        mockStart.mockResolvedValue(launched());
        const result = await prepareEnrollmentPaperwork(supabaseWith(world), { orgId: ORG, customerMemberId: CHILD });
        expect(result.ok && result.draft.accessUrl).toBe("https://school.example/forms/embed/tok123");
    });

    it("refuses when the stage realizes no paperwork, instead of sending an empty link", async () => {
        mockStart.mockResolvedValue({
            ...launched(),
            participantLaunch: { realized: false, code: "no_form_requirements", detail: "" },
        });
        const result = await prepareEnrollmentPaperwork(supabaseWith(world), { orgId: ORG, customerMemberId: CHILD });
        expect(result.ok).toBe(false);
        expect(!result.ok && result.code).toBe("not_realized");
    });
});

describe("the recipient comes from the child's own relationship graph", () => {
    it("prefers a caregiving role over a higher-priority contact who holds none", () => {
        // Paperwork asks for consent and authority. An emergency contact holds neither, however
        // early they appear in the list.
        const ordered = orderEnrollmentPaperworkCandidates([
            { party_id: GRAN, person_id: GRAN, roles: ["emergency_contact"], priority: 1, full_name: "Gran", email: "g@x.com", phone: null },
            { party_id: MUM, person_id: MUM, roles: ["parent"], priority: 2, full_name: "Dana", email: "d@x.com", phone: null },
        ]);
        expect(ordered[0]?.person_id).toBe(MUM);
    });

    it("orders caregivers by the relationship's own priority", () => {
        const ordered = orderEnrollmentPaperworkCandidates([
            { party_id: GRAN, person_id: GRAN, roles: ["guardian"], priority: 2, full_name: "B", email: null, phone: null },
            { party_id: MUM, person_id: MUM, roles: ["parent"], priority: 1, full_name: "A", email: null, phone: null },
        ]);
        expect(ordered.map((p) => p.person_id)).toEqual([MUM, GRAN]);
    });

    it("chooses the caregiver, not whoever happens to have an email", async () => {
        mockStart.mockResolvedValue(launched());
        const result = await prepareEnrollmentPaperwork(
            supabaseWith({
                ...world,
                relationships: [
                    { id: "rel-gran", person_id: GRAN, priority: 1 },
                    { id: "rel-mum", person_id: MUM, priority: 2 },
                ],
                roles: [
                    { relationship_id: "rel-gran", role_key: "emergency_contact" },
                    { relationship_id: "rel-mum", role_key: "parent" },
                ],
                persons: [
                    { id: GRAN, full_name: "Gran Rivera", email: "gran@example.com", phone: null },
                    { id: MUM, full_name: "Dana Rivera", email: "dana@example.com", phone: null },
                ],
            }),
            { orgId: ORG, customerMemberId: CHILD },
        );
        expect(result.ok && result.draft.recipientPersonId).toBe(MUM);
        // The alternatives are offered, so the operator can still choose the grandmother.
        expect(result.ok && result.draft.recipientAlternatives.map((a) => a.personId)).toContain(GRAN);
    });

    it("an unreachable family is an actionable blocker, never a URL to copy", async () => {
        mockStart.mockResolvedValue(launched());
        const result = await prepareEnrollmentPaperwork(
            supabaseWith({ ...world, persons: [{ id: MUM, full_name: "Dana Rivera", email: null, phone: null }] }),
            { orgId: ORG, customerMemberId: CHILD },
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("missing_recipient");
        expect(result.message).toContain("Dana Rivera");
        expect(result.message.toLowerCase()).not.toContain("copy");
        expect(result.message.toLowerCase()).not.toContain("url");
    });

    it("a child with nobody linked names what to fix", async () => {
        mockStart.mockResolvedValue(launched());
        const result = await prepareEnrollmentPaperwork(
            supabaseWith({ ...world, relationships: [], roles: [], persons: [] }),
            { orgId: ORG, customerMemberId: CHILD },
        );
        expect(!result.ok && result.code).toBe("missing_recipient");
        expect(!result.ok && result.message).toContain("Add the family contact");
    });
});

describe("the operator cannot choose the packet, and the family never sees one", () => {
    it("drops any packet identity from the request", () => {
        const validated = sendEnrollmentPaperworkAction.validatePayload?.({
            mode: "prepare",
            packet_definition_id: "packet-someone-else",
            packet_id: "packet-someone-else",
            recipient_person_id: GRAN,
            to: "attacker@example.com",
        });
        expect(validated?.ok).toBe(true);
        const value = (validated as { ok: true; value: Record<string, unknown> }).value;
        expect(value.packet_definition_id).toBeUndefined();
        expect(value.packet_id).toBeUndefined();
        expect(value.recipient_person_id).toBeUndefined();
        expect(value.to).toBeUndefined();
    });

    it("the orchestration has no packet parameter at all", () => {
        // The only way "the Process decides" stays true is for there to be nothing to pass.
        const src = code("lib/enrollment/paperwork/sendEnrollmentPaperwork.ts");
        // The input is the whole argument surface: an org and a child. There is no third field a
        // caller could put a packet in.
        expect(src).toContain("input: { orgId: string; customerMemberId: string }");
        // And the one packet identity in the module is READ from the launch, never assigned from an
        // argument — it is an answer on the way out, not a choice on the way in.
        expect(src).toContain("packetDefinitionId: launch.packetDefinitionId");
        expect(src).not.toMatch(/input\.packet|args\.packet|payload\.packet/);
    });

    it("says nothing about packets, sessions or requirements to the family", () => {
        const msg = buildEnrollmentPaperworkMessage({
            childName: "Touree",
            accessUrl: "https://school.example/forms/embed/tok123",
        });
        const all = `${msg.subject} ${msg.emailBody} ${msg.smsBody}`.toLowerCase();
        for (const word of ["packet", "session", "objective", "requirement", "uuid"]) {
            expect(all, `message leaks "${word}"`).not.toContain(word);
        }
        expect(msg.subject).toContain("Touree");
        expect(msg.emailBody).toContain("https://school.example/forms/embed/tok123");
    });
});

describe("sending stays with Communications", () => {
    it("the action prepares and marks sent — it has no send mode of its own", () => {
        const src = code("lib/adminV2/actions/definitions/sendEnrollmentPaperworkAction.ts");
        expect(src).toContain('"mark_sent"');
        expect(src).not.toMatch(/mode === "send"/);
    });

    it("nothing in the orchestration enqueues or delivers", () => {
        const src = code("lib/enrollment/paperwork/sendEnrollmentPaperwork.ts");
        for (const forbidden of ["canonicalOutboundEnqueue", "deliverQueued", "sendEmail", "orchestrate"]) {
            expect(src, `orchestration reaches for ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("the seed carries the link in the editable body and the episode for the audit", () => {
        const seed = seedFromEnrollmentPaperworkDetail(
            {
                session_id: "sess-1",
                access_url: "https://school.example/forms/embed/tok123",
                recipient_person_id: MUM,
                subject: "Enrollment paperwork for Touree",
                email_body: "Enrollment paperwork for Touree is ready.",
                sms_body: "Paperwork ready.",
            },
            CHILD,
        );
        expect(seed.body).toContain("https://school.example/forms/embed/tok123");
        expect(seed.smsBody).toContain("https://school.example/forms/embed/tok123");
        expect(seed.recipientPersonIds).toEqual([MUM]);
        expect(seed.enrollmentPaperworkSessionId).toBe("sess-1");
        expect(seed.enrollmentPaperworkChildId).toBe(CHILD);
    });

    it("sending the link does not claim the family completed the paperwork", () => {
        // Delivery state and obligation state are different facts. Nothing in the send path may
        // complete the stage work — the family still has to do it.
        const src = code("lib/enrollment/paperwork/sendEnrollmentPaperwork.ts")
            + code("lib/adminV2/actions/definitions/sendEnrollmentPaperworkAction.ts");
        for (const forbidden of ["completeStageWork", "completes_work", "markPacketComplete"]) {
            expect(src, `the send claims completion via ${forbidden}`).not.toContain(forbidden);
        }
    });
});
