"use client";

/**
 * Load tenant `field_definitions` for the surface builders' Add Field pickers.
 *
 * Reuses the existing field-catalog endpoint (which already loads + returns
 * `tenantFieldDefinitions`) so operator-created custom fields flow into the
 * composition adapter's namespace-compatible groups. Fails soft: on any error
 * it returns an empty list, so the builder still shows platform starter fields.
 *
 * @see app/api/admin/entity-layouts/field-catalog/route.ts (returns tenantFieldDefinitions)
 * @see lib/adminV2/settings/surfaces/compositionFieldAdapter.ts (consumer)
 */

import { useEffect, useState } from "react";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export function useTenantFieldDefinitions(entityType = "opportunities"): {
    tenantFieldDefinitions: TenantFieldDefinitionRow[];
    loading: boolean;
} {
    const [tenantFieldDefinitions, setDefs] = useState<TenantFieldDefinitionRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetch(`/api/admin/entity-layouts/field-catalog?entity_type=${encodeURIComponent(entityType)}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((data) => {
                if (cancelled) return;
                const defs = Array.isArray(data?.tenantFieldDefinitions) ? data.tenantFieldDefinitions : [];
                setDefs(defs as TenantFieldDefinitionRow[]);
            })
            .catch(() => {
                if (!cancelled) setDefs([]); // fail soft — starter fields still show
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [entityType]);

    return { tenantFieldDefinitions, loading };
}
