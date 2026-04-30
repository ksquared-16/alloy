import "@/app/adminV2/components/workspace/workspace.css";
import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";

export default function Loading() {
    return (
        <div data-ws-surface="company" className="adminv2-ws-root adminv2-ws-company adminv2-ws-company-v2">
            <div className="adminv2-ws-dept-v2-contain relative">
                <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 pb-2" aria-label="Breadcrumb">
                    <span className="text-alloy-midnight/80 font-medium">Workspace</span>
                </nav>
                <AdminV2RouteLoadingState variant="workspace" />
            </div>
        </div>
    );
}
