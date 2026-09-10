import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { requireEnrollmentJourney } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";

const ROUTES = join(process.cwd(), "app", "api", "public", "forms", "[token]");
const read = (name: string) => readFileSync(join(ROUTES, name, "route.ts"), "utf8");
const RESOLVER = readFileSync(
    join(process.cwd(), "lib", "public", "forms", "resolveParticipantEnrollmentFromToken.ts"),
    "utf8",
);

/**
 * A MANUALLY LAUNCHED PACKET IS A PARTICIPANT SESSION.
 *
 * The token resolver used to refuse access outright when `process_instance_id` was null, so a packet
 * an operator launched by hand got `NO_ENROLLMENT_JOURNEY` from every participant endpoint —
 * including the two that render the family's own paperwork and read nothing but `orgId` and
 * `sessionId`. The parent signed a list of field labels instead of their school's form, for a reason
 * that had nothing to do with either route.
 *
 * The session is the anchor. A journey enriches it.
 */

describe("access is granted by the session, not by the journey", () => {
    it("no longer refuses a session that has no process instance", () => {
        // The refusal used to live in the resolver, ahead of every route.
        expect(RESOLVER).not.toMatch(/if \(!processInstanceId\) \{[\s\S]*?NO_ENROLLMENT_JOURNEY/);
        expect(RESOLVER).toContain("readonly processInstanceId: string | null;");
    });

    it("still reports the journey when there is one", () => {
        // Optional is not the same as discarded — routes that enrich with process context must
        // still be able to find it.
        expect(RESOLVER).toMatch(/processInstanceId,\n\s+session: row,/);
    });
});

describe("routes decide for themselves whether they need a journey", () => {
    it("enrollment-edit still requires a journey, and says so itself", () => {
        /*
         * The edit path still resolves against Business Process requirements. What changed is only
         * that it owns the decision instead of inheriting it, so a participant working a
         * hand-launched packet is no longer denied everything else on its behalf.
         */
        const src = read("enrollment-edit");
        expect(src).toContain("requireEnrollmentJourney");
        expect(src).toContain("journey.error.code");
        expect(src).not.toContain("access.value.processInstanceId");
    });

    it.each(["enrollment-objective", "enrollment-turn"])(
        "%s no longer requires a journey at all",
        (route) => {
        /*
         * The objective converged: `resolvePacketParticipantProgress` supplies requirements from a
         * packet's own steps where a process instance would have supplied them from its stage, and
         * everything below that seam is identical. So the objective — and therefore the
         * conversation it drives — now resolves for both launch modes from one runtime.
         *
         * Proven live on a hand-launched three-form packet: progress {total 3, satisfied 0,
         * remaining 3}, stage_key null, and a real conversational next_turn.
         */
            const src = read(route);
            expect(src).not.toContain("requireEnrollmentJourney");
            // The journey is still READ, to enrich canonical prefill when one exists.
            expect(src).toContain("access.value.processInstanceId");
        },
    );

    it.each(["enrollment-artifact", "enrollment-document"])(
        "%s needs only the session, and no longer asks about a journey",
        (route) => {
            // These render the family's paperwork. They were never journey-shaped; they were only
            // ever denied by a gate above them.
            const src = read(route);
            expect(src).not.toContain("processInstanceId");
            expect(src).not.toContain("requireEnrollmentJourney");
            expect(src).toContain("access.value.sessionId");
        },
    );

    it.each(["enrollment-upload", "enrollment-signature-asset"])(
        "%s resolves the child rather than the journey",
        (route) => {
            /*
             * Storage needs the child to attach to and nothing else about a process. One concept,
             * two sources: the instance's subject, or the session's own CRM snapshot.
             */
            const src = read(route);
            expect(src).toContain("resolveParticipantSubjectCustomerMemberId");
            expect(src).not.toContain('.eq("id", access.value.processInstanceId)');
            // And the copy no longer blames a "journey" a manual packet never had.
            expect(src).not.toMatch(/Journey has no subject/);
        },
    );
});

describe("requireEnrollmentJourney", () => {
    const base = {
        orgId: "org-1",
        linkId: "link-1",
        sessionId: "sess-1",
        session: {} as never,
    };

    it("passes a session that carries a journey", () => {
        const r = requireEnrollmentJourney({ ...base, processInstanceId: "pi-1" });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.processInstanceId).toBe("pi-1");
    });

    it("refuses one that does not, with the code the participant surfaces already handle", () => {
        const r = requireEnrollmentJourney({ ...base, processInstanceId: null });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("NO_ENROLLMENT_JOURNEY");
    });
});
