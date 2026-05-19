"use client";

import { useMemo } from "react";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { FieldDefForLinkedEdit } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import {
    primaryPersonCardValuesFromRecord,
    primaryPersonIdFromOpportunityRecord,
    resolvePrimaryPersonCardFieldGates,
} from "@/lib/admin/drawer/primaryPersonCardEdit";
import EditablePersonContactCard from "@/components/admin/opportunity/EditablePersonContactCard";

type Props = {
    record: Record<string, unknown>;
    canMutate: boolean;
    fieldDefinitions?: FieldDefForLinkedEdit[];
    cardPad: string;
    variant: "default" | "summary";
    openDrawer: (opts: { type: AdminDrawerEntityType; id: string }) => void;
    onPersonUpdated?: (person: Record<string, unknown>) => void;
};

/** Primary person on opportunity inquiry summary — thin wrapper over {@link EditablePersonContactCard}. */
export default function PrimaryPersonContactCard({
    record,
    canMutate,
    fieldDefinitions = [],
    cardPad,
    variant,
    openDrawer,
    onPersonUpdated,
}: Props) {
    const personId = primaryPersonIdFromOpportunityRecord(record) ?? "";
    const initialValues = useMemo(() => primaryPersonCardValuesFromRecord(record), [record]);
    const gates = useMemo(
        () => resolvePrimaryPersonCardFieldGates(record, fieldDefinitions, canMutate),
        [record, fieldDefinitions, canMutate]
    );

    return (
        <EditablePersonContactCard
            personId={personId}
            initialValues={initialValues}
            gates={gates}
            canMutate={canMutate}
            cardPad={cardPad}
            variant={variant}
            openDrawer={openDrawer}
            onPersonUpdated={onPersonUpdated}
            saveHint="Edits save to primary person · not this opportunity"
            dataCardKind="primary"
            className="mt-1"
        />
    );
}
