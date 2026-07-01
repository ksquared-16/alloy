"use client";

/**
 * Layout queue row hold — prevents VM card flash while layout doc loads.
 */

export default function LayoutRuntimeQueueRowHold() {
    return (
        <div
            className="adminv2-ws-enrollment-crm-row adminv2-ws-enrollment-crm-row--split"
            data-layout-runtime-queue-row-hold="true"
            aria-hidden
        >
            <div className="adminv2-ws-enrollment-crm-row__content">
                <div
                    className="flex w-full animate-pulse items-stretch justify-between gap-3 rounded-lg p-2.5"
                    style={{
                        border: "1px solid rgba(0,162,131,0.22)",
                        borderLeft: "3px solid rgba(0,162,131,0.35)",
                        background: "linear-gradient(172deg,#ffffff 0%, rgba(0,162,131,0.045) 100%)",
                    }}
                >
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <div className="h-3.5 w-3.5 rounded bg-alloy-stone/25" />
                            <div className="h-3.5 w-32 rounded bg-alloy-stone/20" />
                            <div className="h-4 w-16 rounded-full bg-alloy-stone/15" />
                        </div>
                        <div className="h-3 w-48 rounded bg-alloy-stone/15" />
                        <div className="h-3 w-36 rounded bg-alloy-stone/10" />
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                        <div className="h-6 w-14 rounded bg-alloy-stone/20" />
                        <div className="h-6 w-16 rounded bg-alloy-stone/15" />
                    </div>
                </div>
            </div>
        </div>
    );
}
