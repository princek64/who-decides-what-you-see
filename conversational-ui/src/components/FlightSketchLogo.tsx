import React from 'react';

interface FlightSketchLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: number;
}

export const FlightSketchLogo: React.FC<FlightSketchLogoProps> = ({ size = 24, className, ...props }) => {
  return (
    <img
      src="/plane_11098695.png"
      alt="Flight Logo"
      width={size}
      height={size}
      className={className}
      // The artwork is black line-art on transparent, invisible on the dark
      // Geist canvas — invert() renders it white so the original logo shows.
      style={{ objectFit: 'contain', filter: 'invert(1)', ...props.style }}
      {...props}
    />
  );
};
