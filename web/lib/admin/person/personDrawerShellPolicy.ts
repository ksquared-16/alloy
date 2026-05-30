import { isPersonDrawerSeedRecord } from "@/lib/admin/drawer/personDrawerOpenSeed";

/** Child overview body: skeleton until full hydrate (seed rows still use skeleton for overview body). */
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

/** Operating summary blocks render only after authoritative hydrate — not on seed rows. */
export function personDrawerOperatingSummaryVisible(args: {
    bodyHydrated: boolean;
    record: Record<string, unknown> | null | undefined;
}): boolean {
    if (!args.bodyHydrated || !args.record) return false;
    if ((args.record as { _create?: boolean })._create) return false;
    return !isPersonDrawerSeedRecord(args.record);
}
