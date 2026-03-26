import { useState, type ReactNode } from 'react';

interface AccordionProps {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Accordion({ title, summary, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-xl border border-[#EAECEC] mb-4 overflow-hidden transition-all ${open ? 'border-l-4 border-l-[#C98B27]' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-[#EAECEC]/30 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[#004567]">{title}</div>
          {summary && <div className="text-xs text-[#9296B2] mt-0.5 truncate">{summary}</div>}
        </div>
        <svg
          className={`w-5 h-5 text-[#9296B2] shrink-0 ml-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${open ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-5 pb-5 pt-2">
          {children}
        </div>
      </div>
    </div>
  );
}
