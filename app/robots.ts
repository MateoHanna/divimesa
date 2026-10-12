import type { MetadataRoute } from "next";

import { BRAND } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/panel", "/demo", "/m", "/privacidad", "/api"] },
    sitemap: `${BRAND.site}/sitemap.xml`,
    host: BRAND.site,
  };
}
