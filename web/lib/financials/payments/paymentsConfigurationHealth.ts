/**
 * WHETHER THIS RUNTIME CAN TAKE MONEY — answerable without pressing a financial control.
 *
 * Payments configuration was being discovered one human click at a time: an operator pressed Add
 * card, met `STRIPE_SECRET_KEY is not configured`, fixed that, pressed it again, and met a second
 * refusal about browser tokenization. Each refusal was correct and fail-closed. The problem was that
 * the only way to learn a requirement was to run into it while trying to move a family's money.
 *
 * This reports the whole contract at once.
 *
 * ── WHAT IT MUST NEVER DO ──
 *
 * Return a value. Not truncated, not masked, not "just the prefix". It answers PRESENCE and MODE,
 * both derived here and neither reversible into a credential. `sk_test_…` and `pk_test_…` are
 * Stripe's documented key FORMATS, so reporting the word `test` leaks nothing that the account's own
 * dashboard does not already say.
 *
 * ── THE TRAP THIS ENCODES ──
 *
 * `NEXT_PUBLIC_*` is resolved when the app is BUILT, not when it runs. A server-side read therefore
 * proves the variable is in the runtime environment and proves NOTHING about whether the browser
 * bundle carries it. Setting it and redeploying an existing build leaves the browser exactly as it
 * was. That distinction is why `browserTokenization` is reported separately from the others and
 * carries its own caveat — it is the single fact that cost this workstream two round trips.
 */

import { resolvePublishableFromEnv } from "@/lib/financials/payments/stripePublishableKey";

export type ConfigPresence = "present" | "absent";
export type StripeMode = "test" | "live" | "unknown";

export type PaymentsConfigurationHealth = {
    /** Server-side Stripe API access: connect, SetupIntents, collection, refunds. */
    providerApi: { status: ConfigPresence; mode: StripeMode; variable: "STRIPE_SECRET_KEY" };
    /** Webhook signature verification. Absent means every real delivery is rejected. */
    webhookVerification: { status: ConfigPresence; variable: "STRIPE_WEBHOOK_SECRET" };
    /**
     * Browser card tokenization. Server-visible only; see the header — the BROWSER has this
     * exactly when the BUILD had it, which a server read cannot establish.
     */
    browserTokenization: {
        status: ConfigPresence;
        mode: StripeMode;
        /** WHICH name supplied it. Null when neither is set. */
        variable: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" | "NEXT_PUBLIC_STRIPE_PUBLISHABLE" | null;
        caveat: string;
    };
    /** The origin Stripe returns onboarding to. Falls back to localhost when absent. */
    returnOrigin: { status: ConfigPresence; variable: "NEXT_PUBLIC_APP_URL" };
    /** Either credential admits the generic scheduled-work clock; one is enough. */
    scheduledWorkAdmission: { status: ConfigPresence; variables: string[] };
    /** A test secret with a live publishable key is a configuration that cannot work. */
    modeCoherent: boolean;
    /** True only when everything W1–W5 needs on the SERVER is present and coherent. */
    serverReady: boolean;
};

function present(v: string | undefined): ConfigPresence {
    return (v ?? "").trim() ? "present" : "absent";
}

/** From the documented key format only. Never from the key's content beyond its prefix. */
export function stripeModeOf(key: string | undefined): StripeMode {
    const k = (key ?? "").trim();
    if (!k) return "unknown";
    if (k.startsWith("sk_test_") || k.startsWith("pk_test_") || k.startsWith("rk_test_")) return "test";
    if (k.startsWith("sk_live_") || k.startsWith("pk_live_") || k.startsWith("rk_live_")) return "live";
    return "unknown";
}

const BUILD_TIME_CAVEAT =
    "NEXT_PUBLIC_* is resolved at BUILD time. Present here means the runtime environment has it; the "
    + "browser bundle carries it only if the build did. After setting it, rebuild — redeploying an "
    + "existing build changes nothing in the browser.";

export function computePaymentsConfigurationHealth(
    env: Record<string, string | undefined>,
): PaymentsConfigurationHealth {
    const secret = env.STRIPE_SECRET_KEY;
    /*
     * TWO NAMES, ONE VALUE. Reporting which one supplied it is the point: a product reading one
     * name while the environment carries the other is exactly how Add card refused for days with
     * the key correctly configured the whole time.
     */
    const resolvedPublishable = resolvePublishableFromEnv(env);
    const publishable = resolvedPublishable.key;

    const providerApi = {
        status: present(secret),
        mode: stripeModeOf(secret),
        variable: "STRIPE_SECRET_KEY" as const,
    };
    const browserTokenization = {
        status: present(publishable),
        mode: stripeModeOf(publishable),
        variable: resolvedPublishable.variable,
        caveat: BUILD_TIME_CAVEAT,
    };
    const webhookVerification = {
        status: present(env.STRIPE_WEBHOOK_SECRET),
        variable: "STRIPE_WEBHOOK_SECRET" as const,
    };
    const returnOrigin = {
        status: present(env.NEXT_PUBLIC_APP_URL),
        variable: "NEXT_PUBLIC_APP_URL" as const,
    };
    /* The wake endpoint accepts either credential, so either one admits the clock. */
    const scheduledWorkAdmission = {
        status: (present(env.CRON_SECRET) === "present" || present(env.INTERNAL_CRON_TOKEN) === "present"
            ? "present"
            : "absent") as ConfigPresence,
        variables: ["CRON_SECRET", "INTERNAL_CRON_TOKEN"],
    };

    /*
     * Coherence is only decidable when both keys are present AND both parse. Two unknowns are not a
     * contradiction, and reporting one would send somebody looking for a problem that is not there.
     */
    const modeCoherent =
        providerApi.mode === "unknown" || browserTokenization.mode === "unknown"
            ? true
            : providerApi.mode === browserTokenization.mode;

    const serverReady =
        providerApi.status === "present"
        && webhookVerification.status === "present"
        && scheduledWorkAdmission.status === "present"
        && modeCoherent;

    return {
        providerApi,
        webhookVerification,
        browserTokenization,
        returnOrigin,
        scheduledWorkAdmission,
        modeCoherent,
        serverReady,
    };
}
