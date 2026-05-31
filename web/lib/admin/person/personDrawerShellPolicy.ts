import { isPersonDrawerSeedRecord } from "@/lib/admin/drawer/personDrawerOpenSeed";

/** Child overview body: skeleton only when no typed seed/snapshot body is paintable. */
export function personDrawerChildBodyShowsSkeleton(args: {
    personChildLifecycleChrome: boolean;
    personDrawerChildBodyHydrated: boolean;
}): boolean {
    return args.personChildLifecycleChrome && !args.personDrawerChildBodyHydrated;
}

/** Parent overview body: skeleton until full hydrate. */
export function personDrawerParentBodyShowsSkeleton(args: {
    personParentGuardianChrome: boolean;
    personDrawerParentBodyHydrated: boolean;
}): boolean {
    return args.personParentGuardianChrome && !args.personDrawerParentBodyHydrated;
}

/** Operating summary blocks render from typed seed immediately; full hydrate refines in place. */
export function personDrawerOperatingSummaryVisible(args: {
    bodyHydrated: boolean;
    record: Record<string, unknown> | null | undefined;
}): boolean {
    if (!args.record || (args.record as { _create?: boolean })._create) return false;
    if (isPersonDrawerSeedRecord(args.record)) return true;
    return args.bodyHydrated;
}
