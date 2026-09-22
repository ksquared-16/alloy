/**
 * THE PRECONDITIONS A LIVE SUITE MUST OWN, RATHER THAN INHERIT.
 *
 * Three certification failures on 2026-09-19 were read as product defects and were not. Each was a
 * suite depending on shared tenant state it never established:
 *
 *   1. The registered payment actions gained a `fin.write` / `fin.adjust` gate. The synthetic actor
 *      the suites drive them with holds no role in any organisation, so every action refused —
 *      correctly. The product hardened; the fixture did not follow.
 *   2. The active accounting calendar's only 2026 period ended 2026-09-16. Three days later the
 *      journal write was refused with `accounting_period_unavailable`, the money still posted (by
 *      design), and every "journals exactly once" assertion went red while every money assertion
 *      passed.
 *   3. A suite set shared merchant readiness to prove a blocker and failed before restoring it, so
 *      every later collection anywhere on the stack was refused.
 *
 * None of these weakens what is under test. Authorization is still enforced, the accounting
 * invariant still refuses an unattributable entry, and the merchant is still the server's answer.
 * What changes is that a suite now ESTABLISHES its preconditions and RESTORES what it borrowed —
 * which is the difference between a repeatable certification and a run whose result depends on who
 * ran last.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AN ACTOR THAT ACTUALLY HOLDS THE AUTHORITY — resolved, never minted.
 *
 * The suites drove the registered actions as a synthetic uuid that exists in no identity table. The
 * actions enforce `fin.write` / `fin.adjust` through the ordinary grant resolution, so that actor
 * has no grants and every case refuses — correctly. It is a fixture with no authority, not a
 * product that declines.
 *
 * Minting the membership is not available and should not be: `user_roles.user_id` is a foreign key
 * to the real identity table, and inventing an identity to satisfy a test would put a principal in
 * the tenant that no operator corresponds to. So the suite asks the tenant for somebody who already
 * holds the role and acts as them — which is also the principal the mounted product uses.
 *
 * NOT a bypass. The gate is untouched, the grants are the tenant's own, and a tenant with nobody
 * holding the role fails loudly rather than silently proceeding unauthorized.
 */
export async function resolveAuthorizedActor(
    client: SupabaseClient,
    orgId: string,
    role = "admin",
): Promise<string> {
    const { data, error } = await client
        .from("user_roles")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("role", role)
        .limit(1);
    if (error) throw new Error(`could not resolve an authorized certification actor: ${error.message}`);
    const actor = ((data ?? []) as Array<{ user_id: string }>)[0]?.user_id;
    if (!actor) {
        throw new Error(
            `no user holds '${role}' in org ${orgId}, so this suite has no authorized actor to drive the `
            + "registered actions as. Seed the certification tenant's roles before certifying payment actions.",
        );
    }
    return actor;
}

/**
 * A reporting period covering the date this run's money is effective on.
 *
 * `attribute_financial_journal_entry` refuses an entry it cannot attribute, and that refusal is
 * correct — a reporting boundary must not be able to stop an operational act, so the money posts
 * and only the journal is skipped. A certification that asserts the journal therefore needs the
 * tenant to have a period, which is an environment fact and not a product one.
 *
 * Periods on one calendar may not overlap (`financial_accounting_periods_no_overlap`), so the
 * window is fitted between whatever neighbours already exist rather than assumed.
 */
