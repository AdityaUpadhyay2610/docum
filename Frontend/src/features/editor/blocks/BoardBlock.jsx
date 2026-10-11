import { useState } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight, X, LayoutGrid } from 'lucide-react';

const COLUMN_COLORS = [
  { id: 'amber', bg: 'bg-amber-500/10 text-amber-700 border-amber-200/80', dot: 'bg-amber-500' },
  { id: 'blue', bg: 'bg-blue-500/10 text-blue-700 border-blue-200/80', dot: 'bg-blue-500' },
  { id: 'emerald', bg: 'bg-emerald-500/10 text-emerald-700 border-emerald-200/80', dot: 'bg-emerald-500' },
  { id: 'purple', bg: 'bg-purple-500/10 text-purple-700 border-purple-200/80', dot: 'bg-purple-500' },
  { id: 'rose', bg: 'bg-rose-500/10 text-rose-700 border-rose-200/80', dot: 'bg-rose-500' },
];

export default function BoardBlock({ block, onChange }) {
  const [newCardText, setNewCardText] = useState({});
  const [addingCardColId, setAddingCardColId] = useState(null);

  const columns = block.columns || [
    {
      id: 'col-todo',
      title: 'To Do',
      color: 'amber',
      cards: [
        { id: 'card-1', title: 'Brainstorm feature ideas' },
        { id: 'card-2', title: 'Draft technical design' },
      ],
    },
    {
      id: 'col-progress',
      title: 'In Progress',
      color: 'blue',
      cards: [{ id: 'card-3', title: 'Build UI prototype' }],
    },
    {
      id: 'col-done',
      title: 'Done',
      color: 'emerald',
      cards: [{ id: 'card-4', title: 'Project setup & repository' }],
    },
  ];

  const updateColumns = (newCols) => {
    onChange({
      columns: newCols,
    });
  };

  const handleColumnTitleChange = (colId, newTitle) => {
    const nextCols = columns.map((col) =>
      col.id === colId ? { ...col, title: newTitle } : col
    );
    updateColumns(nextCols);
  };

  const handleAddColumn = () => {
    const colorIndex = columns.length % COLUMN_COLORS.length;
    const colorId = COLUMN_COLORS[colorIndex].id;
    const newCol = {
      id: crypto.randomUUID(),
      title: `Column ${columns.length + 1}`,
      color: colorId,
      cards: [],
    };
    updateColumns([...columns, newCol]);
  };

  const handleDeleteColumn = (colId) => {
    if (columns.length <= 1) return;
    updateColumns(columns.filter((c) => c.id !== colId));
  };

  const handleAddCard = (colId) => {
    const text = (newCardText[colId] || '').trim();
    if (!text) return;

    const nextCols = columns.map((col) => {
      if (col.id === colId) {
        return {
          ...col,
          cards: [...col.cards, { id: crypto.randomUUID(), title: text }],
        };
      }
      return col;
    });

    updateColumns(nextCols);
    setNewCardText((prev) => ({ ...prev, [colId]: '' }));
    setAddingCardColId(null);
  };

  const handleCardTitleChange = (colId, cardId, newTitle) => {
    const nextCols = columns.map((col) => {
      if (col.id === colId) {
        return {
          ...col,
          cards: col.cards.map((card) =>
            card.id === cardId ? { ...card, title: newTitle } : card
          ),
        };
      }
      return col;
    });
    updateColumns(nextCols);
  };

  const handleDeleteCard = (colId, cardId) => {
    const nextCols = columns.map((col) => {
      if (col.id === colId) {
        return {
          ...col,
          cards: col.cards.filter((card) => card.id !== cardId),
        };
      }
      return col;
    });
    updateColumns(nextCols);
  };

  const handleMoveCard = (fromColIndex, cardIndex, direction) => {
    const targetColIndex = fromColIndex + direction;
    if (targetColIndex < 0 || targetColIndex >= columns.length) return;

    const nextCols = columns.map((c) => ({ ...c, cards: [...c.cards] }));
    const [movedCard] = nextCols[fromColIndex].cards.splice(cardIndex, 1);
    nextCols[targetColIndex].cards.push(movedCard);

    updateColumns(nextCols);
  };

  const totalCards = columns.reduce((acc, col) => acc + (col.cards?.length || 0), 0);

  return (
    <div className="w-full my-3 bg-neutral-50/60 border border-neutral-200/90 rounded-xl shadow-xs overflow-hidden text-sm">
      {/* Board Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-neutral-200/70 select-none text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-neutral-800">
            <LayoutGrid className="w-3.5 h-3.5 text-neutral-500" />
            <span>Board View</span>
          </div>
          <span className="text-neutral-400">·</span>
          <span>{columns.length} {columns.length === 1 ? 'column' : 'columns'}</span>
          <span>·</span>
          <span>{totalCards} {totalCards === 1 ? 'card' : 'cards'}</span>
        </div>

        <button
          type="button"
          onClick={handleAddColumn}
          className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-md font-medium transition-colors shadow-2xs"
          title="Add new column"
        >
          <Plus className="w-3 h-3 text-neutral-500" />
          <span>Add Column</span>
        </button>
      </div>

      {/* Columns Scroll Area */}
      <div className="p-3 overflow-x-auto">
        <div className="flex items-start gap-3 min-w-max pb-1">
          {columns.map((col, colIndex) => {
            const colorDef =
              COLUMN_COLORS.find((c) => c.id === col.color) || COLUMN_COLORS[0];

            return (
              <div
                key={col.id}
                className="w-64 shrink-0 bg-neutral-100/70 border border-neutral-200/80 rounded-lg p-2 flex flex-col max-h-[520px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between gap-1 mb-2 px-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${colorDef.dot} shrink-0`} />
                    <input
                      id={`column-title-${col.id}`}
                      name={`column_${col.id}_title`}
                      aria-label="Column title"
                      type="text"
                      value={col.title}
                      onChange={(e) => handleColumnTitleChange(col.id, e.target.value)}
                      className="w-full text-xs font-semibold text-neutral-800 bg-transparent border-none focus:outline-none truncate"
                    />
                    <span className="text-[11px] font-mono text-neutral-400 bg-white/80 px-1.5 py-0.5 rounded-full border border-neutral-200/60 shrink-0">
                      {col.cards?.length || 0}
                    </span>
                  </div>

                  {columns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(col.id)}
                      className="text-neutral-400 hover:text-red-500 p-0.5 rounded hover:bg-neutral-200/60 transition-colors"
                      title="Delete column"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Column Cards Container */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 py-0.5">
                  {col.cards?.map((card, cardIndex) => (
                    <div
                      key={card.id}
                      className="group/card bg-white border border-neutral-200/90 rounded-md p-2.5 shadow-2xs hover:shadow-sm hover:border-neutral-300 transition-all text-xs"
                    >
                      {/* Card Content Input */}
                      <textarea
                        id={`card-title-${card.id}`}
                        name={`card_${card.id}_title`}
                        aria-label="Card title"
                        rows={1}
                        value={card.title}
                        onChange={(e) =>
                          handleCardTitleChange(col.id, card.id, e.target.value)
                        }
                        placeholder="Card title..."
                        className="w-full text-neutral-800 font-medium bg-transparent border-none focus:outline-none resize-none leading-snug"
                      />

                      {/* Card Controls Footer */}
                      <div className="mt-1.5 flex items-center justify-between pt-1 border-t border-neutral-100 opacity-60 group-hover/card:opacity-100 transition-opacity">
                        {/* Move Card Arrows */}
                        <div className="flex items-center gap-0.5 text-neutral-400">
                          <button
                            type="button"
                            disabled={colIndex === 0}
                            onClick={() => handleMoveCard(colIndex, cardIndex, -1)}
                            className="p-0.5 hover:text-neutral-700 hover:bg-neutral-100 rounded disabled:opacity-20 disabled:hover:bg-transparent"
                            title="Move to previous column"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={colIndex === columns.length - 1}
                            onClick={() => handleMoveCard(colIndex, cardIndex, 1)}
                            className="p-0.5 hover:text-neutral-700 hover:bg-neutral-100 rounded disabled:opacity-20 disabled:hover:bg-transparent"
                            title="Move to next column"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Delete Card */}
                        <button
                          type="button"
                          onClick={() => handleDeleteCard(col.id, card.id)}
                          className="p-0.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Delete card"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add New Card Inline Form */}
                  {addingCardColId === col.id ? (
                    <div className="bg-white border border-blue-300 rounded-md p-2 shadow-xs space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
                      <textarea
                        id={`new-card-input-${col.id}`}
                        name={`new_card_${col.id}`}
                        aria-label="New card title"
                        autoFocus
                        rows={2}
                        value={newCardText[col.id] || ''}
                        onChange={(e) =>
                          setNewCardText((prev) => ({
                            ...prev,
                            [col.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddCard(col.id);
                          } else if (e.key === 'Escape') {
                            setAddingCardColId(null);
                          }
                        }}
                        placeholder="Enter card title..."
                        className="w-full text-xs text-neutral-800 bg-transparent border-none focus:outline-none resize-none"
                      />
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setAddingCardColId(null)}
                          className="px-2 py-0.5 text-[11px] text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddCard(col.id)}
                          className="px-2.5 py-0.5 text-[11px] font-medium bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors shadow-2xs"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Add Card Button */}
                {addingCardColId !== col.id && (
                  <button
                    type="button"
                    onClick={() => setAddingCardColId(col.id)}
                    className="mt-2 w-full py-1.5 px-2 text-xs text-neutral-500 hover:text-neutral-800 hover:bg-white rounded-md flex items-center gap-1.5 transition-colors font-medium border border-dashed border-neutral-300/70 hover:border-neutral-300"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add card</span>
                  </button>
                )}
              </div>
            );
          })}

          {/* Quick Add Column Button at the end of columns */}
          <button
            type="button"
            onClick={handleAddColumn}
            className="w-48 shrink-0 h-28 border border-dashed border-neutral-300 hover:border-neutral-400 hover:bg-white rounded-lg flex flex-col items-center justify-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="font-medium">New Column</span>
          </button>
        </div>
      </div>
    </div>
  );
}
