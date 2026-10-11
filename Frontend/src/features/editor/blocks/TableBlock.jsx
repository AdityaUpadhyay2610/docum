import { Plus, Trash2, X } from 'lucide-react';

export default function TableBlock({ block, onChange }) {
  const headers = block.headers || ['Name', 'Tag', 'Notes'];
  const rows = block.rows || [
    ['First entry', 'Active', 'Sample note'],
    ['Second entry', 'Pending', 'In review'],
  ];

  const updateTable = (newHeaders, newRows) => {
    onChange({
      headers: newHeaders,
      rows: newRows,
    });
  };

  const handleHeaderChange = (colIndex, value) => {
    const nextHeaders = [...headers];
    nextHeaders[colIndex] = value;
    updateTable(nextHeaders, rows);
  };

  const handleCellChange = (rowIndex, colIndex, value) => {
    const nextRows = rows.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row;
      const nextRow = [...row];
      nextRow[colIndex] = value;
      return nextRow;
    });
    updateTable(headers, nextRows);
  };

  const addColumn = () => {
    const colName = `Column ${headers.length + 1}`;
    const nextHeaders = [...headers, colName];
    const nextRows = rows.map((row) => [...row, '']);
    updateTable(nextHeaders, nextRows);
  };

  const deleteColumn = (colIndex) => {
    if (headers.length <= 1) return;
    const nextHeaders = headers.filter((_, idx) => idx !== colIndex);
    const nextRows = rows.map((row) => row.filter((_, idx) => idx !== colIndex));
    updateTable(nextHeaders, nextRows);
  };

  const addRow = () => {
    const newRow = new Array(headers.length).fill('');
    const nextRows = [...rows, newRow];
    updateTable(headers, nextRows);
  };

  const deleteRow = (rowIndex) => {
    if (rows.length <= 1) {
      updateTable(headers, [new Array(headers.length).fill('')]);
      return;
    }
    const nextRows = rows.filter((_, idx) => idx !== rowIndex);
    updateTable(headers, nextRows);
  };

  return (
    <div className="w-full my-3 bg-white border border-neutral-200/90 rounded-xl shadow-xs overflow-hidden text-sm">
      {/* Table Top Bar / Controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-50/80 border-b border-neutral-200/70 select-none text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-700">Table</span>
          <span className="text-neutral-400">·</span>
          <span>{rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
          <span>×</span>
          <span>{headers.length} {headers.length === 1 ? 'column' : 'columns'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={addColumn}
            className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-md font-medium transition-colors shadow-2xs"
            title="Add column to table"
          >
            <Plus className="w-3 h-3 text-neutral-500" />
            <span>Add Column</span>
          </button>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-md font-medium transition-colors shadow-2xs"
            title="Add row to table"
          >
            <Plus className="w-3 h-3 text-neutral-500" />
            <span>Add Row</span>
          </button>
        </div>
      </div>

      {/* Table Scrollable Container */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          {/* Table Headers */}
          <thead>
            <tr className="bg-neutral-50/60 border-b border-neutral-200/90">
              <th className="w-10 px-2 py-2 text-center text-neutral-400 text-xs font-mono font-normal border-r border-neutral-200/60 select-none">
                #
              </th>
              {headers.map((header, colIndex) => (
                <th
                  key={colIndex}
                  className="group/th relative min-w-[140px] px-3 py-2 border-r border-neutral-200/60 last:border-r-0 font-semibold text-neutral-700 text-xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <input
                      id={`table-${block?.id || 'main'}-th-${colIndex}`}
                      name={`table_header_${colIndex}`}
                      aria-label={`Table column ${colIndex + 1} header`}
                      type="text"
                      value={header}
                      placeholder={`Column ${colIndex + 1}`}
                      onChange={(e) => handleHeaderChange(colIndex, e.target.value)}
                      className="w-full font-semibold text-neutral-700 bg-transparent border-none focus:outline-none placeholder-neutral-400"
                    />
                    {headers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteColumn(colIndex)}
                        className="opacity-0 group-hover/th:opacity-100 p-0.5 text-neutral-400 hover:text-red-500 hover:bg-neutral-200/70 rounded transition-opacity"
                        title="Delete column"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="group/tr hover:bg-neutral-50/70 transition-colors"
              >
                {/* Row Number & Delete Button on hover */}
                <td className="w-10 px-2 py-2 text-center text-neutral-400 text-xs font-mono border-r border-neutral-200/60 select-none">
                  <div className="relative flex items-center justify-center">
                    <span className="group-hover/tr:hidden">{rowIndex + 1}</span>
                    <button
                      type="button"
                      onClick={() => deleteRow(rowIndex)}
                      className="hidden group-hover/tr:flex items-center justify-center text-neutral-400 hover:text-red-500 p-0.5 rounded transition-colors"
                      title="Delete row"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </td>

                {/* Row Cells */}
                {headers.map((_, colIndex) => (
                  <td
                    key={colIndex}
                    className="min-w-[140px] px-3 py-1.5 border-r border-neutral-200/60 last:border-r-0"
                  >
                    <input
                      id={`table-${block?.id || 'main'}-cell-${rowIndex}-${colIndex}`}
                      name={`table_cell_${rowIndex}_${colIndex}`}
                      aria-label={`Row ${rowIndex + 1}, Column ${colIndex + 1} content`}
                      type="text"
                      value={row[colIndex] || ''}
                      placeholder="Empty"
                      onChange={(e) =>
                        handleCellChange(rowIndex, colIndex, e.target.value)
                      }
                      className="w-full text-neutral-800 bg-transparent border-none focus:outline-none placeholder-neutral-300 py-1"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick Add Row Footer Button */}
      <button
        type="button"
        onClick={addRow}
        className="w-full py-1.5 px-3 text-xs text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 flex items-center gap-1.5 border-t border-neutral-100 transition-colors select-none font-medium"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>New Row</span>
      </button>
    </div>
  );
}
