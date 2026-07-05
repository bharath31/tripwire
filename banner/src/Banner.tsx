import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: inter } = loadInter("normal", { weights: ["500", "700"], subsets: ["latin"] });
const { fontFamily: mono } = loadMono("normal", { weights: ["400"], subsets: ["latin"] });

const BG = "#0b0c10";
const ACCENT = "#ff4d4d";
const TEXT = "#e9e9ee";
const MUTED = "#8b8d9a";
const BORDER = "#262833";
const PANEL = "#14151c";
const GREEN = "#4ade80";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const clampOpts = (easing?: (n: number) => number) => ({
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
  ...(easing ? { easing } : {}),
});

export const Banner: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const rise = (start: number, end: number) => ({
    opacity: interpolate(frame, [start, end], [0, 1], clampOpts(ease)),
    translateY: `0 ${interpolate(frame, [start, end], [18, 0], clampOpts(ease))}px`,
  });

  const brand = rise(12, 34);
  const tag = rise(28, 50);
  const cmd = rise(44, 66);
  const card = rise(60, 88);

  // Brand mark dot pops in with a slight overshoot.
  const brandDotScale = interpolate(frame, [8, 32], [0, 1], clampOpts(Easing.bezier(0.34, 1.56, 0.64, 1)));
  const idlePulse = 0.5 + 0.5 * Math.sin(frame / 11);

  // The tripwire line + traveling "trip" pulse — the signature motion.
  const wireY = 312;
  const wireX0 = 90;
  const wireX1 = width - 90;
  const wireDraw = interpolate(frame, [18, 46], [0, 1], clampOpts(ease));
  const pulseX = interpolate(frame, [34, 92], [wireX0, wireX1], clampOpts(Easing.bezier(0.4, 0, 0.2, 1)));
  const tripAt = (wireX0 + wireX1) / 2;
  const tripFlash = interpolate(frame, [56, 62, 76], [0, 1, 0], clampOpts());
  const ringProgress = interpolate(frame, [58, 96], [0, 1], clampOpts(ease));
  const ringFade = interpolate(frame, [90, 106], [1, 0], clampOpts()); // rings clear out so the settled state is clean
  // Fade content back to the bare-background state at the very end so the GIF
  // loops seamlessly instead of hard-cutting from full composition to blank.
  const masterOut = interpolate(frame, [108, 119], [1, 0], clampOpts());
  const pulseOpacity = interpolate(frame, [34, 40, 96, 108], [0, 1, 1, 0.8], clampOpts());

  const zones: Array<[string, boolean]> = [
    ["core triggers", true],
    ["adjacent / edge", true],
    ["negatives", true],
    ["keyword variants", true],
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: inter, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px 380px at 50% -12%, rgba(255,77,77,0.16), transparent 70%)` }} />
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 39px, rgba(255,255,255,0.022) 39px 40px)" }} />

      <AbsoluteFill style={{ opacity: masterOut }}>
      {/* tripwire line */}
      <div style={{ position: "absolute", left: wireX0, top: wireY, height: 2, width: (wireX1 - wireX0) * wireDraw, background: BORDER }} />
      <div style={{ position: "absolute", left: wireX0, top: wireY, height: 2, width: (wireX1 - wireX0) * wireDraw, background: ACCENT, opacity: tripFlash * 0.85, filter: "blur(1px)" }} />

      {/* trip rings */}
      {[0, 1, 2].map((i) => {
        const localP = Math.max(0, Math.min(1, ringProgress - i * 0.14));
        const size = localP * 56;
        const op = ringProgress > 0 ? (1 - localP) * 0.5 * ringFade : 0;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: tripAt - size,
              top: wireY - size + 1,
              width: size * 2,
              height: size * 2,
              borderRadius: 9999,
              border: `2px solid ${ACCENT}`,
              opacity: op,
            }}
          />
        );
      })}

      {/* traveling pulse dot */}
      {frame >= 34 && (
        <div
          style={{
            position: "absolute",
            left: pulseX - 6,
            top: wireY - 5,
            width: 12,
            height: 12,
            borderRadius: 9999,
            background: ACCENT,
            boxShadow: `0 0 18px 4px ${ACCENT}`,
            opacity: pulseOpacity,
          }}
        />
      )}

      {/* left text block */}
      <div style={{ position: "absolute", left: 90, top: 68 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, opacity: brand.opacity, translate: brand.translateY }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 9999,
              background: ACCENT,
              scale: brandDotScale,
              boxShadow: `0 0 ${10 + idlePulse * 12}px 2px rgba(255,77,77,0.55)`,
            }}
          />
          <div style={{ fontSize: 82, fontWeight: 700, color: TEXT, letterSpacing: "-0.045em", lineHeight: 1 }}>tripwire</div>
        </div>

        <div style={{ fontSize: 28, color: MUTED, marginTop: 22, letterSpacing: "-0.01em", opacity: tag.opacity, translate: tag.translateY }}>
          The quality gate for Agent Skills
        </div>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            marginTop: 30,
            padding: "12px 18px",
            borderRadius: 10,
            background: PANEL,
            border: `1px solid ${BORDER}`,
            fontFamily: mono,
            fontSize: 20,
            color: TEXT,
            opacity: cmd.opacity,
            translate: cmd.translateY,
          }}
        >
          <span style={{ color: MUTED, marginRight: 10 }}>$</span>
          npm install -g tripwire-skills
        </div>
      </div>

      {/* right coverage card */}
      <div
        style={{
          position: "absolute",
          right: 82,
          top: 84,
          width: 336,
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(20,21,28,0.72)",
          border: `1px solid ${BORDER}`,
          fontFamily: mono,
          opacity: card.opacity,
          translate: card.translateY,
        }}
      >
        <div style={{ color: MUTED, fontSize: 14, marginBottom: 14 }}>coverage · brainstorming</div>
        {zones.map(([k]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 18, color: TEXT }}>
            <span>{k}</span>
            <span style={{ color: GREEN }}>✓</span>
          </div>
        ))}
      </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
