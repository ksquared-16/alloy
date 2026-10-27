import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Book a tour",
    robots: { index: false, follow: false },
};

/** Public tour journey shell: no marketing chrome (see ConditionalSiteLayout), same participant surface as forms. */
export default function PublicToursLayout({ children }: { children: React.ReactNode }) {
    return <div className="alloy-participant-surface min-h-screen bg-white text-neutral-900 antialiased">{children}</div>;
}
