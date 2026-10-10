// Validación y armado de los datos de un restaurante nuevo. Lo usa scripts/crear-restaurante.mjs y las pruebas.

/** "Soda La Esquina" -> "soda-la-esquina" (minúsculas, sin tildes, máximo 40 caracteres). */
export function slugify(name) {
  return String(name ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 40).replace(/-+$/g, "");
}

const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

/**
 * Revisa lo que se escribió y devuelve { ok: true, value } o { ok: false, errors }.
 * Las mismas reglas están en admin_create_restaurant (SQL); aquí se avisa antes, con mensajes claros.
 */
export function validateNewRestaurant(input) {
  const errors = [];
  const name = String(input.name ?? "").trim();
  if (name.length < 1 || name.length > 80) errors.push("El nombre del restaurante debe tener entre 1 y 80 caracteres.");

  const slug = String(input.slug ?? "").trim().toLowerCase() || slugify(name);
  if (!SLUG.test(slug)) errors.push("El código del restaurante solo puede tener letras minúsculas, números y guiones (máximo 40).");
  if (slug === "demo") errors.push("El código «demo» está reservado para la demostración.");

  const color = String(input.color ?? "#D91E18").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) errors.push("El color debe ser como #D91E18 (seis dígitos hexadecimales).");

  const tables = Number(input.tables);
  if (!Number.isInteger(tables) || tables < 1 || tables > 200) errors.push("El número de mesas debe ser un entero entre 1 y 200.");

  const mode = String(input.mode ?? "total").trim();
  if (mode !== "total" && mode !== "items") errors.push("El modo de cuenta debe ser «total» (solo el total) o «items» (por platos).");

  const sinpe = String(input.sinpe ?? "").replace(/[\s-]/g, "");
  const holder = String(input.holder ?? "").trim();
  if (sinpe !== "" && !/^\d{8}$/.test(sinpe)) errors.push("El número de SINPE Móvil debe tener 8 dígitos.");
  if (holder !== "" && (holder.length < 2 || holder.length > 80)) errors.push("El nombre del titular del SINPE debe tener entre 2 y 80 caracteres.");
  if ((sinpe === "") !== (holder === "")) errors.push("El número de SINPE y el nombre del titular van juntos: escriba ambos o ninguno.");
  if (mode === "total" && sinpe === "") errors.push("En modo «solo el total» hace falta el número de SINPE Móvil y el nombre del titular.");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, slug, color: color.toUpperCase(), tables, mode, sinpe: sinpe || null, holder: holder || null },
  };
}

/** Lee --clave valor y --bandera de la línea de comandos. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}
