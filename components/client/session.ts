// Id de sesión del cliente: aleatorio, en localStorage (envuelto en try/catch), solo para sus reservas.
const KEY = "qr-session";
const VALID = /^[A-Za-z0-9_-]{16,64}$/;
let memory: string | null = null;

function newId(): string {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }
}

/** Solo se llama desde el navegador (en eventos o después de montar). */
export function getSessionId(): string {
  try {
    const s = window.localStorage.getItem(KEY);
    if (s && VALID.test(s)) return s;
  } catch {
    /* localStorage no disponible (modo privado, bloqueado) */
  }
  if (memory) return memory;
  memory = newId();
  try {
    window.localStorage.setItem(KEY, memory);
  } catch {
    /* se queda en memoria hasta recargar */
  }
  return memory;
}
