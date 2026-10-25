/**
 * Self-hosted Poppins via next/font/local.
 *
 * Build-time `next/font/google` requires outbound network to fonts.googleapis.com /
 * fonts.gstatic.com. Vacilando's contained production-build sandbox denies that
 * network by design — so Google Fonts at build time is an Alloy application
 * defect, not a sandbox defect.
 *
 * Assets: `web/fonts/poppins/*.woff2` (SIL Open Font License 1.1; vendored from
 * @fontsource/poppins 5.3.0 latin normals). Runtime Stripe Elements still loads
 * Poppins for iframes via cssSrc — that is browser runtime, not next build.
 *
 * Turbopack (Next 16 default production bundler) requires `src` path/weight/style
 * to be written as object-literal arrays — not a shared variable or array methods.
 */
import localFont from "next/font/local";

/** Root / marketing shell — weights 300–700. */
export const poppins = localFont({
  src: [
    { path: "../../fonts/poppins/poppins-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

/** AdminV2 + proof shells — same family files; distinct CSS variable (no weight 300). */
export const poppinsAdminV2 = localFont({
  src: [
    { path: "../../fonts/poppins/poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-poppins-adminv2",
  display: "swap",
});
