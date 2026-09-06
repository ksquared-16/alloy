/**
 * FINANCIALS SMOKE — one real charge, written from the mounted card, surviving a reload.
 *
 * This is the proof that the mount is OPERABLE and not merely visible. Every step is the operator's
 * own path: the queue row opens the subject, the Focus Panel mounts the Financials card, and the
 * charge is created by clicking the card's own Add-charge control, which issues the registered
 * `charge.add` action through `/api/admin/actions/execute`. Nothing is written to the database here,
 * and no Financials behaviour is modified to make it pass.
 *
 * ── WHAT THIS PROOF FOUND ──
 *
 * Its first run was red, and the reason was a product finding rather than a harness one. The
 * representative tenant holds ZERO `child_enrollment_agreements` — every New Leads family is
 * pre-enrolment, which is what New Leads MEANS. `buildFinancialsCardVM` derives `vm.subjects`
 * exclusively from agreements, so the card's `chargeTarget` was null and BOTH `preview()` and
 * `commit()` opened with `if (!chargeTarget …) return`. The overlay still opened, still rendered an
 * amount from the template's own configuration, and still offered an enabled "Add charge" that
 * issued no request at all: not one call to `/api/admin/actions/execute`, and `charges` at 0.
 *
 * The domain had been ready the whole time. `resolveChargeSubject` falls through to
 * `kind: "customer"` when a child has no agreement — "a pre-enrolment child's fee is the FAMILY's,
 * and that is a real, chargeable subject" — and the card already held the household id. The card
 * was silently refusing to ask a question the resolver would answer. The invocation now travels at
 * the grain the panel HAS, and the resolver still decides the subject.
 *
 *   S1  the mounted card's read projection loads
 *   S2  exactly one Add Charge is executed through the real UI
 *   S3  the card refreshes to committed truth
 *   S4  a full reload, re-opening the same subject, still shows it
 *
 * The authoritative charge count and the durable row are asserted against Postgres by the harness
 * around this spec — a card agreeing with itself is not persistence.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

const WORK_VIEW = "/workspace/work-unit/new-leads";
/**
 * The operator's own BOS presentation preference, read from sessionStorage on mount.
 *
 * BOS defaults to `floating`: a fixed, operator-parked rail that deliberately sits ABOVE workspace
 * modals ("Floating must sit above Operational Workspace modals (z≈70) without trapping as modal").
 * At this viewport the auto-parked rail lands over the Add Charge command's footer, and its composer
 * subtree intercepts the pointer — the submit button is visible, enabled and stable, and the click
 * still never reaches it. That is the assistant rail's placement, not a Financials defect, and an
 * operator meeting it closes the rail. This certification does the same thing, before navigating,
 * so the proof is about the charge and not about where BOS parked itself.
 */
const BOS_PRESENTATION_STATE_KEY = "alloy:v1:admV2:shell:bosPresentationState";
/** Where the harness reads back which subject this run actually operated on. */
const SUBJECT_OUT = process.env.CERT_SUBJECT_OUT || "";

