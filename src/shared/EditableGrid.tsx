import { useState, useRef, useCallback, useEffect, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';

interface Column {
  key: string;
  label: string;
}

interface Row {
  key: string;
  label: string;
  title?: string;
}

interface EditableGridProps {
  columns: Column[];
  rows: Row[];
  data: Record<string, Record<string, number>>;
  onChange: (rowKey: string, colKey: string, value: number) => void;
  validation?: {
    type: 'sum-to-100' | 'range';
    min?: number;
    max?: number;
  };
  suffix?: string;
  readOnly?: boolean;
  formatValue?: (v: number) => string;
  step?: number;
  decimalPlaces?: number;
}

interface CellPos {
  row: number;
  col: number;
}

export function EditableGrid({
  columns,
  rows,
  data,
  onChange,
  validation,
  suffix = '',
  readOnly = false,
  formatValue,
  step = 0.5,
  decimalPlaces = 1,
}: EditableGridProps) {
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowKey: string; colKey: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const getCellValue = (rowKey: string, colKey: string): number => {
    return data[rowKey]?.[colKey] ?? 0;
  };

  const formatCell = (v: number): string => {
    if (formatValue) return formatValue(v);
    return v.toFixed(decimalPlaces);
  };

  const clampValue = (v: number): number => {
    if (validation?.type === 'range') {
      if (validation.min !== undefined) v = Math.max(validation.min, v);
      if (validation.max !== undefined) v = Math.min(validation.max, v);
    }
    return v;
  };

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const rowKey = rows[editingCell.row].key;
    const colKey = columns[editingCell.col].key;
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      const rounded = Math.round(clampValue(parsed) * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
      onChange(rowKey, colKey, rounded);
    }
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, rows, columns, onChange, decimalPlaces, validation]);

  const startEdit = (row: number, col: number) => {
    if (readOnly) return;
    const v = getCellValue(rows[row].key, columns[col].key);
    setEditingCell({ row, col });
    setEditValue(v.toFixed(decimalPlaces));
  };

  const moveTo = useCallback((row: number, col: number) => {
    const r = Math.max(0, Math.min(rows.length - 1, row));
    const c = Math.max(0, Math.min(columns.length - 1, col));
    startEdit(r, c);
  }, [rows.length, columns.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
      return;
    }
    if (e.key === 'Enter') {
      commitEdit();
      if (editingCell && editingCell.row < rows.length - 1) {
        setTimeout(() => moveTo(editingCell.row + 1, editingCell.col), 0);
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      if (editingCell) {
        const nextCol = e.shiftKey ? editingCell.col - 1 : editingCell.col + 1;
        if (nextCol >= 0 && nextCol < columns.length) {
          setTimeout(() => moveTo(editingCell.row, nextCol), 0);
        } else if (!e.shiftKey && editingCell.row < rows.length - 1) {
          setTimeout(() => moveTo(editingCell.row + 1, 0), 0);
        } else if (e.shiftKey && editingCell.row > 0) {
          setTimeout(() => moveTo(editingCell.row - 1, columns.length - 1), 0);
        }
      }
      return;
    }
    if (e.key === 'ArrowUp' && editingCell && editingCell.row > 0) {
      e.preventDefault();
      commitEdit();
      setTimeout(() => moveTo(editingCell.row - 1, editingCell.col), 0);
    }
    if (e.key === 'ArrowDown' && editingCell && editingCell.row < rows.length - 1) {
      e.preventDefault();
      commitEdit();
      setTimeout(() => moveTo(editingCell.row + 1, editingCell.col), 0);
    }
  }, [editingCell, commitEdit, moveTo, rows.length, columns.length]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    if (!editingCell) return;
    const text = e.clipboardData.getData('text');
    if (!text) return;

    // Parse pasted data: rows split by newline, cells by tab
    const pastedRows = text.trim().split(/\r?\n/).map(line => line.split('\t'));
    if (pastedRows.length === 1 && pastedRows[0].length === 1) {
      // Single value — let default input handling work
      return;
    }

    e.preventDefault();
    for (let ri = 0; ri < pastedRows.length; ri++) {
      const targetRow = editingCell.row + ri;
      if (targetRow >= rows.length) break;
      for (let ci = 0; ci < pastedRows[ri].length; ci++) {
        const targetCol = editingCell.col + ci;
        if (targetCol >= columns.length) break;
        const cleaned = pastedRows[ri][ci].trim().replace(/[,$%]/g, '');
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed)) {
          const rounded = Math.round(clampValue(parsed) * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
          onChange(rows[targetRow].key, columns[targetCol].key, rounded);
        }
      }
    }
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, rows, columns, onChange, decimalPlaces, validation]);

  const handleContextMenu = (e: MouseEvent, rowKey: string, colKey: string) => {
    if (readOnly) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, rowKey, colKey });
  };

  const fillRight = () => {
    if (!contextMenu) return;
    const value = getCellValue(contextMenu.rowKey, contextMenu.colKey);
    for (const col of columns) {
      if (col.key !== contextMenu.colKey) {
        const rounded = Math.round(clampValue(value) * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
        onChange(contextMenu.rowKey, col.key, rounded);
      }
    }
    setContextMenu(null);
  };

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Column sums for validation
  const colSums = validation?.type === 'sum-to-100'
    ? columns.map(col => rows.reduce((sum, row) => sum + getCellValue(row.key, col.key), 0))
    : null;

  const isCellInvalid = (rowKey: string, colKey: string): boolean => {
    if (!validation || validation.type !== 'range') return false;
    const v = getCellValue(rowKey, colKey);
    if (validation.min !== undefined && v < validation.min) return true;
    if (validation.max !== undefined && v > validation.max) return true;
    return false;
  };

  return (
    <div className="relative">
      <div ref={tableRef} className="overflow-auto rounded-lg border border-[#EAECEC] max-h-[600px]">
        <table className="w-full border-collapse text-sm">
          {/* Header */}
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 bg-[#004567] text-white text-xs font-mono font-semibold px-4 py-2.5 text-left min-w-[180px] border-r border-[#005580]">
                &nbsp;
              </th>
              {columns.map(col => (
                <th
                  key={col.key}
                  className="bg-[#004567] text-white text-xs font-mono font-semibold px-3 py-2.5 text-center min-w-[90px] border-r border-[#005580] last:border-r-0"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.key} className={ri % 2 === 0 ? 'bg-white' : 'bg-[#EAECEC]/40'}>
                {/* Sticky row label */}
                <td className="sticky left-0 z-10 bg-[#F7F9FC] font-semibold text-[#004567] text-xs px-4 py-2 border-r border-[#EAECEC] whitespace-nowrap cursor-help"
                  title={row.title}>
                  {row.label}
                </td>
                {columns.map((col, ci) => {
                  const isEditing = editingCell?.row === ri && editingCell?.col === ci;
                  const value = getCellValue(row.key, col.key);
                  const invalid = isCellInvalid(row.key, col.key);

                  return (
                    <td
                      key={col.key}
                      className={`relative px-1 py-0.5 text-center border-r border-b border-[#EAECEC] last:border-r-0 cursor-text
                        ${invalid ? 'bg-amber-50 border-amber-300' : ''}
                      `}
                      onClick={() => !isEditing && startEdit(ri, ci)}
                      onContextMenu={(e) => handleContextMenu(e, row.key, col.key)}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={commitEdit}
                          onPaste={handlePaste}
                          className="w-full px-1.5 py-1 text-center text-sm font-mono font-semibold text-[#004567] bg-white outline-none ring-2 ring-[#C98B27] rounded-sm"
                        />
                      ) : (
                        <div className="px-1.5 py-1 text-sm font-mono text-[#44546A] select-none">
                          {formatCell(value)}{suffix && <span className="text-[#9296B2] ml-0.5 text-xs">{suffix}</span>}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>

          {/* Validation footer */}
          {colSums && (
            <tfoot className="sticky bottom-0 z-20">
              <tr>
                <td className="sticky left-0 z-30 bg-gray-50 font-mono font-bold text-xs text-[#004567] px-4 py-2 border-r border-t border-[#EAECEC]">
                  Σ Total
                </td>
                {colSums.map((sum, ci) => {
                  const ok = Math.abs(sum - 100) < 0.6;
                  return (
                    <td
                      key={columns[ci].key}
                      className={`bg-gray-50 font-mono font-bold text-xs text-center px-3 py-2 border-r border-t border-[#EAECEC] last:border-r-0
                        ${ok ? 'text-green-600' : 'text-red-500'}`}
                    >
                      {sum.toFixed(1)}%
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-[#EAECEC] py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={fillRight}
            className="w-full text-left px-4 py-2 text-sm text-[#004567] hover:bg-[#FFF9EE] hover:text-[#C98B27] transition-colors"
          >
            Copy to all years →
          </button>
        </div>
      )}
    </div>
  );
}
