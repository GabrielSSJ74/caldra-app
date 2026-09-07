import { useCallback, useEffect, useRef, useState } from "react";
import { buildWire, DEFAULT_PARAMS } from "@/lib/viz3d/wire";
import { Wire3D } from "./Wire3D";
import { cn } from "@/lib/utils";

const PIECES: { slug: string; name: string }[] = [
  { slug: "quadrado-redondo", name: "Quadrado → Redondo" },
  { slug: "cilindro", name: "Cilindro" },
  { slug: "cone", name: "Cone" },
  { slug: "tronco-de-cone", name: "Tronco de Cone" },
  { slug: "cone-excentrico", name: "Cone Excêntrico" },
  { slug: "boca-de-lobo", name: "Boca de Lobo" },
  { slug: "y", name: "Y" },
  { slug: "reducao-circular", name: "Redução" },
  { slug: "curva-de-gomos", name: "Curva de Gomos" },
  { slug: "flanges", name: "Flange" },
];

const INTERVAL = 4500;
const ANIM = 340;

/** Carrossel 3D da tela inicial: troca automática, animação de swipe e arraste manual. */
export function PieceCarousel({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0); // -1 .. 1 (fração da largura)
  const [dragging, setDragging] = useState(false);
  const busy = useRef(false);
  const start = useRef<number | null>(null);
  const width = useRef(1);

  const go = useCallback((dir: 1 | -1) => {
    if (busy.current) return;
    busy.current = true;
    setDragging(false);
    setOffset(-dir);
    window.setTimeout(() => {
      setIndex((i) => (i + dir + PIECES.length) % PIECES.length);
      setDragging(true); // sem transição para reposicionar
      setOffset(dir);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setDragging(false);
          setOffset(0);
          window.setTimeout(() => (busy.current = false), ANIM);
        });
      });
    }, ANIM);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => go(1), INTERVAL);
    return () => window.clearInterval(t);
  }, [go, index]);

  const piece = PIECES[index]!;

  const onDown = (x: number, w: number) => {
    if (busy.current) return;
    start.current = x;
    width.current = Math.max(w, 1);
    setDragging(true);
  };
  const onMove = (x: number) => {
    if (start.current == null) return;
    setOffset((x - start.current) / width.current);
  };
  const onUp = () => {
    if (start.current == null) return;
    const o = offset;
    start.current = null;
    setDragging(false);
    setOffset(0);
    if (Math.abs(o) > 0.22) go(o < 0 ? 1 : -1);
  };

  return (
    <div
      className={cn("relative touch-pan-y overflow-hidden select-none", className)}
      onTouchStart={(e) =>
        onDown(e.touches[0]?.clientX ?? 0, e.currentTarget.clientWidth)
      }
      onTouchMove={(e) => onMove(e.touches[0]?.clientX ?? 0)}
      onTouchEnd={onUp}
      onPointerDown={(e) => {
        if (e.pointerType === "touch") return;
        onDown(e.clientX, e.currentTarget.clientWidth);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch" || start.current == null) return;
        onMove(e.clientX);
      }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      <div
        className="size-full"
        style={{
          transform: `translateX(${(offset * 100).toFixed(2)}%)`,
          opacity: 1 - Math.min(Math.abs(offset), 1) * 0.85,
          transition: dragging
            ? "none"
            : `transform ${ANIM}ms cubic-bezier(.4,0,.2,1), opacity ${ANIM}ms linear`,
        }}
      >
        <Wire3D
          model={buildWire(piece.slug, { ...DEFAULT_PARAMS, seg: 44 })}
          autoSpin
          className="size-full text-foreground/85"
        />
      </div>
      <span className="pointer-events-none absolute bottom-1 left-0 font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
        {piece.name}
      </span>
    </div>
  );
}
