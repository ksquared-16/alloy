import { Suspense } from "react";
import AiActivityPageClient from "./AiActivityPageClient";

export default function AiActivityPage() {
    return (
        <Suspense fallback={<div>Loading AI activity…</div>}>
            <AiActivityPageClient />
        </Suspense>
    );
}
