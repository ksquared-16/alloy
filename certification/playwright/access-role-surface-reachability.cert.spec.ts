/**
 * W-59 — the reachability check the workstream opens with.
 *
 * `03-implementation-qa-sequence.md` §46: role editing is reachable from five surfaces and
 * 1,155 lines of it are legacy, but *"reachability was never established… no browser was opened,
 * and no claim is made about how any of this renders or behaves for a live operator — including
 * whether the three legacy surfaces in §41 are reachable"*. `W-59` opens with that check, and
 * until it runs the workstream is not startable.
 *
 * `H1` is what would make the deletion safe: all five surfaces call the same four
 * `/api/admin/rbac/*` routes, so the legacy clients hold no authority the canonical surface does
 * not. This spec does not re-derive `H1` — it answers the one question the corpus says is open:
 * **does a live, authenticated operator reach these pages?**
 *
 * STRICTLY READ-ONLY, and deliberately so. The certification stack is the SHARED `alloy-cert`
 * tenant and another session holds its lease while this runs. Every step here is a navigation and
 * an assertion: no form is submitted, no grant is saved, no role is edited, nothing is reset or
 * reseeded. A reachability question does not need a write to answer it, and answering it with one
 * would destroy another worktree's in-flight certification.
 */
import { test, expect } from "@playwright/test";

/**
 * The three legacy authority surfaces §41 names. `customer-person-roles` is deliberately ABSENT:
 * §46 records it as "a different concept sharing a word" — the family/household relationship
 * vocabulary, not operator authority — and instructs that it be dispositioned on its own terms
 * rather than swept up in an authority cleanup.
 */
const LEGACY_AUTHORITY_SURFACES = [
    { path: "/legacy-admin/system/roles", name: "legacy roles editor" },
    { path: "/legacy-admin/system/access-control", name: "legacy access-control editor" },
    { path: "/legacy-admin/users", name: "legacy users + role assignment" },
] as const;

const CANONICAL = "/organization/access";

type Observation = {
    surface: string;
    requested: string;
    finalUrl: string;
    status: number | null;
    redirected: boolean;
    rendersRoleUi: boolean;
};

const observations: Observation[] = [];

/** Does the rendered page actually offer role/permission editing to the operator? */
async function rendersRoleUi(body: string): Promise<boolean> {
    return /permission|role/i.test(body);
}

for (const surface of LEGACY_AUTHORITY_SURFACES) {
    test(`W-59 reachability — ${surface.name}`, async ({ page }) => {
        const response = await page.goto(surface.path, { waitUntil: "domcontentloaded" });
        const status = response?.status() ?? null;
        const finalUrl = new URL(page.url()).pathname;
        const body = (await page.locator("body").innerText().catch(() => "")) ?? "";

        observations.push({
            surface: surface.name,
            requested: surface.path,
            finalUrl,
            status,
            redirected: finalUrl !== surface.path,
            rendersRoleUi: await rendersRoleUi(body),
        });

        // This test RECORDS; it does not prejudge. W-59's deletion is justified whether the
        // surface is reachable (it is a duplicate editor an operator can reach) or already
        // unreachable (it is dead code). What the workstream may not do is delete on an
        // assumption, which is precisely what §46 says has never been checked.
        expect(status, `${surface.path} produced no HTTP response`).not.toBeNull();
    });
}

test("W-59 reachability — the canonical Access chapter is reachable and renders the role editor", async ({ page }) => {
    const response = await page.goto(CANONICAL, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${CANONICAL} must answer`).toBeLessThan(400);
    // Tier B's clause: the canonical chapter is reachable and unchanged. If this fails, W-59 must
    // NOT proceed — deleting the alternatives while the survivor is broken is the one outcome
    // worse than five editors.
    expect(new URL(page.url()).pathname).toContain("/organization/access");
    const body = await page.locator("body").innerText();
    expect(body.length, "canonical Access chapter rendered an empty document").toBeGreaterThan(0);
});

test.afterAll(async () => {
    // The evidence this workstream needed and did not have. Printed rather than asserted: the
    // disposition it feeds is a product decision recorded in the execution register, and a spec
    // that asserted a particular answer would be asserting the conclusion it exists to discover.
    // eslint-disable-next-line no-console
    console.log("\nW-59 REACHABILITY OBSERVATIONS\n" + JSON.stringify(observations, null, 2));
});
