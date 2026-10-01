import type {
    StripeElements,
    StripePaymentElement,
    StripePaymentElementOptions,
} from "@stripe/stripe-js";

/**
 * HOW STRIPE'S SECURE FIELDS ARE DRESSED, AND WHAT THEY ARE NOT ALLOWED TO SELL.
 *
 * Alloy owns the framing, the headings, the copy, the actions and the spacing around Elements.
 * Stripe owns the inputs themselves, because the card number and the CVC must never reach Alloy.
 * This module is the seam between those two ownerships, and it is deliberately the ONLY place
 * either decision is made — a second surface that re-decides them is how the two drift apart.
 *
 * ── EVERYTHING HERE IS SUPPORTED STRIPE CONFIGURATION ──
 *
 * No rule reaches inside the secure iframe's internals, and nothing is hidden with CSS. The
 * Appearance API (`variables` + `rules`) and the Payment Element's own `wallets` / `fields`
 * options are Stripe's documented customization surface; if Stripe changes a class name, the
 * worst case is that a rule stops applying, never that a field stops being secure.
 *
 * ── WHY LINK IS OFF ──
 *
 * The operator is already inside Alloy, on a known financial account, managing a known payer's
 * methods. Link's inline signup asks that operator for an email, a phone number and consent to
 * "save my information for faster checkout" — a SECOND consumer identity, belonging to neither
 * the operator nor reliably to the payer. `wallets.link: "never"` is Stripe's supported way to
 * decline it. Apple Pay and Google Pay are declined for the same reason: they are consumer
 * checkout affordances, and this surface is not a checkout.
 *
 * What is NOT suppressed: `terms`. Mandates and legal agreements stay on `auto`, so Stripe shows
 * them exactly when it must. Trimming compliance copy to make a surface tidier would be the one
 * customization here that could actually harm a payer.
 */

/** Alloy brand values, from `app/globals.css`. Stripe's iframe cannot read our CSS variables,
 *  so these must be literals — a `var(--color-alloy-bend-pine)` here resolves to nothing. */
const BEND_PINE = "#00A283";
const FORGE_INK = "#18273A";
const EMBER = "#BC4300";
const FIELD_BORDER = "#E2E6EC";
const MUTED_INK = "#59678B";

/**
 * Poppins is self-hosted by `next/font` in the parent document, which the Elements iframe cannot
 * see. Naming the family alone would silently fall back to system-ui, so the font is also served
 * to the iframe through Stripe's own `fonts` option — the supported mechanism for custom fonts.
 */
