"use client";

import { useState } from "react";
import EffectiveDrawerLayoutPreviewPanel from "@/components/adminV2/settings/EffectiveDrawerLayoutPreviewPanel";
import LayoutIntegrityReportPanel from "@/components/adminV2/settings/LayoutIntegrityReportPanel";
import OpportunityWorkflowV1DrawerOrderEditor from "@/components/adminV2/settings/OpportunityWorkflowV1DrawerOrderEditor";

export default function LayoutsSettingsClient() {
    const [previewRefresh, setPreviewRefresh] = useState(0);
    return (
        <div className="space-y-4">
            <LayoutIntegrityReportPanel />
            <EffectiveDrawerLayoutPreviewPanel refreshToken={previewRefresh} />
            <OpportunityWorkflowV1DrawerOrderEditor onSaved={() => setPreviewRefresh((n) => n + 1)} />
        </div>
    );
}
