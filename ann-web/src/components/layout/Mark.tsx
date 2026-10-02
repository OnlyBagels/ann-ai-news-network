// ANN's mark: a pixel-art anchor, drawn on the same grid as the live
// channel's sprites. app/icon.svg is the same drawing on an ink tile.
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <rect x="4" y="0" width="5" height="1" className="fill-brand"/>
      <rect x="2" y="1" width="9" height="1" className="fill-brand"/>
      <rect x="1" y="2" width="11" height="1" className="fill-brand"/>
      <rect x="1" y="3" width="2" height="1" className="fill-brand"/>
      <rect x="3" y="3" width="7" height="1" className="fill-paper"/>
      <rect x="10" y="3" width="2" height="1" className="fill-brand"/>
      <rect x="1" y="4" width="1" height="1" className="fill-brand"/>
      <rect x="2" y="4" width="9" height="1" className="fill-paper"/>
      <rect x="11" y="4" width="1" height="1" className="fill-brand"/>
      <rect x="1" y="5" width="1" height="1" className="fill-brand"/>
      <rect x="2" y="5" width="2" height="1" className="fill-paper"/>
      <rect x="4" y="5" width="2" height="1" className="fill-ink"/>
      <rect x="6" y="5" width="2" height="1" className="fill-paper"/>
      <rect x="8" y="5" width="2" height="1" className="fill-ink"/>
      <rect x="10" y="5" width="1" height="1" className="fill-paper"/>
      <rect x="11" y="5" width="1" height="1" className="fill-brand"/>
      <rect x="1" y="6" width="1" height="1" className="fill-brand"/>
      <rect x="2" y="6" width="9" height="1" className="fill-paper"/>
      <rect x="11" y="6" width="1" height="1" className="fill-brand"/>
      <rect x="1" y="7" width="1" height="1" className="fill-brand"/>
      <rect x="2" y="7" width="4" height="1" className="fill-paper"/>
      <rect x="6" y="7" width="2" height="1" className="fill-ink"/>
      <rect x="8" y="7" width="3" height="1" className="fill-paper"/>
      <rect x="11" y="7" width="1" height="1" className="fill-brand"/>
      <rect x="1" y="8" width="2" height="1" className="fill-brand"/>
      <rect x="3" y="8" width="7" height="1" className="fill-paper"/>
      <rect x="10" y="8" width="2" height="1" className="fill-brand"/>
      <rect x="1" y="9" width="2" height="1" className="fill-brand"/>
      <rect x="4" y="9" width="5" height="1" className="fill-paper"/>
      <rect x="10" y="9" width="2" height="1" className="fill-brand"/>
      <rect x="3" y="10" width="3" height="1" className="fill-rule-strong"/>
      <rect x="6" y="10" width="1" height="1" className="fill-paper"/>
      <rect x="7" y="10" width="3" height="1" className="fill-rule-strong"/>
      <rect x="1" y="11" width="5" height="1" className="fill-rule-strong"/>
      <rect x="6" y="11" width="1" height="1" className="fill-paper"/>
      <rect x="7" y="11" width="5" height="1" className="fill-rule-strong"/>
    </svg>
  );
}
