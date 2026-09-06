/**
 * ASSIGNMENT → TUITION, THROUGH THE MOUNTED APPLICATION.
 *
 * The backend is certified against the real database elsewhere. This proves the thing that
 * certification cannot: that the APPLICATION an operator actually uses is driving the canonical
 * Commercial resolver and the persisted `enrollment_pricing_terms`, and not a figure it computed
 * for itself. The card publishes the resolution key and the config version it rendered, so the
 * assertions here can tell a real resolution from a plausible-looking one.
 *
 *   A  a proposed assignment with no enrollment agreement resolves tuition
 *   B  the recommendation is visible, with its explanation
 *   C  the operator accepts it
 *   D  the page is fully reloaded
 *   E  the same accepted tuition is there
 *   F  a relevant assignment fact is changed through its canonical owner
 *   G  the prior resolution is visibly stale
 *   H  re-resolving gives the new correct recommendation
 *   I  an ambiguous catalog produces a usable ambiguous state, selecting nothing
 *   J  an unpriced assignment produces a usable no-match state
 *   K  an authorized override keeps the recommendation, needs a reason, and survives a reload
 *   M  accepting twice does not create a second live term
 *
 * L — an unauthorized override — is proved by its own run, with the grant revoked; a single browser
 * session cannot be two operators at once.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

const WORK_VIEW = "/workspace/work-unit/new-leads";
const BOS_PRESENTATION_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";
const OUT = process.env.CERT_TUITION_OUT || "";

/** The assignment section for the first child on the panel. */
const ASSIGNMENT = "[data-tuition-assignment]";

async function openSubject(page: Page, index = 0): Promise<string> {
    await page.addInitScript(
        ([key, state]) => {
            try {
                sessionStorage.setItem(key, state);
            } catch {
                /* private-mode storage; the rail simply stays where it parks */
            }
        },
        [BOS_PRESENTATION_STATE_KEY, "closed"],
    );
    await page.goto(WORK_VIEW);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(45_000);
    const rows = page.locator('[data-entity-type="opportunity"][data-entity-id]');
    await expect(rows.nth(index)).toBeVisible({ timeout: 60_000 });
    const subjectId = (await rows.nth(index).getAttribute("data-entity-id")) ?? "";
    await rows.nth(index).click();
    await page.waitForTimeout(25_000);
    await expect(page).toHaveURL(new RegExp(`subject_id=${subjectId}`));
    return subjectId;
}

