import { Poppins } from "next/font/google";

/**
 * Isolated layout for the Layout Configuration UI.
 *
 * Lives in the `(proof)` route group so the URL is `/adminV2/layouts` WITHOUT
 * inheriting `app/adminV2/layout.tsx` (which mounts AdminV2Shell and drops
 * children for non-workspace routes). Same isolation pattern as
 * `/adminV2/layout-proof`. AdminV2 visual language (Poppins + neutral surface);
 * no shell, sidebar, command bar, canvas, or VM runtime mounts.
 */

const poppins = Poppins({
    weight: ["400", "500", "600", "700"],
    subsets: ["latin"],
    variable: "--font-poppins-adminv2",
    display: "swap",
});

export const dynamic = "force-dynamic";

export default function AdminV2LayoutsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div
            className={poppins.variable}
            style={{
                fontFamily: "var(--font-poppins-adminv2), system-ui, sans-serif",
                minHeight: "100vh",
                backgroundColor: "#f6f8fb",
            }}
        >
            <div className="mx-auto max-w-[1200px] px-6 py-6">{children}</div>
        </div>
    );
}
