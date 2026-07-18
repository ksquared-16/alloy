/**
 * Prepared Operational Destination store — Phase B rollout gate (§16, row B rollback boundary).
 *
 * When OFF (default), the shipped `workUnitProvisioningPrefetch` (144 ms warm cache) remains the
 * live commit path, untouched. When ON, the canonical {@link PreparedDestinationStore} backs
 * preparation and commit reads. Keeping the prefetch as-is behind this flag is the sanctioned
 * rollback boundary until the store is browser + performance certified (warm-commit ~150 ms
 * preserved); flipping the flag off restores the shipped path with zero migration.
 *
 * Default: OFF. Set `NEXT_PUBLIC_PREPARED_DESTINATION_STORE=1`.
 */

export const PREPARED_DESTINATION_STORE_ENABLED =
    process.env.NEXT_PUBLIC_PREPARED_DESTINATION_STORE === "1";

/** Is the canonical Prepared Destination store the active commit path? (Phase B fallback boundary.) */
export function preparedDestinationStoreEnabled(): boolean {
    return PREPARED_DESTINATION_STORE_ENABLED;
}
