import { useState, useRef, type ReactNode } from 'react';

interface TooltipProps {
  text: string;
  children: ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const handleEnter = () => {
    timer.current = setTimeout(() => setShow(true), 200);
  };
  const handleLeave = () => {
    clearTimeout(timer.current);
    setShow(false);
  };

  return (
    <span className="relative inline-flex" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-3 py-1.5 text-[11px] leading-snug text-white bg-[#004567] rounded-lg shadow-lg max-w-[280px] whitespace-normal pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#004567]" />
        </span>
      )}
    </span>
  );
}
