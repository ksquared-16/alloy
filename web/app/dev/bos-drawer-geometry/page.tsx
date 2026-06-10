import { notFound } from "next/navigation";

import BosDrawerGeometryFixture from "./BosDrawerGeometryFixture";

/** Dev-only BOS + drawer geometry fixture — not production. */
export default function BosDrawerGeometryPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <BosDrawerGeometryFixture />;
}
