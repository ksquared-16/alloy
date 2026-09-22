/**
 * THE #1075 PARTICIPANT-IDENTITY BRANCH STAYS RETIRED.
 *
 * #1075 tried to state the scoped participant in commit truth so participant-scoped cards could
 * mount at commit. It shipped and did nothing: mount moved from a 4,771ms median to 5,095ms, and
 * the identity hold removed was 0ms.
 *
 * The premise was wrong in a specific way. The answer holds the MEMBER identity;
 * `participantScopeFromChildSubjectTruth` also requires a PARTICIPATION identity, and the
 * commit-time children collection cannot supply one — it is seeded solely from the subject row's
 * `metadata.inquiry_children` ("no extra DB read"), whose rows carry an OCM link id or a synthetic
 * `unlinked:<memberId>`, never a process-instance id.
 *
 * Deleting the code is not enough: nothing would notice it coming back. These are the gates that
 * make the retirement hold, and they are deliberately source-level because the defect was a
 * declaration, not a behaviour.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MOUNTABLE_CARD_SPECS, PARTICIPANT_IDENTITY_TRUTH_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const repoRoot = join(process.cwd(), "..");
const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");

const COMPOSER = "web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts";
const CONTEXT = "web/lib/adminV2/runtime/operationalContext/buildOperationalContext.ts";

describe("#1075 retirement", () => {
    it("the inert helper is gone from the domain composer (defect A)", () => {
        expect(read(COMPOSER)).not.toContain("soleParticipantIdentityBindings");
    });

    it("the composer declares no participant identity key at commit (defect A)", () => {
        // The composer legitimately names other domain keys; it must not name THIS one, because the
        // only thing that could have supplied it was the retired branch.
        expect(read(COMPOSER)).not.toContain("child.customer_member_id");
        expect(read(COMPOSER)).not.toContain("child.process_instance_id");
    });

    it("the candidate mapper is module-private again (defect C)", () => {
        const src = read(CONTEXT);
        expect(src).toContain("function participantCandidatesFromTruth");
        expect(src, "exported only for the retired behaviour").not.toContain(
            "export function participantCandidatesFromTruth",
        );
    });

    it("no replacement participant read was added to the composer (defect B)", () => {
        // The retired branch's whole justification was zero new reads. A replacement that adds one
        // is the architecture failure, not a fix.
        const added = read(COMPOSER).split("\n").filter((l) => /participation|process_instance/i.test(l));
        for (const line of added) {
            expect(line, `participation lookup reintroduced: ${line.trim()}`).not.toMatch(
                /\.from\(|supabase|select\(/,
            );
        }
    });

    it("the participant mount requirement is unweakened (defect D)", () => {
        expect(PARTICIPANT_IDENTITY_TRUTH_KEYS).toEqual(["child.customer_member_id"]);
        const participantSpecs = MOUNTABLE_CARD_SPECS.filter(
            (s) => s.identityTruthKeys === PARTICIPANT_IDENTITY_TRUTH_KEYS,
        );
        expect(participantSpecs.length, "attendance + health_safety").toBe(2);
        const knowable = (truth: Record<string, unknown>) =>
            participantSpecs.filter((s) => s.identityKnowable({ truth } as unknown as OperationalContext)).length;
        expect(knowable({}), "absent identity must not mount").toBe(0);
        expect(knowable({ "child.customer_member_id": "   " }), "blank is absent").toBe(0);
        expect(knowable({ "child.customer_member_id": "mem-1" }), "a real identity still mounts").toBe(2);
    });

    it("the #1075 test went with the behaviour it covered (defect E)", () => {
        let present = true;
        try {
            read("web/tests/perf/participantIdentityAtCommit.test.ts");
        } catch {
            present = false;
        }
        expect(present, "a test for deleted behaviour is a false gate").toBe(false);
    });
});
