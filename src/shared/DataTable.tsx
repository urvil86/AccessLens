interface DataTableProps {
  headers: string[];
  rows: string[][];
  highlightFirstCol?: boolean;
}

export function DataTable({ headers, rows, highlightFirstCol = true }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#EAECEC]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#004567] text-white">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-xs whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-[#EAECEC]'}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-1.5 whitespace-nowrap font-mono text-xs
                    ${ci === 0 && highlightFirstCol ? 'font-semibold text-[#004567]' : 'text-[#44546A]'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
