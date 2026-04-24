import {
    DepartmentRouteSkeletonBody,
    WsRouteLoadingRibbon,
} from "@/components/admin/workspace/workspaceRouteSkeletons";

export default function Loading() {
    return (
        <div className="w-full max-w-none mx-0 px-0 pt-2 pb-0 space-y-4 relative">
            <WsRouteLoadingRibbon label="Loading department" />
            <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 px-1" aria-label="Breadcrumb">
                <span className="flex items-center gap-1">
                    <span className="text-alloy-midnight/80 font-medium">Workspace</span>
                </span>
                <span className="text-alloy-midnight/40" aria-hidden>
                    /
                </span>
                <span className="text-alloy-midnight/80 font-medium" aria-hidden>
                    …
                </span>
            </nav>
            <DepartmentRouteSkeletonBody />
        </div>
    );
}
