import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  PANEL_PIN: z.string().min(4),
  PAYMENT_PROVIDER: z.enum(["mock"]).default("mock"),
  MOCK_WEBHOOK_SECRET: z.string().min(16),
  APP_URL: z.url().optional(),
  // Opcional: restaurante que muestra el panel (hasta que cada restaurante tenga su propio PIN).
  PANEL_RESTAURANT_ID: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || undefined),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** Variables del servidor, validadas una vez. Falla con un mensaje claro si falta alguna. */
export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() solo se puede usar en el servidor.");
  }
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Faltan o son inválidas estas variables de entorno: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}
