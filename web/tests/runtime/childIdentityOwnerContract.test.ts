/**
 * LAW 34 — ONE CANONICAL HUMAN IDENTITY OWNER.
 *
 * For a person-backed child, `persons` owns intrinsic identity. `customer_members` is the identity
 * fallback ONLY while no Person exists; it may carry participation and compatibility data, but it may
 * never act as a second independently writable live identity authority.
 *
 * These guards exist because the failure was invisible in exactly the places you would look. The
 * resolver was already person-first and had always been — but the person was never LOADED, so it
 * silently returned the member mirror. Every surface agreed with every other surface, and all of them
 * were wrong together. A test of the resolver alone passes in that world; these do not.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveInquiryChildIdentityFields } from "@/lib/admin/drawer/inquiryChildrenHydration";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const PERSON = { first_name: "Lennon", last_name: "Kurzman", full_name: "Lennon Kurzman", date_of_birth: "2024-04-02" };
const STALE_MEMBER = { first_name: "perf-probe-1787311039569", last_name: "Kurzman", display_name: "perf-probe-1787311039569 Kurzman", dob: "2024-04-02" };

describe("law 34 — identity resolution", () => {
    it("a person-backed child reads Person, and a stale member mirror cannot override it", () => {
        const id = resolveInquiryChildIdentityFields({ personId: "p1", person: PERSON, member: STALE_MEMBER });
        expect(id.first_name).toBe("Lennon");
        expect(id.display_name).toBe("Lennon Kurzman");
        expect(id.display_name).not.toContain("perf-probe");
    });

    it("a personless child reads the member fallback", () => {
        const id = resolveInquiryChildIdentityFields({
            personId: null,
            person: null,
            member: { first_name: "Test", last_name: "Process11", display_name: "Test Process11", dob: null },
        });
        expect(id.display_name).toBe("Test Process11");
        expect(id.first_name).toBe("Test");
    });

    it("a person-backed child whose Person row is MISSING must not silently look canonical", () => {
        // This is the exact production hole: person_id set, person not loaded → member mirror returned.
        // The resolver's behaviour is the fallback; the guard below is what makes the LOAD non-optional.
        const id = resolveInquiryChildIdentityFields({ personId: "p1", person: null, member: STALE_MEMBER });
        expect(id.display_name).toContain("perf-probe");
    });
});

describe("law 34 — every identity projection LOADS the canonical owner", () => {
    it("the opportunity drawer record loads children's persons in both build paths", () => {
        const src = read("lib/admin/opportunityEntityRecord.ts");
        // Asserted as DECLARATIONS, not substrings: an earlier version of this guard matched
        // `identityPersonIdsMissing` as a substring and happily passed when the load was renamed out
        // of use. A guard that cannot fail is not a guard.
        // Path 1: the map was constructed empty and never filled.
        expect(src).toMatch(/const childPersonIds = \[/);
        expect(src).toMatch(/\.in\("id", childPersonIds\)/);
        // Path 2: member-linked persons were deferred to a later pass, which changed identity ownership.
        expect(src).toMatch(/const identityPersonIdsMissing = memberLinkedPersonIdsDeferred\.filter/);
        expect(src).toMatch(/\.in\("id", identityPersonIdsMissing\)/);
    });

    it("the queue row title embeds persons and resolves through the shared authority", () => {
        expect(read("lib/queues/childGrainProcessInstanceQueue.ts")).toContain(
            "persons(first_name, last_name, full_name, date_of_birth)",
        );
        expect(read("lib/runtime/provisioning/childGrainProvisioningRows.ts")).toContain(
            "resolveInquiryChildIdentityFields",
        );
    });

    it("the durable child subject and Records resolve through the shared authority", () => {
        for (const f of [
            "lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildSubject.ts",
            "app/api/admin/records/children/route.ts",
        ]) {
            expect(read(f)).toContain("resolveInquiryChildIdentityFields");
        }
    });

    it("Records keeps its left-join shape so personless children never vanish", () => {
        const src = read("app/api/admin/records/children/route.ts");
        // A projection KEYED on persons would empty the surface; the person load must be conditional.
        expect(src).toContain("childPersonIds.length > 0");
    });

    it("the durable subject no longer lets member facts override identity keys", () => {
        const src = read("lib/adminV2/runtime/focusPanel/durableSubject/composeDurableChildSubject.ts");
        expect(src).toContain("display_name: identity.display_name");
        expect(src).toContain("first_name: identity.first_name");
        // The old rule — member facts winning on shared identity keys — must not come back.
        expect(src).not.toContain("they override the person payload on any shared identity key");
    });
});

describe("law 34 — the write targets the owner the editor read", () => {
    it("identity writes route to persons when the child is person-linked", () => {
        const src = read("lib/admin/drawer/inquiryChildFieldEdit.ts");
        expect(src).toContain("buildPersonIdentityPatch");
        expect(src).toContain('writeTarget: "person"');
    });

    it("non-identity member fields stay member-scoped", () => {
        // Profile facts (allergies, medical notes, special instructions) are participation data and
        // remain owned by the member row — law 34 governs IDENTITY, not everything on the member.
        const src = read("lib/adminV2/runtime/focusPanel/identity/identityInlineChildSave.ts");
        expect(src).toContain('"child.special_instructions": "special_instructions"');
    });
});