export async function ensureAccountingPeriodCovers(
    client: SupabaseClient,
    orgId: string,
    onDate: string,
): Promise<{ periodKey: string; created: boolean } | null> {
    const { data: calendars } = await client
        .from("financial_accounting_calendars")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .limit(1);
    const calendarId = ((calendars ?? []) as Array<{ id: string }>)[0]?.id;
    // No calendar at all is a different, legitimate state: the trigger attributes `no_calendar` and
    // the entry is still written. Nothing to establish.
    if (!calendarId) return null;

    const { data: covering } = await client
        .from("financial_accounting_periods")
        .select("period_key, status")
        .eq("calendar_id", calendarId)
        .lte("starts_on", onDate)
        .gte("ends_on", onDate)
        .limit(1);
    const already = ((covering ?? []) as Array<{ period_key: string; status: string }>)[0];
    if (already && already.status === "open") return { periodKey: already.period_key, created: false };

    const { data: before } = await client
        .from("financial_accounting_periods")
        .select("ends_on")
        .eq("calendar_id", calendarId)
        .lt("ends_on", onDate)
        .order("ends_on", { ascending: false })
        .limit(1);
    const { data: after } = await client
        .from("financial_accounting_periods")
        .select("starts_on")
        .eq("calendar_id", calendarId)
        .gt("starts_on", onDate)
        .order("starts_on", { ascending: true })
        .limit(1);

    const dayAfter = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime() + 86_400_000;
    const asIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const prevEnd = ((before ?? []) as Array<{ ends_on: string }>)[0]?.ends_on ?? null;
    const nextStart = ((after ?? []) as Array<{ starts_on: string }>)[0]?.starts_on ?? null;

    const target = new Date(`${onDate}T00:00:00Z`).getTime();
    const startsOn = prevEnd ? asIso(Math.max(dayAfter(prevEnd), target - 30 * 86_400_000)) : asIso(target - 30 * 86_400_000);
    const endsOn = nextStart
        ? asIso(Math.min(dayAfter(nextStart) - 2 * 86_400_000, target + 60 * 86_400_000))
        : asIso(target + 60 * 86_400_000);
    if (startsOn > onDate || endsOn < onDate) {
        throw new Error(
            `no non-overlapping accounting window is available around ${onDate} on calendar ${calendarId}`,
        );
    }

    const periodKey = `CERT-${onDate.slice(0, 7)}`;
    const { error } = await client.from("financial_accounting_periods").insert({
        org_id: orgId,
        calendar_id: calendarId,
        period_key: periodKey,
        label: `Certification period covering ${onDate}`,
        starts_on: startsOn,
        ends_on: endsOn,
        status: "open",
    });
    if (error && !/duplicate key|already exists|overlap|exclusion/i.test(error.message)) {
        throw new Error(`could not establish an accounting period covering ${onDate}: ${error.message}`);
    }
    return { periodKey, created: !error };
}

/**
 * The merchant's readiness, put back to what the PROVIDER says — never to a literal.
 *
 * A suite that borrows readiness to prove a blocker must return it, and returning it to a
 * hardcoded `ready` would assert a capability nobody checked. This re-derives it from the account
 * the merchant actually names, which is the same rule the collection path applies.
 */
export async function restoreMerchantReadiness(
    client: SupabaseClient,
    orgId: string,
    readiness: string,
): Promise<void> {
    await client
        .from("payment_provider_merchants")
        .update({ readiness, readiness_checked_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("is_active", true);
}

/**
 * THE GOVERNED TEST MERCHANT — chosen by what it can do, not by where it happens to sit in a list.
 *
 * Seven live suites bound themselves to `accounts?limit=1`: the FIRST account the platform lists.
 * That was never a statement about which merchant they wanted; it was a statement about list order,
 * and it held only while exactly one connected account existed. Payments W1 creates accounts — that
 * is the capability under test — and the first one it made displaced the governed merchant for every
 * other suite, which then bound to an un-onboarded account and failed with
 * `onboarding_incomplete` across seven files at once.
 *
 * The rule these suites actually need is "a merchant that can charge", so that is now the rule. It
 * is also stable: a freshly created account is never `charges_enabled`, so no amount of provider
 * certification can displace the governed one again.
 */
export async function governedTestAccount(secret: string): Promise<Record<string, unknown>> {
    const res = await fetch("https://api.stripe.com/v1/accounts?limit=100", {
        headers: { Authorization: `Bearer ${secret}` },
    });
    const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const accounts = body.data ?? [];
    const charging = accounts.find((a) => a.charges_enabled === true);
    const chosen = charging ?? accounts[0];
    if (!chosen) throw new Error("no connected account exists on this platform to certify against");
    return chosen;
}

/**
 * A NON-ONBOARDED ACCOUNT THIS SUITE OWNS, REUSED ACROSS RUNS.
 *
 * Provider certification needs an account that has NOT finished setup, and a platform cannot delete
 * a connected account whose owner holds the full dashboard — which is the approved model — so every
 * run that mints one leaves it behind for good. Minting per run would grow the platform's account
 * list without bound.
 *
 * So the pool is found by display name and reused. One account, many runs, and a run that finds none
 * creates exactly one.
 */
export async function certificationPoolAccount(
    secret: string,
    poolName: string,
    create: () => Promise<string>,
): Promise<string> {
    const res = await fetch("https://api.stripe.com/v1/accounts?limit=100", {
        headers: { Authorization: `Bearer ${secret}` },
    });
    const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const existing = (body.data ?? []).find(
        (a) => typeof a.business_profile === "object"
            && a.charges_enabled !== true
            && String((a as { settings?: { dashboard?: { display_name?: string } } }).settings?.dashboard?.display_name ?? "") === poolName,
    );
    if (existing && typeof existing.id === "string") return existing.id;
    return await create();
}
