/**
 * THE PRE-W7 FINDINGS, each bound where it was measured.
 *
 * Every case here corresponds to something an operator actually met on deployed staging during the
 * Held/Deposit lifecycle QA. The behavioural halves exercise the authority; the mount halves assert
 * the PRODUCTION wiring supplies it, because a repaired component fed ideal props proves only that
 * the component can be right.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
    chargeDisplayLabel,
    isMachineKeyDescription,
} from "@/lib/financials/chargeCategories";
import {
    isMachineVocabulary,
    operatorRefusal,
    TRANSLATED_REFUSAL_CODES,
} from "@/lib/financials/commands/operatorRefusal";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const HOST = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";
const ADAPTER = "lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts";
const APPLICATION_VIEW = "lib/financials/paymentApplicationView.ts";
const CSS = "app/adminV2/components/operationalCardsShared.css";

/* ── FINDING 3 — raw machine vocabulary ──────────────────────────────────────────────────────── */

describe("finding 3 — an operator is never shown the domain's shorthand", () => {
    it("translates the token that was measured in front of one", () => {
        const copy = operatorRefusal("missing_service_period");
        expect(copy).not.toBe("missing_service_period");
        expect(copy).toMatch(/service period/i);
        /* A sentence, not a token: it has spaces and it ends. */
        expect(copy).toMatch(/\s/);
        expect(copy.trim()).toMatch(/\.$/);
    });

    it("leaves the domain's own words exactly as written", () => {
        const domain = "This deposit was taken as non-refundable, so it cannot be refunded.";
        expect(operatorRefusal(domain)).toBe(domain);
    });

    it("never hands back a bare token, even one nobody has written copy for", () => {
        const copy = operatorRefusal("some_future_code_nobody_mapped");
        expect(isMachineVocabulary(copy)).toBe(false);
        /* And the code survives for whoever reads the logs. */
        expect(copy).toContain("some_future_code_nobody_mapped");
    });

    it("does not replace a real refusal with a shrug", () => {
        expect(operatorRefusal("missing_event_date")).not.toMatch(/something went wrong/i);
    });

    it("covers every token the charge path can produce", () => {
        for (const token of ["missing_service_period", "missing_event_date", "unknown_occurs_strategy"]) {
            expect(TRANSLATED_REFUSAL_CODES).toContain(token);
        }
    });

    it("the production mount routes the charge refusal through it", () => {
        const host = read(HOST);
        expect(host).toContain('operatorRefusal(err, "The charge was refused.")');
    });
});

/* ── FINDING 4 — a stored key is not the operator's word ─────────────────────────────────────── */

describe("finding 4 — business labels where a template key was leaking", () => {
    it("yields to the catalog when the description is the key", () => {
        expect(chargeDisplayLabel("late_pickup_fee", "late_pickup")).toBe("Late pickup");
        expect(chargeDisplayLabel("materials_fee", "materials")).toBe("Materials");
        expect(chargeDisplayLabel("tuition", "tuition")).toBe("Tuition");
    });

    it("keeps what a person actually wrote", () => {
        expect(chargeDisplayLabel("Field trip to the aquarium", "materials"))
            .toBe("Field trip to the aquarium");
        expect(chargeDisplayLabel("Late pickup, 21 Sept", "late_pickup")).toBe("Late pickup, 21 Sept");
        /* One word a person could type is not a key. */
        expect(chargeDisplayLabel("Aquarium", "materials")).toBe("Aquarium");
    });

    it("recognises a key for what it is", () => {
        expect(isMachineKeyDescription("late_pickup_fee", "late_pickup")).toBe(true);
        expect(isMachineKeyDescription("registration_fee")).toBe(true);
        expect(isMachineKeyDescription("Field trip")).toBe(false);
        expect(isMachineKeyDescription("")).toBe(false);
    });

    it("falls back to something sayable when there is neither", () => {
        expect(chargeDisplayLabel(null, null)).toBe("Charge");
    });

    it("the production reads use it — the application view and both payment targets", () => {
        expect(read(APPLICATION_VIEW)).toContain("chargeLabel: chargeDisplayLabel(");
        const host = read(HOST);
        expect(host).toContain("chargeDisplayLabel(row.description, row.categoryKey, row.categoryLabel)");
        expect(host).toContain("chargeDisplayLabel(r.description, r.categoryKey, r.categoryLabel)");
        /* And the old shape is gone, so a key cannot come back through it. */
        expect(host).not.toContain("label: row.description ?? row.categoryLabel");
        expect(host).not.toContain("label: r.description ?? r.categoryLabel");
    });
});

/* ── FINDING 5 — a mounted control is never silently inert ───────────────────────────────────── */

describe("finding 5 — Payment says why, or it acts", () => {
    it("the host computes a reason whenever nothing is payable", () => {
        const host = read(HOST);
        expect(host).toContain("const paymentUnavailableReason");
        expect(host).toMatch(/payableRows\.length[\s\S]{0,40}\?\s*null/);
    });

    it("the production mount hands the reason to the card beside the opener", () => {
        const host = read(HOST);
        expect(host).toContain("onPayment={openSettle}");
        expect(host).toContain("paymentUnavailableReason={paymentUnavailableReason}");
    });

    it("the card renders the control disabled and carrying the reason, never live-but-dead", () => {
        const detail = read(DETAIL);
        const i = detail.indexOf("<Action\n                            primary");
        expect(i).toBeGreaterThan(-1);
        const block = detail.slice(i, i + 400);
        expect(block).toContain("disabled={!onPayment}");
        expect(block).toContain("paymentUnavailableReason");
    });
});

