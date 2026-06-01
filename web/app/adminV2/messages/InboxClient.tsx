"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import InboxPanel, { parseInboxFolderParam } from "@/app/adminV2/messages/InboxPanel";

function InboxPageBody() {
    const searchParams = useSearchParams();
    const initialFolder = parseInboxFolderParam(searchParams.get("folder"));
    return <InboxPanel layout="page" initialFolder={initialFolder} />;
}

export default function InboxClient() {
    return (
        <Suspense
            fallback={
                <main className="flex h-[calc(100dvh-3.75rem)] items-center justify-center bg-[#F8F9FB] text-sm text-alloy-midnight/55">
                    Loading inbox…
                </main>
            }
        >
            <InboxPageBody />
        </Suspense>
    );
}
