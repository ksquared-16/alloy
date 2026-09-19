/**
 * §1 — RECURRING_TERMS_OPERATOR_REACHABILITY_GAP, closed through the canonical publication path.
 *
 * `billing_preview` (AssignmentTuitionCard) owns acceptance of recurring tuition terms and is in
 * ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS, but the tenant's published layout never placed it — so no
 * operator on this tenant could establish or change a child's recurring terms from the panel they
 * actually work in.
 *
 * Placed beside `scheduling`, which is the other assignment-grain card: one answers "what is this
 * child enrolled in", the other "is that enrolment priced". Where there is no assignment the card
 * says "No assignment on this record to price." rather than rendering an empty frame, so it does
 * not clutter unrelated subjects.
 *
 * APPEND-ONLY. This clones the current published doc into a NEW draft and publishes that. No
 * historical record is edited and no version is rewritten.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cfz";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("publish billing_preview onto the enrolment Focus Panel", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const result = await page.evaluate(async () => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
        const cur = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const published = (cur.body as { published?: { version?: number; doc?: { sections?: Array<Record<string, unknown>> } } } | null)?.published;
        if (!published?.doc) return { step: "read", cur };
        const doc = JSON.parse(JSON.stringify(published.doc)) as { sections: Array<Record<string, unknown>> };

        const already = doc.sections.find((s) => (s.metadata as { focusPanelCard?: { key?: string } })?.focusPanelCard?.key === "billing_preview");
        if (already) return { step: "already_placed", version: published.version };

        // Model the new section on `scheduling`: the other assignment-grain card on this panel.
        const model = doc.sections.find((s) => (s.metadata as { focusPanelCard?: { key?: string } })?.focusPanelCard?.key === "scheduling");
        if (!model) return { step: "no_model", keys: doc.sections.map((s) => s.key) };
        const section = JSON.parse(JSON.stringify(model)) as Record<string, unknown>;
        section.id = "fp-card-billing-preview";
        section.key = "billing_preview";
        section.title = "Billing Preview";
        const meta = section.metadata as { focusPanelCard: Record<string, unknown> };
        meta.focusPanelCard = {
            ...meta.focusPanelCard,
            key: "billing_preview",
            instanceId: "billing_preview",
            /* Work, not reference: "is this enrolment priced" is an action an operator takes. */
            tier: "work",
        };
        // Beside scheduling, so the enrolment and its price read together.
        const at = doc.sections.indexOf(model);
        doc.sections.splice(at + 1, 0, section);

        const created = await j(await fetch("/api/admin/entity-layouts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                entity_type: "opportunities",
                surface: "drawer",
                layout_key: "focus_panel_summary",
                name: "Focus Panel Summary — recurring tuition terms reachable (billing_preview)",
                doc,
            }),
        }));
        const id = (created.body as { id?: string; layout?: { id?: string }; record?: { id?: string } } | null)?.id
            ?? (created.body as { layout?: { id?: string } } | null)?.layout?.id
            ?? (created.body as { record?: { id?: string } } | null)?.record?.id;
        if (!id) return { step: "create", created };
        const pubd = await j(await fetch(`/api/admin/entity-layouts/${id}/publish`, {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: "{}",
        }));
        const after = await j(await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" }));
        const sections = ((after.body as { published?: { doc?: { sections?: Array<Record<string, unknown>> } } } | null)?.published?.doc?.sections ?? []);
        return {
            step: "done",
            fromVersion: published.version,
            newVersion: (after.body as { published?: { version?: number } } | null)?.published?.version,
            createdStatus: created.status,
            publishStatus: pubd.status,
            cards: sections.map((s) => (s.metadata as { focusPanelCard?: { key?: string; tier?: string } })?.focusPanelCard?.key),
            placed: sections.some((s) => (s.metadata as { focusPanelCard?: { key?: string } })?.focusPanelCard?.key === "billing_preview"),
        };
    });
    writeFileSync(`${OUT}/publish.json`, JSON.stringify(result, null, 2));
    log(JSON.stringify(result, null, 2).slice(0, 1400));
    expect((result as { step?: string }).step === "done" || (result as { step?: string }).step === "already_placed").toBe(true);
});
