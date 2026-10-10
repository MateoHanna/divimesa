import { redirect } from "next/navigation";

// La página para compartir ahora es la portada.
export default function DemoRedirect() {
  redirect("/");
}
