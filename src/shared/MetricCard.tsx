interface MetricCardProps {
  label: string;
  value: string;
  className?: string;
  delta?: { value: string; positive: boolean };
}

export function MetricCard({ label, value, className = '', delta }: MetricCardProps) {
  return (
    <div className={`bg-white border border-[#EAECEC] rounded-xl p-4 text-center ${className}`}>
      <div className="text-xs text-[#44546A] uppercase tracking-wide mb-1 font-medium">{label}</div>
      <div className="text-lg font-bold text-[#004567] font-mono">{value}</div>
      {delta && (
        <div className={`text-[10px] font-mono mt-1 flex items-center justify-center gap-1 ${delta.positive ? 'text-green-600' : 'text-red-500'}`}>
          <span>{delta.positive ? '▲' : '▼'}</span>
          <span>{delta.value}</span>
        </div>
      )}
    </div>
  );
}
