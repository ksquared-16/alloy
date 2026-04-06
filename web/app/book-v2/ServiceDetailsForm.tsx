"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import ConfigurableFieldSections, {
    PublicFieldControl,
    type PublicFieldDef,
    type PublicSectionDef,
} from "@/components/public/ConfigurableFieldSections";
import { BOOKING_BATHROOM_OPTIONS, BOOKING_BEDROOM_OPTIONS } from "@/lib/book-v2/bookingBedBathOptions";

export interface ServiceDetails {
    address: string;
    city: string;
    access_method: "home" | "code" | "key" | "building";
    access_note: string;
    has_pets: boolean;
    /** Values for org-defined public booking fields (field_key → value). */
    configurable_values: Record<string, string | boolean | string[]>;
    /** When no applicable public defs exist, legacy property selects (optional). */
    home_type?: string;
    beds?: string;
    baths?: string;
    /** @deprecated Local storage / legacy; mapped to beds */
    bedrooms?: string;
    /** @deprecated Mapped to baths */
    bathrooms?: string;
}

interface ServiceDetailsFormProps {
    initialData?: Partial<ServiceDetails>;
    onDataChange: (data: ServiceDetails, isValid: boolean) => void;
    /** Vertical slug for catalog_key resolution (e.g. pricing_sqft_tiers). */
    verticalSlug?: string;
}

const STORAGE_KEY = "alloy_book_v2_service_details";

/** Field keys not shown or sent from the public Service Details step (admin/registry unchanged). */
export const SERVICE_DETAILS_PUBLIC_EXCLUDED_FIELD_KEYS = new Set(["alarm_notes"]);

/**
 * Rendered with fixed layout: native bed/bath row, access, parking.
 * (Registry may still use select + options; DB misconfiguration as `number` would show as text/number — we avoid that.)
 */
const SERVICE_DETAILS_CONFIG_LAYOUT_EXCLUDED_KEYS = new Set([
    "access_method",
    "parking_notes",
    "beds",
    "baths",
    "bedrooms",
    "bathrooms",
    "home_type",
]);

/** Service step: property + access only (exclude quote/sizing from public defs). */
const SERVICE_STEP_SECTION_KEYS = new Set(["property", "access_notes"]);

const emptyConfigurable = (): Record<string, string | boolean | string[]> => ({});

export function withoutExcludedConfigurableValues(
    values: Record<string, string | boolean | string[]>
): Record<string, string | boolean | string[]> {
    const o = { ...values };
    for (const k of SERVICE_DETAILS_PUBLIC_EXCLUDED_FIELD_KEYS) {
        delete (o as Record<string, unknown>)[k];
    }
    return o;
}

const inputPad = "w-full px-3 py-2 border border-alloy-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alloy-juniper/70";