export const ALLOY_ELEMENTS_FONTS = [
    { cssSrc: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" },
];

/**
 * The Appearance object. `theme: "stripe"` is the neutral base; every Alloy-specific value is set
 * explicitly on top of it rather than inherited, so a future Stripe default cannot quietly change
 * how an Alloy surface looks.
 */
export const ALLOY_ELEMENTS_APPEARANCE = {
    theme: "stripe" as const,
    variables: {
        fontFamily: "Poppins, system-ui, sans-serif",
        /* Alloy operator surfaces read at 14px. Stripe warns that inputs under 16px can make
           mobile browsers zoom; this is a desktop operator surface, and the rest of Financials
           is 14px, so matching the surround wins over the mobile default. */
        fontSizeBase: "14px",
        spacingUnit: "4px",
        /* `rounded-lg` — the radius the Alloy field framing around this element already uses. */
        borderRadius: "8px",
        colorPrimary: BEND_PINE,
        colorBackground: "#FFFFFF",
        colorText: FORGE_INK,
        colorDanger: EMBER,
    },
    rules: {
        ".Input": {
            border: `1px solid ${FIELD_BORDER}`,
            boxShadow: "none",
            padding: "8px 10px",
        },
        /* Bend Pine is the active/selected accent in Alloy; focus is where it belongs. */
        ".Input:focus": {
            border: `1px solid ${BEND_PINE}`,
            boxShadow: `0 0 0 2px rgba(0, 162, 131, 0.18)`,
        },
        ".Input--invalid": {
            border: `1px solid ${EMBER}`,
            boxShadow: "none",
        },
        ".Label": {
            color: MUTED_INK,
            fontWeight: "500",
            fontSize: "12px",
        },
        ".Error": {
            color: EMBER,
            fontSize: "12px",
        },
        /* Card-only setups render no tabs at all; these exist so that if a rail ever offers a
           choice, the selected state is Alloy's accent rather than Stripe blue. */
        ".Tab": {
            border: `1px solid ${FIELD_BORDER}`,
            boxShadow: "none",
        },
        ".Tab:hover": {
            color: FORGE_INK,
        },
        ".Tab--selected": {
            borderColor: BEND_PINE,
            color: FORGE_INK,
            boxShadow: `0 0 0 1px ${BEND_PINE}`,
        },
    },
};

/**
 * ── WHY THIS TYPE EXISTS ──
 *
 * Two of the options below are current, documented Stripe configuration that the PINNED TYPINGS
 * do not know about. `@stripe/stripe-js` is held at ^2.4.0 here, and in that version
 * `PaymentWalletsOption` has only `applePay` and `googlePay`, and a field option is
 * `"auto" | "never"` with no `"if_required"`.
 *
 * The npm package is the loader and the types; the RUNTIME is `js.stripe.com/v3`, which is always
 * Stripe's current build and does support both. So this is a typings lag, not a capability we are
 * inventing — and the honest repair is a narrow, named widening rather than `any`, which would
 * stop checking the values as well as the shape. Every value below is still literal-checked.
 *
 * Bumping the dependency instead was considered and deliberately not done in this slice: it is a
 * major-version move across three live payments surfaces, and it would put a dependency upgrade
 * inside a product change. When it happens, delete this type and the cast with it.
 *
 * Because the widening is local, MOUNTED QA is what actually proves the runtime honours these —
 * a green typecheck here proves only that we spelled them correctly.
 */
type OperatorPaymentElementOptions = Omit<StripePaymentElementOptions, "wallets" | "fields"> & {
    wallets?: { applePay?: "auto" | "never"; googlePay?: "auto" | "never"; link?: "auto" | "never" };
    fields?: {
        billingDetails?: {
            address?:
                | "auto"
                | "never"
                | "if_required"
                | { country?: "auto" | "never"; postalCode?: "auto" | "never" };
        };
    };
    defaultValues?: { billingDetails?: { name?: string } };
};

/**
 * Payment Element options for an ALLOY OPERATOR surface.
 *
 * `wallets.*: "never"` declines Link, Apple Pay and Google Pay — see this module's header.
 *
 * ── WHY `address: "auto"` AND NOT `if_required` ──
 *
 * This shipped as `if_required`, and mounted QA showed what that actually meant for this account:
 * Stripe decided the postal code was NOT required and dropped it, so the card form collected
 * number, expiry and CVC and nothing else. That is a defensible reading of "ZIP where required"
 * and a poor one for a card-on-file that will be charged unattended for months — the postal code
 * is the AVS signal on a card-not-present charge, and Stripe warns that reducing address
 * collection can lower authorization rates.
 *
 * `auto` lets Stripe ask for the postal code it wants for authorization without turning the
 * surface into a full billing-address form. `never` remains wrong for the original reason: it
 * makes the CALLER owe Stripe the omitted values at confirm time, and a surface that never
 * collected them fails at the last step.
 */
export const ALLOY_OPERATOR_PAYMENT_ELEMENT_OPTIONS: OperatorPaymentElementOptions = {
    layout: { type: "tabs" },
    wallets: { link: "never", applePay: "never", googlePay: "never" },
    fields: { billingDetails: { address: "auto" } },
};

/**
 * What Alloy already knows about the payer, offered to Stripe as a PREFILL.
 *
 * A prefill is not an assertion. Alloy knows who the payer is, so making the operator retype that
 * name is pointless — but Alloy does NOT know that the payer's name and address are the
 * cardholder's billing details, and Stripe's own fields remain editable so the operator or payer
 * can correct them.
 *
 * ADDRESS IS DELIBERATELY ABSENT. The canonical address Alloy holds for a household is a SERVICE
 * location (`locations`, customer-scoped, created by the booking flow) — where care happens. That
 * is not necessarily where the card is billed, and prefilling it would quietly assert exactly the
 * thing this comment refuses to assert. Wiring it needs a billing-address decision, not a lookup.
 */
export type OperatorBillingPrefill = {
    /** The canonical payer's name. Safe: Alloy owns it and the field stays editable. */
    name?: string | null;
};

/**
 * THE ONLY PLACE AN ALLOY OPERATOR PAYMENT ELEMENT IS CREATED.
 *
 * Both Elements surfaces call this rather than `els.create("payment", ...)` of their own, so the
 * appearance, the declined wallets and the field policy cannot diverge between them — and the one
 * cast the pinned typings force lives here, once, instead of at every call site.
 */
/**
 * ── WHY THE SETUP FLOW TELLS STRIPE *NOT* TO COLLECT A POSTAL CODE ──
 *
 * Measured twice on deployed staging: with `address: "auto"` AND with `"if_required"`, Stripe
 * rendered `number`, `expiry`, `cvc` and no postal code at all. That is not a misconfiguration —
 * `FieldOption` is `"auto" | "never"`, there is no `"always"`, and the Payment Element simply
 * cannot be made to require one. So a card stored for unattended collection had no AVS signal.
 *
 * Alloy therefore owns the field. And once Alloy owns it, `postalCode: "never"` is the CORRECT
 * setting rather than a redundant one: Stripe documents that "details collected by Elements will
 * override values passed here", so leaving collection on `auto` would mean racing an override for
 * a field the operator typed. `never` states plainly that this value arrives at confirmation, which
 * is exactly the contract Stripe describes for fields omitted via `fields`.
 *
 * It is scoped to SETUP. The payment-collection surface keeps its own configuration, because a
 * surface that stopped collecting a field without also supplying it at confirm would fail at the
 * last step — the precise trap this option carries.
 */
/*
 * ── WHY `if_required` AND NOT `{ postalCode: "never" }` ──
 *
 * The object form was tried first and mounted QA caught what it did: naming ONE subfield leaves the
 * others on their default, so Stripe began rendering a COUNTRY selector — geo-defaulted to Austria
 * on a US childcare account. An unnecessary consumer field, pre-filled wrongly, next to a card.
 *
 * `if_required` is measured to render no address fields at all for this account, which is the state
 * this surface already shipped with. Nothing is collected, so nothing can override the postal code
 * supplied at confirmation — the override concern that motivated `never` does not arise when the
 * Element asks for no address in the first place.
 *
 * The residual risk is stated rather than hidden: if Stripe ever decides a postal code IS required
 * for some account, it would render one beside Alloy's. That is a visible duplicate — findable and
 * fixable — and strictly better than shipping a country field defaulted to the wrong country.
 */
const SETUP_ADDRESS_OWNED_BY_ALLOY = "if_required" as const;

export function createAlloyOperatorPaymentElement(
    els: StripeElements,
    prefill?: OperatorBillingPrefill & { alloyCollectsPostalCode?: boolean },
): StripePaymentElement {
    const name = prefill?.name?.trim();
    const options: OperatorPaymentElementOptions = {
        ...ALLOY_OPERATOR_PAYMENT_ELEMENT_OPTIONS,
        ...(name ? { defaultValues: { billingDetails: { name } } } : {}),
        ...(prefill?.alloyCollectsPostalCode
            ? { fields: { billingDetails: { address: SETUP_ADDRESS_OWNED_BY_ALLOY } } }
            : {}),
    };
    return els.create("payment", options as unknown as StripePaymentElementOptions);
}
