import { notFound } from "next/navigation";

import OperationalIntakeShapeR2Gallery from "./OperationalIntakeShapeR2Gallery";

export default function OperationalIntakeShapeR2Page() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <OperationalIntakeShapeR2Gallery />;
}
