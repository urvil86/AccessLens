import { useCallback, useState, useEffect } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  suffix?: string;
}

export function NumberInput({
  value, onChange, min = 0, max = 1e8, step = 1, className = '', suffix = '',
}: NumberInputProps) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = useCallback(() => {
    const n = parseFloat(local);
    if (!isNaN(n)) {
      const clamped = Math.max(min, Math.min(max, n));
      onChange(clamped);
      setLocal(String(clamped));
    } else {
      setLocal(String(value));
    }
  }, [local, min, max, onChange, value]);

  return (
    <div className="relative">
      <input
        type="number"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        min={min}
        max={max}
        step={step}
        className={`w-full px-2 py-1.5 text-sm font-semibold text-center border border-[#EAECEC]
          rounded-md bg-white text-[#004567] focus:border-[#C98B27] focus:ring-1 focus:ring-[#C98B27]
          outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
          [&::-webkit-inner-spin-button]:appearance-none ${className}`}
        onPaste={e => {
          const text = e.clipboardData.getData('text').trim().replace(/[,$%]/g, '');
          const n = parseFloat(text);
          if (!isNaN(n)) {
            e.preventDefault();
            const clamped = Math.max(min, Math.min(max, n));
            setLocal(String(clamped));
            onChange(clamped);
          }
        }}
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#9296B2] pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
