"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import ConfigurableFieldSections, {
    type PublicFieldDef,
    type PublicSectionDef,
} from "@/components/public/ConfigurableFieldSections";

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
    bedrooms?: string;
    bathrooms?: string;
}

interface ServiceDetailsFormProps {
    initialData?: Partial<ServiceDetails>;
    onDataChange: (data: ServiceDetails, isValid: boolean) => void;
    /** Vertical slug for catalog_key resolution (e.g. pricing_sqft_tiers). */
    verticalSlug?: string;
}

const STORAGE_KEY = "alloy_book_v2_service_details";

/** Service step: property + access only (exclude quote/sizing from public defs). */
const SERVICE_STEP_SECTION_KEYS = new Set(["property", "access_notes"]);

const emptyConfigurable = (): Record<string, string | boolean | string[]> => ({});

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
        configurable_values: initialData?.configurable_values ?? emptyConfigurable(),
        home_type: initialData?.home_type,
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
            .then((data: { ok?: boolean; fields?: PublicFieldDef[]; sections?: PublicSectionDef[] }) => {
                if (cancelled || !data?.ok) return;
                setLocationFields(data.fields ?? []);
                setLocationSections(data.sections ?? []);
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
            if (f.section_key === "access_notes" && f.field_key === "gate_code") {
                return formData.access_method === "building";
            }
            return true;
        });
    }, [fieldsForServiceStep, formData.access_method]);

    const serviceSections = useMemo(
        () => locationSections.filter((s) => SERVICE_STEP_SECTION_KEYS.has(s.section_key)),
        [locationSections]
    );

    const prefetchedService = useMemo(
        () =>
            visibleServiceFields.length > 0
                ? { fields: visibleServiceFields, sections: serviceSections }
                : null,
        [visibleServiceFields, serviceSections]
    );

    const defsReady = !defsLoading;
    const useLegacyPropertyFields =
        defsReady && (locationFields.length === 0 || visibleServiceFields.length === 0);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Partial<ServiceDetails> & { additional_notes?: string };
                const { additional_notes: _drop, ...rest } = parsed;
                setFormData((prev) => ({
                    ...prev,
                    ...rest,
                    has_pets: rest.has_pets === true,
                    configurable_values:
                        rest.configurable_values && typeof rest.configurable_values === "object"
                            ? { ...prev.configurable_values, ...rest.configurable_values }
                            : prev.configurable_values,
                }));
            }
        } catch (e) {
            console.warn("Failed to load service details from storage:", e);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
        } catch (e) {
            console.warn("Failed to save service details to storage:", e);
        }
    }, [formData]);

    const validateForm = useCallback(
        (data: ServiceDetails): boolean => {
            if (!data.address.trim() || !data.city.trim()) return false;
            if (data.access_method !== "home" && !data.access_note.trim()) return false;

            if (useLegacyPropertyFields) {
                if (!data.bedrooms?.trim()) return false;
                if (!data.bathrooms?.trim()) return false;
            }

            for (const f of visibleServiceFields) {
                if (!f.is_required) continue;
                const v = data.configurable_values[f.field_key];
                if (v === undefined || v === null) return false;
                if (typeof v === "string" && !v.trim()) return false;
                if (Array.isArray(v) && v.length === 0) return false;
            }

            return true;
        },
        [visibleServiceFields, useLegacyPropertyFields]
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

    const DEFAULT_HOME = [
        { value: "Single-Family Home", label: "Single-Family Home" },
        { value: "Apartment / Condo", label: "Apartment / Condo" },
        { value: "Townhome", label: "Townhome" },
        { value: "Duplex", label: "Duplex" },
        { value: "Other", label: "Other" },
    ];
    const DEFAULT_BED = ["1", "2", "3", "4", "5+"].map((v) => ({ value: v, label: v }));
    const DEFAULT_BATH = ["1", "2", "3", "4+"].map((v) => ({ value: v, label: v }));

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

                {useLegacyPropertyFields && (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight mb-0.5">Home type</label>
                            <select
                                value={formData.home_type ?? ""}
                                onChange={(e) =>
                                    setFormData((p) => ({ ...p, home_type: e.target.value }))
                                }
                                className={`${inputPad} bg-white`}
                            >
                                <option value="">Select home type</option>
                                {DEFAULT_HOME.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                                    Bedrooms <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.bedrooms ?? ""}
                                    onChange={(e) =>
                                        setFormData((p) => ({ ...p, bedrooms: e.target.value }))
                                    }
                                    className={`${inputPad} bg-white`}
                                >
                                    <option value="">Select</option>
                                    {DEFAULT_BED.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight mb-0.5">
                                    Bathrooms <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.bathrooms ?? ""}
                                    onChange={(e) =>
                                        setFormData((p) => ({ ...p, bathrooms: e.target.value }))
                                    }
                                    className={`${inputPad} bg-white`}
                                >
                                    <option value="">Select</option>
                                    {DEFAULT_BATH.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </>
                )}

                {defsLoading && (
                    <p className="text-xs text-alloy-midnight/50">Loading property fields…</p>
                )}
                {defsReady && visibleServiceFields.length > 0 && prefetchedService && (
                    <ConfigurableFieldSections
                        entityType="location"
                        verticalSlug={verticalSlug}
                        prefetched={prefetchedService}
                        values={formData.configurable_values}
                        onChange={onConfigurableChange}
                        dense
                        sameRowAdjacentKeys={["bedrooms", "bathrooms"]}
                    />
                )}

                <div>
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

                <label className="flex items-center gap-2 cursor-pointer pt-0.5">
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
    );
}
