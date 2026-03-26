interface SectionHeaderProps {
  children: React.ReactNode;
}

export function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <div className="bg-[#004567] text-white rounded-lg px-4 py-2.5 my-3 font-bold text-sm shadow-md border-l-4 border-[#C98B27]">
      {children}
    </div>
  );
}
