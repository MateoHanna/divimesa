import type { MetadataRoute } from "next";

import { BRAND } from "@/lib/brand";

// Solo la portada es pública para buscadores: /panel, /demo, /m y /privacidad quedan fuera.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: BRAND.site, changeFrequency: "monthly", priority: 1 }];
}
