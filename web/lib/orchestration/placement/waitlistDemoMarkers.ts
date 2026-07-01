/**
 * Demo batch markers for waitlist demo readiness (`waitlist_demo_v1`).
 */

export const WAITLIST_DEMO_BATCH_KEY = "waitlist_demo_v1";

export const WAITLIST_DEMO_SEED_PACKAGE = WAITLIST_DEMO_BATCH_KEY;

export function waitlistDemoMetadata(seedKey: string, extra?: Record<string, unknown>): Record<string, unknown> {
    return {
        demo_batch_key: WAITLIST_DEMO_BATCH_KEY,
        demo_seed_package: WAITLIST_DEMO_SEED_PACKAGE,
        seed_key: seedKey,
        is_demo_data: true,
        ...extra,
    };
}

export function isWaitlistDemoMetadata(raw: unknown): boolean {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return false;
    const m = raw as Record<string, unknown>;
    return m.demo_batch_key === WAITLIST_DEMO_BATCH_KEY || m.demo_seed_package === WAITLIST_DEMO_SEED_PACKAGE;
}
