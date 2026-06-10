/** Marker package for realistic staging childcare CRM seed (this sprint). */
export const STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE = "staging_realistic_childcare_seed_v1";

/** One-family validation gate — isolated from bulk 135-family reseed. */
export const DEMO_ONE_FAMILY_GATE_PACKAGE = "demo_one_family_gate_v1";

export function demoSeedOneFamilyMetadata(args: {
    seedKey: string;
    runId: string;
    familyKey: string;
}): Record<string, unknown> {
    return {
        is_demo_data: true,
        seed_source: "demo_one_family_gate",
        demo_seed_package: DEMO_ONE_FAMILY_GATE_PACKAGE,
        seed_key: args.seedKey,
        demo_seed_run_id: args.runId,
        demo_seed_family_key: args.familyKey,
    };
}

export const STAGING_DEMO_SEED_SOURCE = "staging_demo_reset";

/** Known historical demo packages removed by `resetStagingDemoData` for a clean staging org. */
export const LEGACY_DEMO_SEED_PACKAGES = [
    STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE,
    "enrollment_pipeline_demo_v1",
    "enrollment_pipeline_demo_v2",
    "childcare_demo_v1",
    "access_validation_demo_v1",
    "access_validation_demo_v2",
] as const;

/**
 * Standard demo row metadata for wipe-by-metadata and idempotent upserts.
 * Every table that supports `metadata` should store these keys on seed-created rows.
 */
export function demoSeedMetadata(seedKey: string): Record<string, unknown> {
    return {
        is_demo_data: true,
        seed_source: STAGING_DEMO_SEED_SOURCE,
        demo_seed_package: STAGING_REALISTIC_CHILDCARE_SEED_PACKAGE,
        seed_key: seedKey,
    };
}
