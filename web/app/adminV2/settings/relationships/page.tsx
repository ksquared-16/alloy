import { Suspense } from "react";
import RelationshipsSettingsClient from "./RelationshipsSettingsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsRelationshipsPage() {
    return (
        <Suspense fallback={<p className="text-sm text-alloy-midnight/55">Loading…</p>}>
            <RelationshipsSettingsClient />
        </Suspense>
    );
}
