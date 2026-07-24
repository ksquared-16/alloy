"use client";

/**
 * Access → Access Scopes. Locations and Departments are owned by their own product surfaces —
 * this chapter is an assignment-context launch point, not a duplicate editor.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, MapPin } from "lucide-react";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

type DeptOpt = { id: string; name: string | null; key: string | null };

export default function AccessScopesPage() {
    const [departments, setDepartments] = useState<DeptOpt[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await fetch("/api/admin/settings/users-roles/members");
                const json = await res.json().catch(() => ({}));
                if (!active) return;
                if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to load departments");
                setDepartments(Array.isArray(json.departments) ? json.departments : []);
            } catch (err) {
                if (active) setError(err instanceof Error ? err.message : "Failed to load departments.");
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    return (
        <div data-testid="access-scopes-page" className="space-y-4">
            <p className="text-xs leading-snug text-alloy-midnight/55">
                Locations and departments are used to assign where a person may operate. They are owned by
                their own product surfaces — this is an assignment-context reference, not a duplicate editor.
            </p>

            {error ?
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <div className="grid gap-4 md:grid-cols-2">
                <ConfigWorkspaceCard testId="access-scopes-locations" title="Locations">
                    <div className="flex items-start gap-3">
                        <span
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-alloy-bend-pine/10 text-alloy-bend-pine"
                            aria-hidden
                        >
                            <MapPin className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-alloy-midnight/70">
                                Sites used when assigning where an operator may see and act on records.
                            </p>
                            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/40">
                                Owned by Locations
                            </p>
                            <Link
                                href={adminSettingsSubpathHref("locations")}
                                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-alloy-bend-pine hover:underline"
                                data-testid="access-scopes-locations-link"
                            >
                                Open Locations
                                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                            </Link>
                        </div>
                    </div>
                </ConfigWorkspaceCard>

                <ConfigWorkspaceCard testId="access-scopes-departments" title="Departments">
                    <div className="flex items-start gap-3">
                        <span
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-alloy-bend-pine/10 text-alloy-bend-pine"
                            aria-hidden
                        >
                            <Building2 className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-alloy-midnight/70">
                                {loading ?
                                    "Loading department catalog…"
                                : departments.length === 0 ?
                                    "No departments are configured for this organization yet."
                                :   `${departments.length} ${departments.length === 1 ? "department" : "departments"} configured for this organization.`
                                }
                            </p>
                            {departments.length > 0 ?
                                <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="access-scopes-departments-list">
                                    {departments.slice(0, 8).map((d) => (
                                        <li
                                            key={d.id}
                                            className="rounded-full border border-alloy-stone/25 bg-white px-2 py-0.5 text-[11px] text-alloy-midnight/70"
                                        >
                                            {d.name ?? d.key ?? d.id}
                                        </li>
                                    ))}
                                    {departments.length > 8 ?
                                        <li className="rounded-full border border-alloy-stone/25 bg-white px-2 py-0.5 text-[11px] text-alloy-midnight/50">
                                            +{departments.length - 8} more
                                        </li>
                                    :   null}
                                </ul>
                            :   null}
                            <Link
                                href={adminSettingsSubpathHref("departments")}
                                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-alloy-bend-pine hover:underline"
                                data-testid="access-scopes-departments-link"
                            >
                                Open Departments
                                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                            </Link>
                        </div>
                    </div>
                </ConfigWorkspaceCard>
            </div>
        </div>
    );
}