/* ── FINDING 6 — an idempotent no-op is not a new write ──────────────────────────────────────── */

describe("finding 6 — a duplicate charge says what actually happened", () => {
    it("the host decides on write_status, not on the presence of an id", () => {
        const host = read(HOST);
        expect(host).toContain("const wroteSomething");
        expect(host).toMatch(/write_status === "created"[\s\S]{0,60}write_status === "recalculated"/);
    });

    it("and tells the operator nothing was created", () => {
        const host = read(HOST);
        expect(host).toMatch(/already exists on this account\. Nothing new was created/);
        expect(host).toContain('data-financials-command-notice="true"');
    });

    it("the no-op is a notice, not an error — it is a true outcome", () => {
        const host = read(HOST);
        const i = host.indexOf("const wroteSomething");
        const block = host.slice(i, i + 1400);
        expect(block).toContain("setCommandNotice(");
        expect(block).not.toContain("setCommandError(");
    });
});

/* ── FINDING 7 — a deposit's history outlives its money ──────────────────────────────────────── */

describe("finding 7 — completed lots stay inspectable, and count for nothing", () => {
    it("the adapter emits history from the lots the position excludes", () => {
        const adapter = read(ADAPTER);
        expect(adapter).toContain("heldDepositHistory:");
        /* The position keeps only open lots; the history takes the closed ones that have a story. */
        expect(adapter).toContain(".filter((h) => h.open)");
        expect(adapter).toContain(".filter((h) => !h.open && h.dispositions.length > 0)");
    });

    it("the card renders it as history, with no controls on a lot that holds nothing", () => {
        const detail = read(DETAIL);
        expect(detail).toContain('data-financials-held-history="true"');
        expect(detail).toContain("Deposit history");
        const i = detail.indexOf('data-financials-held-history="true"');
        const block = detail.slice(i, detail.indexOf("</div>", detail.indexOf("heldlist", i)) + 6);
        for (const control of ["onApplyHeldFunds", "onReleaseHeldFunds", "onRefundHeldFunds"]) {
            expect(block, `${control} must not be offered on a spent lot`).not.toContain(control);
        }
    });

    it("says plainly that it changes no figure above it", () => {
        expect(read(DETAIL)).toMatch(/hold no money and change no\s+figure above/);
    });
});

/* ── FINDING 8 — two scopes must not share one word ──────────────────────────────────────────── */

describe("finding 8 — receipt money terminology", () => {
    it("the word 'unapplied' is used alone only where nothing has gone back", () => {
        const host = read(HOST);
        expect(host).toContain("of what was kept is unapplied");
        /* The two spellings are one ternary: the gross word only on the branch with no refunds. */
        const i = host.indexOf("of what was kept is unapplied");
        const branch = host.slice(i - 400, i + 200);
        expect(branch).toContain("p.refundedCents > 0");
        expect(branch).toMatch(/unapplied`\s*}/);
    });

    it("the receipt states what is restricted and what is actually applicable", () => {
        const host = read(HOST);
        expect(host).toContain("available to apply");
        expect(host).toContain('data-financials-payment-held=');
        expect(host).toContain('data-financials-payment-applicable=');
    });

    it("the production mount supplies the held figure the row states", () => {
        const adapter = read(ADAPTER);
        expect(adapter).toContain("heldCents: p.heldCents ?? 0,");
    });
});

/* ── VISUAL — the three acts on a deposit are not peers ──────────────────────────────────────── */

describe("the held row's action hierarchy", () => {
    const css = () => read(CSS);

    it("gives Apply the product's active accent", () => {
        expect(css()).toMatch(
            /\.alloy-os-fdetail__heldactions \[data-financials-row-action="apply"\] \{[^}]*--alloy-os-bend-pine/,
        );
    });

    it("keeps Release at the row's ordinary weight", () => {
        expect(css()).toMatch(
            /\.alloy-os-fdetail__heldactions \[data-financials-row-action="release"\] \{[^}]*--alloy-os-midnight/,
        );
    });

    it("marks Refund as the destructive one, in the grammar already here", () => {
        expect(css()).toMatch(
            /\.alloy-os-fdetail__heldactions \[data-financials-row-action="refund"\]:hover[\s\S]{0,200}--alloy-os-danger/,
        );
    });

    it("introduces no navy or black primary, and no new primitive", () => {
        const block = css().slice(css().indexOf(".alloy-os-fdetail__heldactions"));
        const scoped = block.slice(0, block.indexOf("\n.alloy-os-billing"));
        expect(scoped).not.toMatch(/background:\s*(#000|#18273a|var\(--alloy-os-midnight)/i);
        /* Styled through the attribute the control already carries. */
        expect(scoped).toContain('[data-financials-row-action="apply"]');
    });
});
