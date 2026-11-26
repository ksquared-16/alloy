import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";
import { EMBED_ORIGIN } from "@/lib/locations";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Firefly Early Learning",
    template: "%s | Firefly Early Learning",
  },
  description:
    "Safe, nurturing early childhood programs designed to help children explore, learn, and thrive.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Warm DNS + TLS to the form host so the iframe request does not pay handshake cost. */}
        <link rel="preconnect" href={EMBED_ORIGIN} crossOrigin="" />
        <link rel="dns-prefetch" href={EMBED_ORIGIN} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
