#!/usr/bin/env node
// Crea un restaurante real (con sus mesas) y genera su PIN de panel. El PIN se muestra UNA vez, en esta terminal:
// no se guarda en ningún archivo ni en la base (solo su hash). Si se pierde, se genera otro con --cambiar-pin.
//
// Uso (desde la carpeta del proyecto, con .env.local que apunte al proyecto de Supabase que corresponda):
//   npm run restaurante:crear                      (pregunta lo que falte)
//   npm run restaurante:crear -- --nombre "Soda La Esquina" --mesas 12 --modo total --sinpe 88887777 --titular "Soda La Esquina SA" --color "#0F766E"
//   npm run restaurante:crear -- --cambiar-pin soda-la-esquina
// Opciones: --codigo (por defecto sale del nombre), --simular (revisa sin tocar la base), --si (no pide confirmación).
import { createInterface } from "node:readline/promises";
import { stdin, stdout, exit, env } from "node:process";

import { createClient } from "@supabase/supabase-js";

import { parseArgs, validateNewRestaurant } from "../lib/panel/new-restaurant.mjs";
import { generatePin, hashPin } from "../lib/panel/pin.mjs";

const args = parseArgs(process.argv.slice(2));
const rl = createInterface({ input: stdin, output: stdout });

async function ask(label, current, fallback) {
  if (typeof current === "string" && current !== "") return current;
  const hint = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${label}${hint}: `)).trim();
  return answer || fallback || "";
}

function die(message) {
  console.error(`\nError: ${message}`);
  rl.close();
  exit(1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (env.APP_URL ?? "").replace(/\/$/, "");
if (!args.simular && (!url || !key)) die("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Use: node --env-file=.env.local (el comando npm ya lo hace).");

const db = args.simular ? null : createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const target = url ? new URL(url).host : "(sin base de datos: simulación)";

function show(result) {
  console.log("\n==============================================================");
  console.log(`  Restaurante:  ${result.name ?? result.slug}`);
  console.log(`  Código:       ${result.slug}`);
  console.log(`  PIN:          ${result.pin}`);
  console.log("==============================================================");
  console.log("  El PIN solo se muestra ahora. No se guardó en ningún archivo ni en la base (solo su hash).");
  console.log("  Anótelo y entréguelo al restaurante; si se pierde, genere otro con --cambiar-pin.");
  console.log(`\n  Panel:        ${appUrl || "<APP_URL>"}/panel?r=${result.slug}`);
  if (result.tables) console.log(`  QR de mesas:  ${appUrl || "<APP_URL>"}/panel/qr  (inicie sesión con el código y el PIN; imprima en tamaño Carta)`);
  console.log("");
}

try {
  if (typeof args["cambiar-pin"] === "string") {
    const slug = args["cambiar-pin"].trim().toLowerCase();
    console.log(`Base de datos: ${target}`);
    if (!args.si && !args.simular) {
      const ok = (await rl.question(`Se cambiará el PIN de «${slug}» y se cerrarán sus sesiones abiertas. Escriba SI para continuar: `)).trim();
      if (ok !== "SI") die("Cancelado.");
    }
    const pin = generatePin();
    if (!args.simular) {
      const { error } = await db.rpc("admin_set_pin", { p_slug: slug, p_pin_hash: hashPin(pin) });
      if (error) die(error.message === "restaurant_not_found" ? `No existe un restaurante real con el código «${slug}».` : error.message);
    }
    show({ slug, pin });
    rl.close();
    exit(0);
  }

  const name = await ask("Nombre del restaurante", args.nombre);
  const mode = await ask("Modo de cuenta: total (solo el total) o items (por platos)", args.modo, "total");
  const tables = await ask("Número de mesas", args.mesas, "10");
  const color = await ask("Color de la marca (hex)", args.color, "#D91E18");
  let sinpe = typeof args.sinpe === "string" ? args.sinpe : "";
  let holder = typeof args.titular === "string" ? args.titular : "";
  if (mode === "total" || args.sinpe || args.titular) {
    sinpe = await ask("Número de SINPE Móvil (8 dígitos)", sinpe);
    holder = await ask("Nombre del titular del SINPE", holder, name);
  }
  const checked = validateNewRestaurant({ name, slug: typeof args.codigo === "string" ? args.codigo : "", color, tables, mode, sinpe, holder });
  if (!checked.ok) die(`\n - ${checked.errors.join("\n - ")}`);
  const v = checked.value;

  console.log(`\nBase de datos:  ${target}`);
  console.log(`Se creará:      ${v.name} (código «${v.slug}»), ${v.tables} mesas, modo ${v.mode === "total" ? "solo el total" : "por platos"}, color ${v.color}`);
  if (v.sinpe) console.log(`SINPE Móvil:    ${v.sinpe.slice(0, 4)}-${v.sinpe.slice(4)} a nombre de ${v.holder}`);
  if (!args.si && !args.simular) {
    const ok = (await rl.question("Escriba SI para crearlo: ")).trim();
    if (ok !== "SI") die("Cancelado.");
  }

  const pin = generatePin();
  if (!args.simular) {
    const { error } = await db.rpc("admin_create_restaurant", {
      p_name: v.name, p_slug: v.slug, p_color: v.color, p_tables: v.tables, p_bill_mode: v.mode,
      p_sinpe_number: v.sinpe, p_sinpe_holder: v.holder, p_pin_hash: hashPin(pin),
    });
    if (error) die(error.message === "slug_taken" ? `Ya existe un restaurante con el código «${v.slug}». Use --codigo con otro.` : error.message);
  } else {
    console.log("\n(Simulación: no se tocó la base de datos.)");
  }
  show({ name: v.name, slug: v.slug, pin, tables: v.tables });
} finally {
  rl.close();
}