test.describe("financials smoke — a real charge through the mounted card", () => {
    test("one Add Charge commits, refreshes, and survives a reload", async ({ page }) => {
        const bodyText = async () => (await page.locator("body").innerText().catch(() => "")) || "";

        /** Every registered-action call the page makes — the mutation cannot be faked past this. */
        const executeCalls: string[] = [];
        page.on("request", (req) => {
            if (req.url().includes("/api/admin/actions/execute")) {
                executeCalls.push(String(req.postData() ?? ""));
            }
        });

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

        // ── Open the subject through the queue, exactly as the mount certification does ──────────
        await page.goto(WORK_VIEW);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(45_000);

        const rows = page.locator('[data-entity-type="opportunity"][data-entity-id]');
        await expect(rows.first()).toBeVisible({ timeout: 60_000 });
        const subjectId = await rows.first().getAttribute("data-entity-id");
        expect(subjectId).toBeTruthy();
        if (SUBJECT_OUT) writeFileSync(SUBJECT_OUT, String(subjectId));

        await rows.first().click();
        await page.waitForTimeout(25_000);
        await expect(page).toHaveURL(new RegExp(`subject_id=${subjectId}`));

        // ── S1 · THE READ PROJECTION LOADS ──────────────────────────────────────────────────────
        const before = await bodyText();
        expect(before, "the Financials card must be mounted").toContain("FINANCIALS");
        expect(before, "its authoritative projection must load").toContain("Current balance");

        // ── S2 · ONE ADD CHARGE, THROUGH THE CARD'S OWN CONTROL ─────────────────────────────────
        // The mounted card publishes two affordances at this density — "Add charge →" and
        // "Details →". Add charge opens the card's own Add Charge command overlay, which previews
        // through the resolver and commits via the registered `charge.add` action.
        const addCharge = page.getByRole("button", { name: /Add charge/ }).first();
        await expect(addCharge, "the mounted card must offer Add charge").toBeVisible({
            timeout: 30_000,
        });
        await addCharge.click();

        const overlay = page.locator('[data-financials-overlay="add_charge"]');
        await expect(overlay, "the Add Charge command must open").toBeVisible({ timeout: 30_000 });
        await expect(
            overlay.locator("[data-addcharge-template]"),
            "the tenant's configured template must load",
        ).toBeVisible({ timeout: 30_000 });

        // The assistant rail is out of the way, so the click below is a real operator click.
        expect(
            await page.locator('[data-adminv2-bos-rail-overlay][data-bos-overlay-mode]').count(),
            "the operator's closed BOS preference must be honoured",
        ).toBe(0);

        // The single mutation.
        const submit = overlay.getByRole("button", { name: "Add charge" });
        await expect(submit).toBeVisible({ timeout: 30_000 });
        await submit.click();
        await page.waitForTimeout(25_000);

        // ── S3 · THE CARD REFRESHES TO COMMITTED TRUTH ──────────────────────────────────────────
        // A no-op is not a pass. The click must have reached the registered action at all, before
        // any question of whether the domain accepted it.
        expect(
            executeCalls.filter((b) => b.includes('"mode":"execute"')).length,
            "Add charge must issue charge.add — a silent return is the defect this proof exists to catch",
        ).toBe(1);
        // A refusal is surfaced by the command, never swallowed — assert it did not happen.
        expect(
            await overlay.locator("[data-addcharge-error]").count(),
            "the command must not have been refused",
        ).toBe(0);
        const after = await bodyText();
        expect(after).toContain("FINANCIALS");

        // The command card closes on success only — a refusal keeps it open with the domain's own
        // message. Its absence is therefore the card agreeing that the write committed.
        await expect(overlay, "the command must close on a committed charge").toHaveCount(0, {
            timeout: 30_000,
        });

        // ── S4 · A FULL RELOAD, RE-OPENING THE SAME SUBJECT ─────────────────────────────────────
        // The URL still carries subject_id, so this is the same Opportunity reached by a cold load —
        // nothing in memory survives it, and the projection is rebuilt from the database.
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(40_000);
        const reloaded = await bodyText();
        expect(reloaded, "the card must mount again after a reload").toContain("FINANCIALS");
        expect(reloaded).toContain("Current balance");

        // ── S5 · THE PROJECTION CARRIES THE COMMITTED CHARGE ────────────────────────────────────
        // A draft does not move the balance — "creates a draft, and a draft is not owed" — so the
        // proof is the LEDGER, reached through the card's own Details control.
        await page.getByRole("button", { name: /Details/ }).first().click();
        // The detail card is drawn by the Focus Panel's own depth layer, so the card's wrapper has
        // no box of its own to be "visible" — the ledger's arrival in the document is the signal.
        await expect
            .poll(async () => await bodyText(), { timeout: 30_000 })
            .toContain("Registration fee");
        const ledger = await bodyText();
        expect(ledger, "the committed charge must appear in the rebuilt ledger").toContain("$150.00");
        // A draft, and said to be one — Add charge creates what is not yet owed, which is why the
        // balance above it correctly still reads $0.00.
        expect(ledger, "and it must be a draft, not silently owed").toContain("draft");
        // Attribution, read back through the product: the charge is the HOUSEHOLD's. A family
        // expense pinned onto whichever sibling sorted first is the failure the resolver exists to
        // prevent, and this is the row the resolver actually produced.
        expect(ledger).toContain("Household");

        // Exactly one execution for the whole journey — the reload replayed nothing.
        expect(
            executeCalls.filter((b) => b.includes('"mode":"execute"')).length,
            "a reload must not replay the mutation",
        ).toBe(1);
    });
});
