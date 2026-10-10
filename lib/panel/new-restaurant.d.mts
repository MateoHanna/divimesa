export function slugify(name: string): string;
export interface NewRestaurantInput { name?: string; slug?: string; color?: string; tables?: number | string; mode?: string; sinpe?: string; holder?: string }
export interface NewRestaurant { name: string; slug: string; color: string; tables: number; mode: "total" | "items"; sinpe: string | null; holder: string | null }
export function validateNewRestaurant(input: NewRestaurantInput): { ok: true; value: NewRestaurant } | { ok: false; errors: string[] };
export function parseArgs(argv: string[]): Record<string, string | true>;
