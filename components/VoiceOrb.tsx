/*
 * The Clawnection logo as an interactive voice orb. The same component is used on
 * the home page (decorative) and the voice-onboarding page (button). When
 * `as="button"` it is keyboard-focusable and dispatches onClick; otherwise it
 * renders a non-interactive div for visual use.
 */

type VoiceOrbProps = {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  as?: "button" | "div";
  size?: number;
  className?: string;
};

export function VoiceOrb({
  active = false,
  disabled = false,
  onClick,
  ariaLabel,
  as = "button",
  size,
  className,
}: VoiceOrbProps) {
  const sizeStyle = size ? { width: size, height: size } : undefined;

  const innards = (
    <>
      <span className="voice-orb-ring" aria-hidden="true" />
      <span className="voice-orb-ring" aria-hidden="true" />
      <span className="voice-orb-ring" aria-hidden="true" />
      <span className="voice-orb-disc" aria-hidden="true" />
      <span className="voice-orb-radar" aria-hidden="true">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="voice-orb-sweep-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
              <stop offset="55%" stopColor="rgba(255,255,255,0.35)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
          <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6" />
          <circle cx="50" cy="50" r="18" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
          <g className="voice-orb-sweep">
            <path
              d="M50 50 L50 4 A46 46 0 0 1 96 50 Z"
              fill="url(#voice-orb-sweep-gradient)"
              opacity="0.85"
            />
          </g>
          <circle className="voice-orb-dot" cx="50" cy="50" r="5" fill="#ffffff" />
        </svg>
      </span>
    </>
  );

  if (as === "div") {
    return (
      <div
        className={`voice-orb ${className ?? ""}`.trim()}
        data-active={active}
        style={sizeStyle}
        aria-hidden="true"
      >
        {innards}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`voice-orb ${className ?? ""}`.trim()}
      data-active={active}
      aria-label={ariaLabel}
      style={sizeStyle}
    >
      {innards}
    </button>
  );
}
