"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// El póster de la página es un cuadro con el celular y la cuenta. El cuadro rojo del inicio
// (demo-poster.jpg) queda solo para la vista previa al compartir el enlace (og:image).
const VIDEOS = {
  wide: { src: "/video/demo.mp4", poster: "/video/demo-poster-cuenta.jpg", ratio: "16 / 9" },
  tall: { src: "/video/demo-vertical.mp4", poster: "/video/demo-vertical-poster-cuenta.jpg", ratio: "9 / 16" },
} as const;

/**
 * El video vertical en celular y el horizontal en computadora. Solo se descarga uno: mientras carga
 * la página se ve el póster correcto (con <picture>, sin JavaScript) y al montar se pone el video.
 * Si el navegador no deja reproducir solo, aparece un botón de play grande en el centro.
 */
export function DemoVideo({ className }: { className?: string }) {
  const [kind, setKind] = useState<"wide" | "tall" | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setKind(mq.matches ? "tall" : "wide");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Intenta reproducir solo; si el navegador lo impide, se muestra el botón.
  useEffect(() => {
    const v = ref.current;
    if (!kind || !v) return;
    setNeedsTap(false);
    v.play().catch(() => setNeedsTap(true));
  }, [kind]);

  const start = () => { void ref.current?.play().then(() => setNeedsTap(false)).catch(() => {}); };

  return (
    <div className={cn("relative mx-auto w-full max-w-[min(100%,calc(78dvh*9/16))] overflow-hidden rounded-3xl bg-[#F6F3EF] shadow-[0_30px_60px_-30px_rgba(28,28,30,0.55)] md:max-w-4xl lg:max-w-none", className)}
      style={{ aspectRatio: kind === "wide" ? VIDEOS.wide.ratio : undefined }}>
      {kind ? (
        <video ref={ref} key={kind} className="block size-full object-cover" src={VIDEOS[kind].src} poster={VIDEOS[kind].poster}
          autoPlay muted loop playsInline controls preload="auto" aria-label="Video de Divimesa: cómo paga una mesa"
          onPlay={() => setNeedsTap(false)} />
      ) : (
        <picture>
          <source media="(max-width: 767px)" srcSet={VIDEOS.tall.poster} />
          <img src={VIDEOS.wide.poster} alt="Divimesa: la cuenta de la mesa en el celular" className="block w-full" />
        </picture>
      )}
      {needsTap ? (
        <button type="button" onClick={start} aria-label="Reproducir el video"
          className="absolute inset-0 flex items-center justify-center bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#D91E18]">
          <span className="flex size-20 items-center justify-center rounded-full bg-[#D91E18] text-white shadow-xl sm:size-24">
            <svg viewBox="0 0 24 24" className="ml-1 size-9 sm:size-11" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.5-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5Z" /></svg>
          </span>
        </button>
      ) : null}
    </div>
  );
}
