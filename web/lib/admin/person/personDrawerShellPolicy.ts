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

/** Operating summary blocks render only after full hydrate — no partial section shells. */
export function personDrawerOperatingSummaryVisible(args: {
    bodyHydrated: boolean;
    record: Record<string, unknown> | null | undefined;
}): boolean {
    if (!args.record || (args.record as { _create?: boolean })._create) return false;
    return args.bodyHydrated;
}
