"use client";

import { useEffect, useState } from "react";
import { personChildRelationshipFieldDefinitionsEntityType } from "./emergencyContactFieldEditBinding";

export type EmergencyContactPcrFieldDefinition = {
    field_key: string;
    field_type: string;
    config?: Record<string, unknown> | null;
};

/** Loads tenant PCR field_definitions for choice binding resolution. */
export function useEmergencyContactPcrFieldDefinitions(enabled: boolean): {
    definitions: EmergencyContactPcrFieldDefinition[];
    loading: boolean;
} {
    const [definitions, setDefinitions] = useState<EmergencyContactPcrFieldDefinition[]>([]);
    const [loading, setLoading] = useState(enabled);

    useEffect(() => {
        if (!enabled) {
            setDefinitions([]);
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        setLoading(true);
        const entityType = personChildRelationshipFieldDefinitionsEntityType();

        void (async () => {
            const res = await fetch(
                `/api/admin/field-definitions?entity_type=${encodeURIComponent(entityType)}`,
                { credentials: "include" },
            );
            if (!res.ok) {
                if (!cancelled) {
                    setDefinitions([]);
                    setLoading(false);
                }
                return;
            }
            const json = (await res.json()) as { field_definitions?: EmergencyContactPcrFieldDefinition[] };
            if (!cancelled) {
                setDefinitions(json.field_definitions ?? []);
                setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return { definitions, loading };
}