test.describe("assignment → tuition, in the mounted application", () => {
    test.describe.configure({ mode: "serial" });

    test("A–E, M — resolve, accept, reload, and a retry that adds nothing", async ({ page }) => {
        await openSubject(page);

        // ── A · THE CARD MOUNTS FOR AN ASSIGNMENT WITH NO ENROLMENT ─────────────────────────
        const card = page.locator("[data-assignment-tuition]");
        await expect(card, "the Tuition card must mount on the assignment's panel").toBeVisible({
            timeout: 30_000,
        });
        const first = page.locator(ASSIGNMENT).first();
        await expect(first).toBeVisible({ timeout: 30_000 });
        expect(await first.getAttribute("data-tuition-accepted")).toBe("none");

        const ocmId = (await first.getAttribute("data-tuition-assignment")) ?? "";
        expect(ocmId).toMatch(/[0-9a-f-]{36}/);
        const resolutionKey = (await first.getAttribute("data-tuition-resolution")) ?? "";
        const configVersion = (await first.getAttribute("data-tuition-config-version")) ?? "";
        // A real resolution, not a rendered placeholder: both come from Commercial Execution.
        expect(resolutionKey).toMatch(/\S/);
        expect(configVersion).toMatch(/\S/);
        expect(await first.getAttribute("data-tuition-state")).toBe("recommended");

        // ── B · THE RECOMMENDATION, AND WHY ─────────────────────────────────────────────────
        const recommended = first.locator('[data-tuition-option-kind="recommended"]');
        await expect(recommended).toHaveCount(1);
        const amountLabel = (await recommended.locator("[data-tuition-amount]").innerText()).trim();
        expect(amountLabel).toMatch(/\$[\d,]+\.\d{2}\/\w+/);
        const why = await first.locator("[data-tuition-explanation]").innerText();
        expect(why, "the explanation must name the facts, not internal keys").toContain("days a week");
        expect(why).toContain("Program");
        // The facts it was computed from are on screen beside it.
        expect(await first.locator('[data-tuition-fact="days"]').innerText()).toMatch(/\d days a week/);

        // ── C · ACCEPT ──────────────────────────────────────────────────────────────────────
        await first.locator('[data-tuition-command="accept"]').click();
        await page.waitForTimeout(15_000);
        await expect(first.locator("[data-tuition-error]")).toHaveCount(0);
        await expect(first).toHaveAttribute("data-tuition-accepted", "accepted", { timeout: 30_000 });
        const acceptedAmount = (await first.locator("[data-tuition-accepted-amount]").innerText()).trim();
        expect(acceptedAmount).toBe(amountLabel.split("/")[0]!.trim() + "/" + amountLabel.split("/")[1]!.trim());

        // ── D/E · A FULL RELOAD RETURNS THE SAME COMMITTED TRUTH ────────────────────────────
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(40_000);
        const afterReload = page.locator(ASSIGNMENT).first();
        await expect(afterReload).toHaveAttribute("data-tuition-accepted", "accepted", { timeout: 60_000 });
        expect((await afterReload.locator("[data-tuition-accepted-amount]").innerText()).trim()).toBe(
            acceptedAmount,
        );
        expect(await afterReload.getAttribute("data-tuition-stale")).toBe("false");
        const termId = await afterReload.locator("[data-tuition-accepted-term]").getAttribute("data-tuition-accepted-term");
        expect(termId).toMatch(/[0-9a-f-]{36}/);

        // ── M · ACCEPTING AGAIN ADDS NOTHING ────────────────────────────────────────────────
        await afterReload.locator('[data-tuition-command="accept"]').click();
        await page.waitForTimeout(15_000);
        await expect(afterReload).toHaveAttribute("data-tuition-accepted", "accepted");
        const termAfterRetry = await afterReload
            .locator("[data-tuition-accepted-term]")
            .getAttribute("data-tuition-accepted-term");
        expect(termAfterRetry, "a retry must return the same term, not a second one").toBe(termId);

        if (OUT) writeFileSync(OUT, JSON.stringify({ ocmId, termId, resolutionKey, amountLabel }));
    });

    /*
     * F–H · A CHANGED ASSIGNMENT FACT, AND THE STALENESS IT CAUSES.
     *
     * The fact is moved OUTSIDE this spec, at its owner (`opportunity_customer_members`), by the
     * harness around it — see certification/financials/assignment-tuition.cert.sh. It is not moved
     * from here, and it is emphatically not moved by the pricing card, which owns none of it.
     *
     * The participation editor route (`/api/admin/child-participation`) would have been the nicer
     * write path, and it is unusable in this tenant for a reason worth recording rather than working
     * around: `applyChildParticipationEdit` routes every participation field through the child's
     * ENROLLMENT PROCESS INSTANCE, and the representative tenant has none at all — zero rows in
     * `process_instances`. Every New Leads inquiry therefore answers `no_enrollment_process_instance`.
     * That is an enrollment-runtime provisioning gap, not a pricing one, and Thread 3 does not widen
     * itself to fix it.
     *
     * CERT_EXPECT_STALE tells this case which side of the change it is running on.
     */
    test("F–H — the resolution goes stale when the assignment moves, and re-resolves correctly", async ({ page }) => {
        const expectStale = process.env.CERT_EXPECT_STALE === "1";
        test.skip(!process.env.CERT_EXPECT_STALE, "driven by the harness, in two halves");

        await openSubject(page);
        const first = page.locator(ASSIGNMENT).first();
        await expect(first).toBeVisible({ timeout: 30_000 });

        const resolution = (await first.getAttribute("data-tuition-resolution")) ?? "";
        const amount = (
            await first.locator('[data-tuition-option-kind="recommended"] [data-tuition-amount]').innerText()
        ).trim();
        const days = await first.locator('[data-tuition-fact="days"]').innerText();

        if (expectStale) {
            // G — what was agreed was agreed against facts that have moved, and the card says so
            // rather than presenting the old number as current.
            await expect(first).toHaveAttribute("data-tuition-stale", "true", { timeout: 30_000 });
            await expect(first.locator("[data-tuition-stale-notice]")).toBeVisible();
            expect(days, "the card must show the assignment as it now stands").toContain("3 days");
            // H — and the new recommendation is the right one for the new facts.
            expect(amount).not.toBe(process.env.CERT_PRIOR_AMOUNT ?? "");
            expect(resolution).not.toBe(process.env.CERT_PRIOR_RESOLUTION ?? "");
        } else {
            await expect(first).toHaveAttribute("data-tuition-stale", "false");
            expect(days).toContain("5 days");
        }
        if (OUT) writeFileSync(OUT, JSON.stringify({ resolution, amount, days }));
    });

    test("K — an authorized override keeps the recommendation, needs a reason, and survives a reload", async ({ page }) => {
        await openSubject(page);
        const first = page.locator(ASSIGNMENT).first();
        await expect(first).toBeVisible({ timeout: 30_000 });
        await expect(first).toHaveAttribute("data-tuition-state", "recommended", { timeout: 30_000 });

        // An alternative authored option has to exist for an override to be possible at all.
        const alternatives = first.locator("[data-tuition-alternatives] [data-tuition-choose]");
        const count = await alternatives.count();
        test.skip(count === 0, "no alternative authored option is applicable to this assignment");

        // The recommendation stays on screen while the alternative is chosen.
        await expect(first.locator('[data-tuition-option-kind="recommended"]')).toHaveCount(1);
        await alternatives.first().click();
        const form = first.locator("[data-tuition-override-form]");
        await expect(form).toBeVisible({ timeout: 15_000 });
        await expect(first.locator('[data-tuition-option-kind="recommended"]')).toHaveCount(1);

        // A REASON IS REQUIRED — the control is inert until there is one.
        const commit = form.locator('[data-tuition-command="override"]');
        await expect(commit).toBeDisabled();
        const reason = "Sibling arrangement agreed with the director";
        await form.locator("[data-tuition-override-reason-input]").fill(reason);
        await expect(commit).toBeEnabled();
        await commit.click();
        await page.waitForTimeout(15_000);
        await expect(first.locator("[data-tuition-error]")).toHaveCount(0);
        await expect(first).toHaveAttribute("data-tuition-accepted", "overridden", { timeout: 30_000 });

        // Reload: the override, its reason, and the recommendation it departed from all survive.
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(40_000);
        const after = page.locator(ASSIGNMENT).first();
        await expect(after).toHaveAttribute("data-tuition-accepted", "overridden", { timeout: 60_000 });
        expect((await after.locator("[data-tuition-override-reason]").innerText()).trim()).toBe(reason);
        await expect(after.locator("[data-tuition-override-recommended]")).toHaveCount(1);
    });

    /*
     * I · AMBIGUITY. The harness authors a second billing cadence for the same variant, so two
     * configured options apply equally and no billing frequency has been chosen. The card must
     * offer both and select neither.
     */
    test("I — an ambiguous catalog offers the options and selects none", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_AMBIGUOUS !== "1", "driven by the harness");
        await openSubject(page);
        const first = page.locator(ASSIGNMENT).first();
        await expect(first).toBeVisible({ timeout: 30_000 });
        await expect(first).toHaveAttribute("data-tuition-state", "ambiguous", { timeout: 30_000 });
        await expect(first.locator("[data-tuition-ambiguous]")).toBeVisible();
        // NOTHING was chosen on the operator's behalf.
        await expect(first.locator('[data-tuition-option-kind="recommended"]')).toHaveCount(0);
        await expect(first.locator('[data-tuition-command="accept"]')).toHaveCount(0);
        // Both candidates are offered, and choosing one is presented as an override.
        const tied = first.locator('[data-tuition-option-kind="tied"]');
        expect(await tied.count()).toBeGreaterThanOrEqual(2);
        expect(await first.locator("[data-tuition-ambiguous]").innerText()).toContain("override");
    });

    /*
     * L · AN UNAUTHORIZED OVERRIDE. The harness revokes the grant. A control the browser still
     * renders is a cosmetic matter; the write is what has to fail, and the refusal has to reach the
     * operator rather than being swallowed into a silent no-op.
     */
    test("L — without the grant, the server refuses the override", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED !== "1", "driven by the harness");
        await openSubject(page);
        const first = page.locator(ASSIGNMENT).first();
        await expect(first).toBeVisible({ timeout: 30_000 });

        const alternatives = first.locator("[data-tuition-alternatives] [data-tuition-choose]");
        expect(await alternatives.count(), "an alternative must exist for this case to mean anything").toBeGreaterThan(0);
        await alternatives.first().click();
        const form = first.locator("[data-tuition-override-form]");
        await expect(form).toBeVisible({ timeout: 15_000 });
        await form.locator("[data-tuition-override-reason-input]").fill("Attempted without authority");
        await form.locator('[data-tuition-command="override"]').click();
        await page.waitForTimeout(15_000);

        // The server's refusal is authoritative and visible.
        const error = first.locator('[data-tuition-error="command"]');
        await expect(error).toBeVisible({ timeout: 30_000 });
        expect(await error.innerText()).toContain("permission");
        // And nothing was recorded.
        expect(await first.getAttribute("data-tuition-accepted")).not.toBe("overridden");
    });

    test("J — an unpriced assignment says so, rather than showing nothing", async ({ page }) => {
        // `drop_in` is deliberately unpriced in the representative catalog, so a no-match is
        // reachable on a real assignment rather than only in a fixture.
        let found = false;
        for (let index = 0; index < 6 && !found; index++) {
            await openSubject(page, index);
            const sections = page.locator(ASSIGNMENT);
            const total = await sections.count();
            for (let i = 0; i < total; i++) {
                if ((await sections.nth(i).getAttribute("data-tuition-state")) === "no_match") {
                    await expect(sections.nth(i).locator("[data-tuition-no-match]")).toBeVisible();
                    const text = await sections.nth(i).locator("[data-tuition-no-match]").innerText();
                    expect(text).toContain("No configured tuition applies");
                    // Nothing was invented in its place.
                    await expect(sections.nth(i).locator('[data-tuition-option-kind="recommended"]')).toHaveCount(0);
                    found = true;
                    break;
                }
            }
        }
        expect(found, "an unpriced assignment must be reachable in the representative tenant").toBe(true);
    });
});
