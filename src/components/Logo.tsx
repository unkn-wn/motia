import React from 'react';

interface LogoProps {
  className?: string;
  height?: number; // px
  title?: string;
}

const Logo: React.FC<LogoProps> = ({ className = '', height = 64, title = 'motia' }) => {
  const h = `${height}px`;
  return (
    <img src="/motia-light.svg" alt={title} title={title} style={{ height: h }} className={`block w-auto select-none ${className}`} />
  );
};

export default Logo;
