"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackMetaEvent } from "@/lib/metaPixel";

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/**
 * Meta Pixel component that:
 * 1. Loads the pixel script if NEXT_PUBLIC_META_PIXEL_ID is set
 * 2. Tracks PageView on initial load
 * 3. Tracks PageView on route changes
 */
export default function MetaPixel() {
  const pathname = usePathname();

  // Track PageView on route changes
  useEffect(() => {
    if (!META_PIXEL_ID || typeof window === "undefined" || !window.fbq) {
      return;
    }

    // Small delay to ensure page is fully loaded
    const timeoutId = setTimeout(() => {
      trackMetaEvent("PageView");
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [pathname]);

  // Don't render if pixel ID is not configured
  if (!META_PIXEL_ID) {
    return null;
  }

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

