export const dynamic = "force-dynamic";

import SchedulingWorkspaceClient from "@/app/dev/scheduling-workspace/SchedulingWorkspaceClient";

export default function DevSchedulingWorkspacePage() {
    return (
        <div className="w-full max-w-4xl px-4 pb-12">
            <SchedulingWorkspaceClient />
        </div>
    );
}