export default function ServiceDetailsForm({
    initialData,
    onDataChange,
    verticalSlug = "cleaning",
}: ServiceDetailsFormProps) {
    const [formData, setFormData] = useState<ServiceDetails>({
        address: initialData?.address || "",
        city: initialData?.city || "",
        access_method: initialData?.access_method || "home",
        access_note: initialData?.access_note || "",
        has_pets: initialData?.has_pets ?? false,
        configurable_values: withoutExcludedConfigurableValues(
            initialData?.configurable_values ?? emptyConfigurable()
        ),
        home_type: initialData?.home_type,
        beds: initialData?.beds ?? initialData?.bedrooms,
        baths: initialData?.baths ?? initialData?.bathrooms,
        bedrooms: initialData?.bedrooms,
        bathrooms: initialData?.bathrooms,
    });

    const [locationFields, setLocationFields] = useState<PublicFieldDef[]>([]);
    const [locationSections, setLocationSections] = useState<PublicSectionDef[]>([]);
    const [defsLoading, setDefsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const q = new URLSearchParams({ entity_type: "location" });
        if (verticalSlug?.trim()) q.set("vertical_slug", verticalSlug.trim());
        fetch(`/api/public/field-definitions?${q.toString()}`)
            .then((r) => r.json())
            .then((defsData: { ok?: boolean; fields?: PublicFieldDef[]; sections?: PublicSectionDef[] }) => {
                if (cancelled) return;
                if (defsData?.ok) {
                    setLocationFields(defsData.fields ?? []);
                    setLocationSections(defsData.sections ?? []);
                } else {
                    setLocationFields([]);
                    setLocationSections([]);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLocationFields([]);
                    setLocationSections([]);
                }
            })
            .finally(() => {
                if (!cancelled) setDefsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [verticalSlug]);

    const fieldsForServiceStep = useMemo(
        () => locationFields.filter((f) => SERVICE_STEP_SECTION_KEYS.has(f.section_key || "")),
        [locationFields]
    );

    const visibleServiceFields = useMemo(() => {
        return fieldsForServiceStep.filter((f) => {
            if (SERVICE_DETAILS_PUBLIC_EXCLUDED_FIELD_KEYS.has(f.field_key)) return false;
            if (f.section_key === "access_notes" && f.field_key === "gate_code") {
                return formData.access_method === "building";
            }
            return true;
        });
    }, [fieldsForServiceStep, formData.access_method]);

    const propertyConfigurableFields = useMemo(
        () =>
            visibleServiceFields.filter(
                (f) => f.section_key === "property" && !SERVICE_DETAILS_CONFIG_LAYOUT_EXCLUDED_KEYS.has(f.field_key)
            ),
        [visibleServiceFields]
    );

    const propertyConfigurableSections = useMemo(
        () => locationSections.filter((s) => s.section_key === "property"),
        [locationSections]
    );

    const accessNotesAfterNativeFields = useMemo(
        () =>
            visibleServiceFields.filter((f) => {
                if (f.section_key !== "access_notes") return false;
                if (SERVICE_DETAILS_CONFIG_LAYOUT_EXCLUDED_KEYS.has(f.field_key)) return false;
                if (f.field_key === "gate_code" && formData.access_method !== "building") return false;
                return true;
            }),
        [visibleServiceFields, formData.access_method]
    );

    const parkingFieldDef = useMemo(
        () => visibleServiceFields.find((f) => f.field_key === "parking_notes"),
        [visibleServiceFields]
    );

    const prefetchedPropertyOnly = useMemo(
        () =>
            propertyConfigurableFields.length > 0
                ? { fields: propertyConfigurableFields, sections: propertyConfigurableSections }
                : null,
        [propertyConfigurableFields, propertyConfigurableSections]
    );

    const defsReady = !defsLoading;

    const bedFieldDef = useMemo(
        () => fieldsForServiceStep.find((f) => f.field_key === "beds"),
        [fieldsForServiceStep]
    );
    const bathFieldDef = useMemo(
        () => fieldsForServiceStep.find((f) => f.field_key === "baths"),
        [fieldsForServiceStep]
    );
    const homeTypeFieldDef = useMemo(
        () => fieldsForServiceStep.find((f) => f.field_key === "home_type"),
        [fieldsForServiceStep]
    );
    const bedOptions =
        bedFieldDef?.options?.length && bedFieldDef.options.length > 0
            ? bedFieldDef.options
            : BOOKING_BEDROOM_OPTIONS;
    const bathOptions =
        bathFieldDef?.options?.length && bathFieldDef.options.length > 0
            ? bathFieldDef.options
            : BOOKING_BATHROOM_OPTIONS;
    /** Documented fallback if `home_type` is missing from public defs (org misconfiguration). */
    const FALLBACK_HOME_TYPES = [
        { value: "house", label: "House" },
        { value: "condo", label: "Condo" },
        { value: "apartment", label: "Apartment" },
        { value: "townhome", label: "Townhome" },
    ];
    const homeTypeOptions =
        homeTypeFieldDef?.options?.length && homeTypeFieldDef.options.length > 0
            ? homeTypeFieldDef.options
            : FALLBACK_HOME_TYPES;

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Partial<ServiceDetails> & { additional_notes?: string };
                const { additional_notes: _drop, ...rest } = parsed;
                setFormData((prev) => {
                    const mergedCfg =
                        rest.configurable_values && typeof rest.configurable_values === "object"
                            ? { ...prev.configurable_values, ...rest.configurable_values }
                            : prev.configurable_values;
                    const bed =
                        (typeof rest.beds === "string" && rest.beds.trim() ? rest.beds : undefined) ??
                        (typeof rest.bedrooms === "string" && rest.bedrooms.trim() ? rest.bedrooms : undefined);
                    const bath =
                        (typeof rest.baths === "string" && rest.baths.trim() ? rest.baths : undefined) ??
                        (typeof rest.bathrooms === "string" && rest.bathrooms.trim() ? rest.bathrooms : undefined);
                    const ht =
                        typeof rest.home_type === "string" && rest.home_type.trim() ? rest.home_type : undefined;
                    const cfgNext = { ...mergedCfg };
                    if (bed && (cfgNext.beds === undefined || cfgNext.beds === "")) cfgNext.beds = bed;
                    if (bath && (cfgNext.baths === undefined || cfgNext.baths === "")) cfgNext.baths = bath;
                    if (bed && (cfgNext.bedrooms === undefined || cfgNext.bedrooms === "")) cfgNext.bedrooms = bed;
                    if (bath && (cfgNext.bathrooms === undefined || cfgNext.bathrooms === "")) cfgNext.bathrooms = bath;
                    if (ht && (cfgNext.home_type === undefined || cfgNext.home_type === "")) cfgNext.home_type = ht;
                    return {
                        ...prev,
                        ...rest,
                        beds: bed ?? prev.beds,
                        baths: bath ?? prev.baths,
                        has_pets: rest.has_pets === true,
                        configurable_values: withoutExcludedConfigurableValues(cfgNext),
                    };
                });
            }
        } catch (e) {
            console.warn("Failed to load service details from storage:", e);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    ...formData,
                    configurable_values: withoutExcludedConfigurableValues(formData.configurable_values),
                })
            );
        } catch (e) {
            console.warn("Failed to save service details to storage:", e);
        }
    }, [formData]);

    const validateForm = useCallback(
        (data: ServiceDetails): boolean => {
            if (!data.address.trim() || !data.city.trim()) return false;
            if (data.access_method !== "home" && !data.access_note.trim()) return false;

            const bedRaw = data.configurable_values.beds ?? data.beds ?? data.configurable_values.bedrooms ?? data.bedrooms;
            const bathRaw =
                data.configurable_values.baths ?? data.baths ?? data.configurable_values.bathrooms ?? data.bathrooms;
            if (!String(bedRaw ?? "").trim() || !String(bathRaw ?? "").trim()) return false;

            const homeRaw = data.configurable_values.home_type ?? data.home_type;
            if (!String(homeRaw ?? "").trim()) return false;

            for (const f of visibleServiceFields) {
                if (!f.is_required) continue;
                const v = data.configurable_values[f.field_key];
                if (v === undefined || v === null) return false;
                if (typeof v === "string" && !v.trim()) return false;
                if (Array.isArray(v) && v.length === 0) return false;
            }

            return true;
        },
        [visibleServiceFields]
    );

    useEffect(() => {
        const isValid = validateForm(formData);
        onDataChange(formData, isValid);
    }, [formData, onDataChange, validateForm]);

    const handleChange = (field: keyof ServiceDetails, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleAccessMethodChange = (method: ServiceDetails["access_method"]) => {
        setFormData((prev) => ({
            ...prev,
            access_method: method,
            access_note: method === "home" ? "" : prev.access_note,
        }));
    };

    const onConfigurableChange = (fieldKey: string, value: string | boolean | string[]) => {
        setFormData((prev) => ({
            ...prev,
            configurable_values: { ...prev.configurable_values, [fieldKey]: value },
        }));
    };

    const setBedsSelection = (v: string) => {
        setFormData((prev) => ({
            ...prev,
            beds: v,
            configurable_values: { ...prev.configurable_values, beds: v },
        }));
    };

    const setBathsSelection = (v: string) => {
        setFormData((prev) => ({
            ...prev,
            baths: v,
            configurable_values: { ...prev.configurable_values, baths: v },
        }));
    };

    const setHomeTypeSelection = (v: string) => {
        setFormData((prev) => ({
            ...prev,
            home_type: v,
            configurable_values: { ...prev.configurable_values, home_type: v },
        }));
    };

    const bedSelectValue =
        (typeof formData.configurable_values.beds === "string" && formData.configurable_values.beds) ||
        formData.beds ||
        (typeof formData.configurable_values.bedrooms === "string" && formData.configurable_values.bedrooms) ||
        formData.bedrooms ||
        "";
    const bathSelectValue =
        (typeof formData.configurable_values.baths === "string" && formData.configurable_values.baths) ||
        formData.baths ||
        (typeof formData.configurable_values.bathrooms === "string" && formData.configurable_values.bathrooms) ||
        formData.bathrooms ||
        "";

    const homeTypeSelectValue =
        (typeof formData.configurable_values.home_type === "string" && formData.configurable_values.home_type) ||
        formData.home_type ||
        "";

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-base font-semibold text-alloy-midnight">Service address & property</h3>
                <p className="text-xs text-alloy-midnight/55 mt-0.5">
                    We&apos;ll use this to prepare for your visit
                </p>
            </div>

            <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                            Address <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.address}
                            onChange={(e) => handleChange("address", e.target.value)}
                            placeholder="123 Main Street"
                            className={inputPad}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                            City <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.city}
                            onChange={(e) => handleChange("city", e.target.value)}
                            placeholder="Los Angeles"
                            className={inputPad}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                        Home type <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={homeTypeSelectValue}
                        onChange={(e) => setHomeTypeSelection(e.target.value)}
                        className={`${inputPad} bg-white`}
                    >
                        <option value="">Select</option>
                        {homeTypeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {defsLoading && (
                    <p className="text-xs text-alloy-midnight/50">Loading property fields…</p>
                )}
                {defsReady && prefetchedPropertyOnly && (
                    <ConfigurableFieldSections
                        entityType="location"
                        verticalSlug={verticalSlug}
                        prefetched={prefetchedPropertyOnly}
                        values={formData.configurable_values}
                        onChange={onConfigurableChange}
                        dense
                        sameRowAdjacentKeys={null}
                    />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                            Beds <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={bedSelectValue}
                            onChange={(e) => setBedsSelection(e.target.value)}
                            className={`${inputPad} bg-white`}
                        >
                            <option value="">Select</option>
                            {bedOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                            Baths <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={bathSelectValue}
                            onChange={(e) => setBathsSelection(e.target.value)}
                            className={`${inputPad} bg-white`}
                        >
                            <option value="">Select</option>
                            {bathOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="pt-1">
                    <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                        How will your cleaner get in? <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={formData.access_method}
                        onChange={(e) =>
                            handleAccessMethodChange(e.target.value as ServiceDetails["access_method"])
                        }
                        className={`${inputPad} bg-white`}
                    >
                        <option value="home">I will be home</option>
                        <option value="code">Door/Garage Code</option>
                        <option value="key">Hidden Key</option>
                        <option value="building">Building / Front Desk</option>
                    </select>
                </div>

                {formData.access_method !== "home" && (
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                            {formData.access_method === "code"
                                ? "Door or garage code"
                                : formData.access_method === "key"
                                  ? "Where to find the key"
                                  : "Building access instructions"}{" "}
                            <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={formData.access_note}
                            onChange={(e) => handleChange("access_note", e.target.value)}
                            placeholder={
                                formData.access_method === "code"
                                    ? "Enter the code"
                                    : formData.access_method === "key"
                                      ? "Describe where the key is hidden"
                                      : "e.g. gate, lobby, concierge"
                            }
                            rows={2}
                            className={`${inputPad} resize-none`}
                        />
                    </div>
                )}

                {defsReady &&
                    accessNotesAfterNativeFields.map((f) => (
                        <div key={f.field_key} className="space-y-0.5">
                            <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                                {f.label}
                                {f.is_required ? <span className="text-red-500"> *</span> : null}
                            </label>
                            {f.description ? (
                                <p className="text-xs text-alloy-midnight/60 mb-0.5">{f.description}</p>
                            ) : null}
                            <PublicFieldControl
                                f={f}
                                value={formData.configurable_values[f.field_key]}
                                onChange={onConfigurableChange}
                                dense
                            />
                            {f.help_text ? (
                                <p className="text-xs text-alloy-midnight/50 mt-0.5">{f.help_text}</p>
                            ) : null}
                        </div>
                    ))}

                {parkingFieldDef && (
                    <div className="space-y-0.5">
                        <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                            {parkingFieldDef.label}
                            {parkingFieldDef.is_required ? <span className="text-red-500"> *</span> : null}
                        </label>
                        {parkingFieldDef.description ? (
                            <p className="text-xs text-alloy-midnight/60 mb-0.5">{parkingFieldDef.description}</p>
                        ) : null}
                        <PublicFieldControl
                            f={parkingFieldDef}
                            value={formData.configurable_values[parkingFieldDef.field_key]}
                            onChange={onConfigurableChange}
                            dense
                        />
                        {parkingFieldDef.help_text ? (
                            <p className="text-xs text-alloy-midnight/50 mt-0.5">{parkingFieldDef.help_text}</p>
                        ) : null}
                    </div>
                )}

                <div className="pt-3 mt-2 border-t border-alloy-stone/20">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            id="book-v2-has-pets"
                            type="checkbox"
                            checked={formData.has_pets}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, has_pets: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-alloy-stone/40 text-alloy-juniper"
                        />
                        <span className="text-sm text-alloy-midnight">Pets at this address</span>
                    </label>
                </div>
            </div>
        </div>
    );
}
