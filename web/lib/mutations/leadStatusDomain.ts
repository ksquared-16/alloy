/**
 * Lead Status domain — re-exports from domains/leadStatus.ts.
 * Kept for backward compatibility with existing imports and tests.
 * New code should import from @/lib/mutations/domainRegistry.
 */

export { LEAD_STATUS_DOMAIN } from "@/lib/mutations/domains/leadStatus";
export { resolveDomainForCommand } from "@/lib/mutations/domainRegistry";
