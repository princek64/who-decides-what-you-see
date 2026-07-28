import React from 'react';

interface FlightSketchLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number;
}

// The source art (plane_11098695.png) is black line-art on a transparent
// background, so it vanishes on the dark canvas. Rendering it as a CSS mask
// tinted with `currentColor` lets it inherit whatever text-* token the caller
// sets (e.g. text-foreground) instead of being locked to black.
export const FlightSketchLogo: React.FC<FlightSketchLogoProps> = ({ size = 24, className, style, ...props }) => {
  return (
    <span
      role="img"
      aria-label="Flight Logo"
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundColor: 'currentColor',
        WebkitMaskImage: 'url(/plane_11098695.png)',
        maskImage: 'url(/plane_11098695.png)',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        ...style,
      }}
      {...props}
    />
  );
};
