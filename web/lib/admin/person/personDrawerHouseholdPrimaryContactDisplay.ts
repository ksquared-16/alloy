import type { PersonDrawerHouseholdMember } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";

/** UI-only: single parent/guardian households read as primary without mutating customer_persons. */
export function applyHouseholdGuardianPrimaryDisplay<T extends Pick<PersonDrawerHouseholdMember, "is_primary">>(
    guardians: T[]
): T[] {
    if (guardians.length !== 1 || guardians[0]?.is_primary) {
        return guardians;
    }
    return [{ ...guardians[0], is_primary: true }];
}

export function householdParentGuardianCount(
    guardians: readonly PersonDrawerHouseholdMember[],
    includesViewingPerson: boolean
): number {
    return guardians.length + (includesViewingPerson ? 1 : 0);
}

export function householdShowsPrimaryContactControl(args: {
    guardianCount: number;
    isPrimary: boolean;
    canMutate: boolean;
}): boolean {
    return args.canMutate && args.guardianCount > 1 && !args.isPrimary;
}
