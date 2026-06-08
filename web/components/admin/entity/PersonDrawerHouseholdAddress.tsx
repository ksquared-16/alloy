"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { registerPersonDrawerEditSection } from "@/lib/admin/person/personDrawerEditingCoordinator";
import { personDrawerParentChromeActive } from "@/lib/admin/person/personDrawerParentChrome";
import type { PersonDrawerParentChromeHint } from "@/lib/admin/person/personDrawerParentChrome";
import {
    createHouseholdCustomerAddress,
    patchHouseholdCustomerLocation,
} from "@/lib/admin/person/patchHouseholdCustomerAddress";
import {
    personDrawerHouseholdAddressHasContent,
    resolvePersonDrawerHouseholdAddressModel,
} from "@/lib/admin/person/resolvePersonDrawerHouseholdAddress";
import type { PersonHouseholdCustomerAddressRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

const ADDRESS_FIELD_KEYS = ["address_line1", "address_line2", "city", "state", "postal_code"] as const;

type AddressFieldKey = (typeof ADDRESS_FIELD_KEYS)[number];

const ADDRESS_FIELD_LABELS: Record<AddressFieldKey, string> = {
    address_line1: "Address Line 1",
    address_line2: "Address Line 2",
    city: "City",
    state: "State",
    postal_code: "Zip Code",
};

function compactFieldClassName(): string {
    return `${oppInqFieldInput} !py-1 !text-[13px]`;
}

function valuesFromModel(model: ReturnType<typeof resolvePersonDrawerHouseholdAddressModel>): Record<AddressFieldKey, string> {
    return {
        address_line1: model.address_line1 ?? "",
        address_line2: model.address_line2 ?? "",
        city: model.city ?? "",
        state: model.state ?? "",
        postal_code: model.postal_code ?? "",
    };
}

function addressRowFromValues(
    customerId: string,
    locationId: string | null,
    values: Record<AddressFieldKey, string>
): PersonHouseholdCustomerAddressRow {
    return {
        customer_id: customerId,
        location_id: locationId ?? "",
        address_line1: values.address_line1.trim() || null,
        address_line2: values.address_line2.trim() || null,
        city: values.city.trim() || null,
        state: values.state.trim() || null,
        postal_code: values.postal_code.trim() || null,
        label: null,
    };
}

function addressDraftIsDirty(
    baseline: Record<AddressFieldKey, string>,
    draft: Record<AddressFieldKey, string>
): boolean {
    return ADDRESS_FIELD_KEYS.some((key) => (draft[key] ?? "").trim() !== (baseline[key] ?? "").trim());
}

/** Household mailing address on customer `locations` (type address). */
export default function PersonDrawerHouseholdAddress({
    record,
    chromeHint,
    canMutate = false,
    onRecordUpdated,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerParentChromeHint | null;
    canMutate?: boolean;
    onRecordUpdated?: (next: Record<string, unknown>) => void;
}) {
    if (!personDrawerParentChromeActive(record, chromeHint)) {
        return null;
    }

    const primaryCustomerId =
        (record._household_context as { customer_id?: string }[] | undefined)?.[0]?.customer_id ?? null;
    const addressModel = resolvePersonDrawerHouseholdAddressModel(record, {
        primary_customer_id: primaryCustomerId,
    });

    const customerId = addressModel.customer_id ?? primaryCustomerId;
    const canEditHousehold =
        canMutate &&
        Boolean(customerId) &&
        (addressModel.source === "customer_location" || addressModel.source === "none");

    const baseline = useMemo(() => valuesFromModel(addressModel), [addressModel]);
    const [values, setValues] = useState<Record<AddressFieldKey, string>>(baseline);

    useEffect(() => {
        setValues(baseline);
    }, [baseline]);

    const dirty = useMemo(() => addressDraftIsDirty(baseline, values), [baseline, values]);

    const persistValues = useCallback(async () => {
        if (!customerId || !canEditHousehold || !dirty) return;
        const patch = {
            address1: values.address_line1.trim() || null,
            address2: values.address_line2.trim() || null,
            city: values.city.trim() || null,
            state: values.state.trim() || null,
            postal_code: values.postal_code.trim() || null,
        };

        let locationId = addressModel.location_id;
        if (addressModel.source === "none" || !locationId) {
            const created = await createHouseholdCustomerAddress(customerId, patch);
            locationId = created.id;
        } else {
            await patchHouseholdCustomerLocation(locationId, patch);
        }

        const row = addressRowFromValues(customerId, locationId, values);
        const existing =
            (record._household_customer_addresses as PersonHouseholdCustomerAddressRow[] | undefined) ?? [];
        const filtered = existing.filter((r) => r.customer_id !== customerId);
        onRecordUpdated?.({
            ...record,
            _household_customer_addresses: [...filtered, row],
        });
    }, [
        addressModel.location_id,
        addressModel.source,
        canEditHousehold,
        customerId,
        dirty,
        onRecordUpdated,
        record,
        values,
    ]);

    useEffect(() => {
        registerPersonDrawerEditSection("household_address", {
            isDirty: () => addressDraftIsDirty(baseline, values),
            save: persistValues,
            revert: () => setValues(baseline),
        });
        return () => registerPersonDrawerEditSection("household_address", null);
    }, [baseline, persistValues, values]);

    const showCanonicalEditor =
        canEditHousehold || (addressModel.source === "customer_location" && personDrawerHouseholdAddressHasContent(addressModel));

    return (
        <section
            className={`${oppInqLeadSummaryShellClassName} mb-2`}
            data-person-drawer-household-address="true"
            data-person-drawer-address-source={addressModel.source}
            aria-label="Address"
        >
            <p className={`${oppInqEyebrow} px-0.5`}>Address</p>
            <div className={`${oppInqInnerCardCompact} mt-2 space-y-3 px-0.5 pb-1`}>
                {showCanonicalEditor ? (
                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                        {ADDRESS_FIELD_KEYS.map((key) => (
                            <label
                                key={key}
                                className={`flex min-w-0 flex-col gap-0.5 ${key === "address_line1" || key === "address_line2" ? "sm:col-span-2" : ""}`}
                            >
                                <span className={oppInqEyebrow}>{ADDRESS_FIELD_LABELS[key]}</span>
                                <input
                                    type="text"
                                    value={values[key] ?? ""}
                                    disabled={!canEditHousehold}
                                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                                    className={compactFieldClassName()}
                                    aria-label={ADDRESS_FIELD_LABELS[key]}
                                />
                            </label>
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    );
}
