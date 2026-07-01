"use client";

import PersonDrawerHouseholdSection from "@/components/admin/entity/PersonDrawerHouseholdSection";
import { personDrawerParentChromeActive } from "@/lib/admin/person/personDrawerParentChrome";
import type { PersonDrawerParentChromeHint } from "@/lib/admin/person/personDrawerParentChrome";
import { stampPersonDrawerParentHeaderContext } from "@/lib/admin/person/resolvePersonDrawerParentHouseholdModel";

type OpenDrawer = (type: string, id: string) => void;

/** Parent drawer household — shared layout with child drawer. */
export default function PersonDrawerParentHouseholdSection({
    record,
    chromeHint,
    onOpenDrawer,
    onOpenLinkedPerson,
    canMutate = false,
    onRecordUpdated,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerParentChromeHint | null;
    onOpenDrawer: OpenDrawer;
    onOpenLinkedPerson?: (personId: string) => void;
    canMutate?: boolean;
    onRecordUpdated?: (next: Record<string, unknown>) => void;
}) {
    if (!personDrawerParentChromeActive(record, chromeHint)) {
        return null;
    }

    return (
        <PersonDrawerHouseholdSection
            record={stampPersonDrawerParentHeaderContext(record)}
            onOpenDrawer={onOpenDrawer}
            onOpenLinkedPerson={onOpenLinkedPerson}
            viewingPersonId={record.id as string | undefined}
            dataDrawerVariant="parent"
            canMutate={canMutate}
            onRecordUpdated={onRecordUpdated}
        />
    );
}
