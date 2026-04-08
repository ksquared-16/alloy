"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";

export default function WorkspaceIndexPage() {
    const router = useRouter();
    const [message, setMessage] = useState("Resolving Operations department…");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/departments");
                const json = (await res.json().catch(() => ({}))) as { items?: { id: string; name: string | null }[]; error?: string };
                if (!res.ok) throw new Error(json.error ?? "Failed to load departments");
                const items = json.items ?? [];
                const ops = items.find((d) => (d.name ?? "").trim().toLowerCase() === "operations");
                if (ops && !cancelled) {
                    router.replace(`/admin/workspace/dept/${ops.id}`);
                    return;
                }
                if (!cancelled) {
                    setMessage(
                        "No department named “Operations” was found. Create one under Organization → Departments, then return here."
                    );
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
