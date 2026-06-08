import { notFound } from "next/navigation";
import P1cReviewGallery from "./P1cReviewGallery";

/**
 * Visual fixture gallery for P1-C UX review screenshots (Playwright).
 * Disabled in production builds — route returns 404.
 */
export default function P1cOperationalAttentionReviewPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <P1cReviewGallery />;
}
