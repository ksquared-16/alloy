"use client";

import { useCallback, useEffect, useState } from "react";
import CommunicationPreferencesEditor from "@/components/admin/communications/CommunicationPreferencesEditor";
import { emptyPreferenceProfile } from "@/lib/communications/v2/communicationPreferenceLabels";
import type { PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";
import type { PreferenceFieldKey } from "@/lib/communications/v2/communicationPreferenceLabels";

export default function PersonCommunicationPreferencesSection({
    personId,
    canMutate,
}: {
    personId: string;
    canMutate: boolean;
}) {
    const [profile, setProfile] = useState<PersonPreferenceProfile>(emptyPreferenceProfile());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/communications/preferences?person_id=${encodeURIComponent(personId)}`, { credentials: "include" });
            const data = (await res.json()) as { preferences?: PersonPreferenceProfile; error?: string };
            if (!res.ok) {
                setError(data.error ?? "Failed to load preferences");
                return;
            }
            setProfile(data.preferences ?? emptyPreferenceProfile());
        } catch {
            setError("Failed to load preferences");
        } finally {
            setLoading(false);
        }
    }, [personId]);

    useEffect(() => {
        void load();
    }, [load]);

    const onChange = useCallback(
        async (field: PreferenceFieldKey, status: "Allowed" | "Blocked") => {
            if (!canMutate) return;
            setSaving(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/communications/preferences", {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ person_id: personId, field, status }),
                });
                const data = (await res.json()) as { ok?: boolean; error?: string };
                if (!res.ok) {
                    setError(data.error ?? "Failed to save");
                    return;
                }
                await load();
            } catch {
                setError("Failed to save");
            } finally {
                setSaving(false);
            }
        },
        [canMutate, personId, load]
    );

    if (loading) return <div className="text-xs text-alloy-midnight/45">Loading communication preferences…</div>;

    return (
        <section data-person-communication-preferences className="rounded-xl border border-alloy-stone/15 bg-white p-3 shadow-sm">
            <h3 className="text-sm font-semibold text-alloy-midnight">Communication preferences</h3>
            <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Email/text message and marketing consent for this person.</p>
            {error ? <div className="mt-2 text-[11px] text-alloy-ember">{error}</div> : null}
            <div className="mt-2">
                <CommunicationPreferencesEditor profile={profile} canEdit={canMutate} saving={saving} onChange={onChange} compact />
            </div>
        </section>
    );
}
