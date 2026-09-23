/**
 * A KNOWN PERSON DISAPPEARING FROM THE PAPERWORK IS NOT WHAT REUSE MEANT.
 *
 * Known-person reuse exists so a family does not retype someone Alloy already has, and so the
 * commit path does not create them twice. The projection into the Form payload held only what the
 * SESSION had written, so a family who confirmed a known sibling and a known emergency contact —
 * and added nobody — produced a payload with no rows at all, and a completed document with two
 * empty headings. Measured in human QA against the Disposable0913 family.
 *
 * `origin` and `item_id` still travel with every known row, which is what keeps the proposal
 * pipeline from recreating someone who already exists. Present as evidence; never proposed as new.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
    partyCollectionGroupRows,
    partyCollectionStateKey,
    type ParticipantPartyEntry,
} from "@/lib/enrollment/informationNeeds/participantPartyCollection";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const FD = "3f682c60-6e7c-4b41-a3cb-64f35c1a6d94";

const SCHEMA = {
    title: "Enrollment Application",
    fields: [
        {
            id: "emergency_contacts",
            type: "group",
            label: "Emergency contacts",
            repeat: { min: 1, max: null },
            party_collection: {
                action_key: "add_person",
                subject: "person",
                role: "emergency_contact",
                show_known: true,
                allow_add: true,
            },
            fields: [
                { id: "ec_name", type: "text", label: "Full name", required: true },
                { id: "ec_phone", type: "text", label: "Phone" },
            ],
        },
    ],
    sections: [{ id: "s1", title: "Your family", field_ids: ["emergency_contacts"] }],
} as unknown as FormSchemaV1;

const KEY = partyCollectionStateKey(FD, "emergency_contacts");

const CORINNE: ParticipantPartyEntry = {
    instance_key: "known:c0r",
    origin: "existing",
    item_id: "c0r1nne0-0000-4000-8000-000000000002",
    values: { ec_name: "Corinne Vasquez", ec_phone: "+15415557788" },
};

const known = { emergency_contacts: [CORINNE] };

describe("the converged payload carries everyone the family confirmed", () => {
    it("includes a known person the family neither edited nor removed", () => {
        const rows = partyCollectionGroupRows(SCHEMA, {}, FD, known);
        expect(rows.emergency_contacts?.map((r) => r.values.ec_name)).toEqual(["Corinne Vasquez"]);
    });

    it("marks a known row as existing and carries its canonical identity", () => {
        const rows = partyCollectionGroupRows(SCHEMA, {}, FD, known);
        const row = rows.emergency_contacts![0];
        expect(row.collection?.origin).toBe("existing");
        expect(row.collection?.item_id).toBe(CORINNE.item_id);
    });

    it("keeps known and family-added people in the order the family saw them", () => {
        const held = {
            [KEY]: [
                {
                    instance_key: "e-9",
                    origin: "respondent_added",
                    values: { ec_name: "Farrah Nolan", ec_phone: "3213525132" },
                },
            ],
        };
        const rows = partyCollectionGroupRows(SCHEMA, held, FD, known);
        expect(rows.emergency_contacts?.map((r) => r.values.ec_name)).toEqual(["Corinne Vasquez", "Farrah Nolan"]);
        expect(rows.emergency_contacts?.map((r) => r.collection?.origin)).toEqual(["existing", "respondent_added"]);
    });

    it("does not list a known person twice when the session also holds them", () => {
        const held = {
            [KEY]: [
                {
                    // As the session stores a correction the family made to a known person.
                    instance_key: "corrected",
                    origin: "respondent_added",
                    item_id: CORINNE.item_id,
                    values: { ec_name: "Corinne Vasquez", ec_phone: "5035551234" },
                },
            ],
        };
        const rows = partyCollectionGroupRows(SCHEMA, held, FD, known);
        expect(rows.emergency_contacts).toHaveLength(1);
        // The family's correction is the one that reaches the paperwork.
        expect(rows.emergency_contacts![0].values.ec_phone).toBe("5035551234");
        expect(rows.emergency_contacts![0].collection?.item_id).toBe(CORINNE.item_id);
        // Still the person Alloy knows — a correction is not a new person to create.
        expect(rows.emergency_contacts![0].collection?.origin).toBe("existing");
    });

    it("omits a row the family removed", () => {
        const held = { [KEY]: [] };
        const rows = partyCollectionGroupRows(SCHEMA, held, FD, {});
        expect(rows.emergency_contacts).toBeUndefined();
    });

    it("honours a collection that says not to show known people", () => {
        const hidden = {
            ...SCHEMA,
            fields: [
                {
                    ...(SCHEMA.fields[0] as Record<string, unknown>),
                    party_collection: {
                        ...((SCHEMA.fields[0] as unknown as { party_collection: Record<string, unknown> }).party_collection),
                        show_known: false,
                    },
                },
            ],
        } as unknown as FormSchemaV1;
        expect(partyCollectionGroupRows(hidden, {}, FD, known).emergency_contacts).toBeUndefined();
    });

    it("behaves exactly as before when no known people are supplied", () => {
        const held = {
            [KEY]: [{ instance_key: "e-1", origin: "respondent_added", values: { ec_name: "Farrah Nolan" } }],
        };
        expect(partyCollectionGroupRows(SCHEMA, held, FD).emergency_contacts).toHaveLength(1);
        expect(partyCollectionGroupRows(SCHEMA, {}, FD)).toEqual({});
    });
});

describe("a packet with no Business Process journey still knows the family", () => {
    /*
     * MEASURED in the mounted conversation, on a hand-launched packet: the card showed the known
     * sibling and the known emergency contact, and the completed document printed only the two
     * people the family had typed. The resolver read the process instance's subject and stopped, so
     * a session with no journey resolved no child — and therefore no parties and no household.
     *
     * The participant runtime converged away from requiring a journey some time ago. The child is
     * found through `resolveParticipantSubjectCustomerMemberId`: the instance's subject where one
     * exists, the session's CRM snapshot where it does not. One resolver, both launch modes.
     */
    const src = readFileSync(
        new URL("../../lib/enrollment/informationNeeds/sessionKnownPartyEntries.ts", import.meta.url).pathname,
        "utf8",
    );

    it("resolves the child through the platform's own subject resolver", () => {
        expect(src).toContain("resolveParticipantSubjectCustomerMemberId");
    });

    it("does not reach for the process instance's subject on its own", () => {
        expect(src, "a second derivation is a second chance to disagree about whose family this is").not.toMatch(
            /\.from\("process_instances"\)/,
        );
    });

    it("is handed the session row by every caller, or the snapshot is unreachable", () => {
        for (const caller of [
            "../../lib/enrollment/participantRuntime/renderParticipantEnrollmentDocument.ts",
            "../../app/api/public/forms/[token]/submissions/route.ts",
            "../../app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts",
        ]) {
            const text = readFileSync(new URL(caller, import.meta.url).pathname, "utf8");
            const at = text.indexOf("resolveSessionKnownPartyEntries(");
            expect(at, `${caller} never resolves known people`).toBeGreaterThan(0);
            expect(text.slice(at, at + 420), `${caller} withholds the session row`).toContain("session:");
            expect(text, `${caller} reads a session without its crm_snapshot`).toContain("crm_snapshot");
        }
    });
});
