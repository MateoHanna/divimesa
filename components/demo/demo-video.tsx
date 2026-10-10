"use client";

import { useEffect, useState } from "react";

const VIDEOS = {
  wide: { src: "/video/demo.mp4", poster: "/video/demo-poster.jpg", ratio: "16 / 9" },
  tall: { src: "/video/demo-vertical.mp4", poster: "/video/demo-vertical-poster.jpg", ratio: "9 / 16" },
} as const;

/**
 * El video vertical en celular y el horizontal en computadora. Solo se descarga uno: mientras carga
 * la página se ve el póster correcto (con <picture>, sin JavaScript) y al montar se pone el video.
 */
export function DemoVideo() {
  const [kind, setKind] = useState<"wide" | "tall" | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setKind(mq.matches ? "tall" : "wide");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[min(100%,calc(78dvh*9/16))] overflow-hidden rounded-3xl bg-[#D91E18] shadow-[0_30px_60px_-30px_rgba(28,28,30,0.55)] md:max-w-4xl"
      style={{ aspectRatio: kind === "wide" ? VIDEOS.wide.ratio : undefined }}>
      {kind ? (
        <video key={kind} className="block size-full object-cover" src={VIDEOS[kind].src} poster={VIDEOS[kind].poster}
          autoPlay muted loop playsInline controls preload="auto" aria-label="Video de Divimesa: cómo paga una mesa" />
      ) : (
        <picture>
          <source media="(max-width: 767px)" srcSet={VIDEOS.tall.poster} />
          <img src={VIDEOS.wide.poster} alt="Divimesa: ¿La mesa quiere pagar por separado?" className="block w-full" />
        </picture>
      )}
    </div>
  );
}
