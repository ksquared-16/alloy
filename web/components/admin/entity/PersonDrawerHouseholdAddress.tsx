"use client";

import { useCallback, useEffect, useState } from "react";
import {
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
    oppInqMutedEmpty,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
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

export const PERSON_DRAWER_HOUSEHOLD_ADDRESS_EMPTY_COPY =
    "No household mailing address on file for this account";

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

    const [values, setValues] = useState<Record<AddressFieldKey, string>>(() => valuesFromModel(addressModel));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setValues(valuesFromModel(addressModel));
    }, [
        addressModel.address_line1,
        addressModel.address_line2,
        addressModel.city,
        addressModel.state,
        addressModel.postal_code,
        addressModel.source,
        addressModel.location_id,
    ]);

    const persistValues = useCallback(
        async (nextValues: Record<AddressFieldKey, string>) => {
            if (!customerId || !canEditHousehold) return;
            setSaving(true);
            try {
                const patch = {
                    address1: nextValues.address_line1.trim() || null,
                    address2: nextValues.address_line2.trim() || null,
                    city: nextValues.city.trim() || null,
                    state: nextValues.state.trim() || null,
                    postal_code: nextValues.postal_code.trim() || null,
                };

                let locationId = addressModel.location_id;
                if (addressModel.source === "none" || !locationId) {
                    const created = await createHouseholdCustomerAddress(customerId, patch);
                    locationId = created.id;
                } else {
                    await patchHouseholdCustomerLocation(locationId, patch);
                }

                const row = addressRowFromValues(customerId, locationId, nextValues);
                const existing =
                    (record._household_customer_addresses as PersonHouseholdCustomerAddressRow[] | undefined) ??
                    [];
                const filtered = existing.filter((r) => r.customer_id !== customerId);
                onRecordUpdated?.({
                    ...record,
                    _household_customer_addresses: [...filtered, row],
                });
            } finally {
                setSaving(false);
            }
        },
        [addressModel.location_id, addressModel.source, canEditHousehold, customerId, onRecordUpdated, record]
    );

    const saveField = useCallback(
        (key: AddressFieldKey) => {
            const prev = valuesFromModel(addressModel)[key];
            const next = (values[key] ?? "").trim();
            if (next === prev.trim()) return;
            void persistValues({ ...values, [key]: values[key] ?? "" });
        },
        [addressModel, persistValues, values]
    );

    const showCanonicalEditor =
        canEditHousehold || (addressModel.source === "customer_location" && personDrawerHouseholdAddressHasContent(addressModel));
    const showEmptyEditable = addressModel.source === "none" && canEditHousehold;

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
                                    disabled={!canEditHousehold || saving}
                                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                                    onBlur={() => saveField(key)}
                                    className={compactFieldClassName()}
                                    aria-label={ADDRESS_FIELD_LABELS[key]}
                                />
                            </label>
                        ))}
                    </div>
                ) : null}

                {addressModel.source === "none" && !canMutate ? (
                    <div data-person-drawer-address-empty="true">
                        <p className={[oppInqMutedEmpty, "text-[13px]"].join(" ")}>
                            {PERSON_DRAWER_HOUSEHOLD_ADDRESS_EMPTY_COPY}
                        </p>
                    </div>
                ) : null}

                {showEmptyEditable && !ADDRESS_FIELD_KEYS.some((k) => (values[k] ?? "").trim()) ? (
                    <p className={[oppInqMutedEmpty, "text-[13px]"].join(" ")} data-person-drawer-address-empty="true">
                        {PERSON_DRAWER_HOUSEHOLD_ADDRESS_EMPTY_COPY}
                    </p>
                ) : null}

                {addressModel.source === "person_interim" ? (
                    <p
                        className="text-[11px] leading-snug text-alloy-midnight/50"
                        data-person-drawer-address-interim-note="true"
                    >
                        {addressModel.interim_note}
                    </p>
                ) : null}
            </div>
        </section>
    );
}
