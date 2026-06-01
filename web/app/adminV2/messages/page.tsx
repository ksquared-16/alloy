import { Suspense } from "react";

import InboxClient from "@/app/adminV2/messages/InboxClient";

export default function AdminV2InboxPage() {
    return (
        <Suspense
            fallback={
                <main className="flex h-[calc(100dvh-3.75rem)] items-center justify-center bg-[#F8F9FB] text-sm text-alloy-midnight/55">
                    Loading inbox…
                </main>
            }
        >
            <InboxClient />
        </Suspense>
    );
}
