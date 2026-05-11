import { Suspense } from "react";
import PacketDefinitionDetailClient from "@/app/admin/forms/PacketDefinitionDetailClient";

export const dynamic = "force-dynamic";

export default function AdminV2PacketDefinitionDetailPage() {
    return (
        <Suspense fallback={<p className="p-6 text-sm text-[#59678b]">Loading packet…</p>}>
            <PacketDefinitionDetailClient />
        </Suspense>
    );
}
