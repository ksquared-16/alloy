"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";

type DepartmentRow = {
    id: string;
    name?: string | null;
    /** When the API exposes it, this row is preferred as the workspace landing department. */
    is_default?: boolean;
};

export default function WorkspaceIndexPage() {
    const router = useRouter();
    const [message, setMessage] = useState("Loading workspace…");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/departments");
                const json = (await res.json().catch(() => ({}))) as { items?: DepartmentRow[]; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Failed to load departments");
                const departments = json.items ?? [];
                if (departments.length === 0) {
                    if (!cancelled) {
                        setMessage(
                            "No departments found for your organization. Create one under Organization → Departments, then return here."
                        );
                    }
                    return;
                }
                const defaultDept = departments.find((d) => d.is_default === true) ?? departments[0];
                if (!cancelled) {
                    router.replace(`/admin/workspace/dept/${defaultDept.id}`);
                }
            } catch (e) {
                if (!cancelled) setMessage((e as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [router]);

    return (
        <WorkspaceChrome breadcrumbs={[{ href: "/admin/workspace", label: "Workspace" }]} title="Workspace" subtitle={message}>
            <p className="text-sm text-alloy-midnight/60">{message}</p>
        </WorkspaceChrome>
    );
}
