"use client";

import { useCallback, useEffect, useState } from "react";
import { FormsOperationalLink, FormsWorkspaceShell, SubmissionsInboxView } from "@/components/forms/workspace";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { formsWorkspaceBreadcrumbs } from "@/lib/forms/formsModuleNav";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

type FormRow = {
    id: string;
    name: string;
};

export default function FormsSubmissionsHubClient() {
    const viewerTz = useAdminViewerTimezone();
    const [submissions, setSubmissions] = useState<SubmissionInboxRow[]>([]);
    const [formsById, setFormsById] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [subRes, formsRes] = await Promise.all([
                fetch("/api/admin/forms/submissions?limit=200", { credentials: "include" }),
                fetch("/api/admin/forms", { credentials: "include" }),
            ]);
            const subJson = await subRes.json().catch(() => ({}));
            const formsJson = await formsRes.json().catch(() => ({}));
            if (!subRes.ok) throw new Error((subJson as { error?: string }).error ?? "Failed to load submissions");
            setSubmissions((subJson as { data?: SubmissionInboxRow[] }).data ?? []);
            const map: Record<string, string> = {};
            for (const f of (formsJson as { data?: FormRow[] }).data ?? []) {
                map[f.id] = f.name;
            }
            setFormsById(map);
        } catch (e) {
            setError((e as Error).message);
            setSubmissions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <FormsWorkspaceShell
            title="Submissions inbox"
            subtitle="Incoming intake to review, link, and produce outputs from."
            breadcrumbs={formsWorkspaceBreadcrumbs([{ label: "Submissions" }])}
            actions={
                <FormsOperationalLink href={ADMIN_FORMS_UI_BASE}>Workspace</FormsOperationalLink>
            }
            contentClassName="space-y-0"
        >
            <SubmissionsInboxView
                rows={submissions}
                formsById={formsById}
                viewerTz={viewerTz}
                loading={loading}
                error={error}
                emptyMessage="No submissions yet. Distribute a form or packet link from the workspace."
                onRefresh={() => void load()}
            />
        </FormsWorkspaceShell>
    );
}
