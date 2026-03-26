interface InfoBoxProps {
  children: React.ReactNode;
  variant?: 'info' | 'success' | 'warning';
}

export function InfoBox({ children, variant = 'info' }: InfoBoxProps) {
  const styles = {
    info: 'bg-[#FFF9EE] border-[#C98B27] text-[#004567]',
    success: 'bg-green-50 border-green-300 text-green-900',
    warning: 'bg-amber-50 border-amber-300 text-amber-900',
  };

  return (
    <div className={`border-l-4 rounded-lg px-4 py-3 text-sm leading-relaxed mb-4 ${styles[variant]}`}>
      {children}
    </div>
  );
}
