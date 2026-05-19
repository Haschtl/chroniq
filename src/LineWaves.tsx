import { useEffect, useMemo, useRef } from "react";

interface LineWavesProps {
  backgroundColor?: string;
  colors?: string[];
  enableMouseInteraction?: boolean;
  lineCount?: number;
  opacity?: number;
  speed?: number;
}

const buildWavePath = (index: number, lineCount: number) => {
  const y = -80 + (1060 / Math.max(1, lineCount - 1)) * index;
  const lift = index % 2 === 0 ? 42 : -42;
  const drift = (index % 5) * 18;

  return [
    `M -120 ${y + drift}`,
    `C 120 ${y + lift} 260 ${y - lift} 430 ${y + drift / 2}`,
    `S 760 ${y + lift} 930 ${y - drift / 3}`,
    `S 1240 ${y - lift} 1560 ${y + drift}`,
  ].join(" ");
};

export default function LineWaves({
  backgroundColor = "#141414",
  colors = ["#7f8cff", "#47a66b", "#fffdfa"],
  enableMouseInteraction = false,
  lineCount = 22,
  opacity = 0.5,
  speed = 18,
}: LineWavesProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const waves = useMemo(
    () => Array.from({ length: lineCount }, (_, index) => ({ id: index, path: buildWavePath(index, lineCount) })),
    [lineCount],
  );

  const updatePointer = (clientX: number, clientY: number) => {
    if (!enableMouseInteraction || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    rootRef.current.style.setProperty("--line-wave-x", `${Math.round(x * 100)}%`);
    rootRef.current.style.setProperty("--line-wave-y", `${Math.round(y * 100)}%`);
    rootRef.current.style.setProperty("--line-wave-dx", `${(x - 0.5).toFixed(3)}`);
    rootRef.current.style.setProperty("--line-wave-dy", `${(y - 0.5).toFixed(3)}`);
  };

  useEffect(() => {
    if (!enableMouseInteraction) return undefined;
    const handlePointerMove = (event: PointerEvent) => updatePointer(event.clientX, event.clientY);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [enableMouseInteraction]);

  return (
    <div
      className={enableMouseInteraction ? "line-waves interactive" : "line-waves"}
      ref={rootRef}
      style={{ backgroundColor, opacity }}
    >
      <svg aria-hidden="true" className="line-waves-canvas" preserveAspectRatio="none" viewBox="0 0 1440 900">
        <defs>
          <radialGradient id="line-waves-glow" cx="50%" cy="42%" r="68%">
            <stop offset="0%" stopColor={colors[0]} stopOpacity="0.22" />
            <stop offset="54%" stopColor={colors[1] ?? colors[0]} stopOpacity="0.12" />
            <stop offset="100%" stopColor={backgroundColor} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect fill="url(#line-waves-glow)" height="900" width="1440" />
        <g className="line-waves-layer slow" style={{ animationDuration: `${speed * 1.4}s` }}>
          {waves.map((wave) => (
            <path
              d={wave.path}
              key={`slow-${wave.id}`}
              stroke={colors[wave.id % colors.length]}
              strokeOpacity={0.14 + (wave.id % 4) * 0.025}
              strokeWidth={wave.id % 6 === 0 ? 2.4 : 1.4}
            />
          ))}
        </g>
        <g className="line-waves-layer fast" style={{ animationDuration: `${speed}s` }}>
          {waves.filter((_, index) => index % 2 === 0).map((wave) => (
            <path
              d={wave.path}
              key={`fast-${wave.id}`}
              stroke={colors[(wave.id + 1) % colors.length]}
              strokeOpacity="0.18"
              strokeWidth="1"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
