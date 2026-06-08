"use client";

import MyTasksPanel from "@/app/adminV2/components/MyTasksPanel";

/** Fallback full-page tasks view — primary UX is the top-nav modal. */
export default function AdminV2TasksClient() {
    return (
        <div data-adminv2-tasks-page="true">
            <MyTasksPanel />
        </div>
    );
}
