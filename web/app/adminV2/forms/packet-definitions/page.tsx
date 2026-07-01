import { Suspense } from "react";
import PacketDefinitionsHubClient from "@/app/legacy-admin/forms/PacketDefinitionsHubClient";

export const dynamic = "force-dynamic";

export default function AdminV2PacketDefinitionsPage() {
    return (
        <Suspense fallback={<p className="p-6 text-sm text-[#59678b]">Loading…</p>}>
            <PacketDefinitionsHubClient />
        </Suspense>
    );
}
