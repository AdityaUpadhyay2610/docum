import { useState, useMemo } from 'react';
import { Search, Replace, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useEditorSettings } from '../../../context/EditorSettingsContext';

export default function FindReplaceModal({ blocks = [], onUpdateBlocks, onHighlightBlock }) {
  const { showFindReplace, setShowFindReplace } = useEditorSettings();
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [matchCase, setMatchCase] = useState(false);

  // Calculate matches across blocks
  const matches = useMemo(() => {
    if (!findQuery || !findQuery.trim()) return [];
    const found = [];
    blocks.forEach((block, bIdx) => {
      if (!block.text) return;
      const text = matchCase ? block.text : block.text.toLowerCase();
      const query = matchCase ? findQuery : findQuery.toLowerCase();
      let index = text.indexOf(query);
      while (index !== -1) {
        found.push({ blockId: block.id, bIdx, charIndex: index });
        index = text.indexOf(query, index + query.length);
      }
    });
    return found;
  }, [blocks, findQuery, matchCase]);

  if (!showFindReplace) return null;

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const next = (activeMatchIndex + 1) % matches.length;
    setActiveMatchIndex(next);
    const match = matches[next];
    if (match) onHighlightBlock?.(match.blockId);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prev = (activeMatchIndex - 1 + matches.length) % matches.length;
    setActiveMatchIndex(prev);
    const match = matches[prev];
    if (match) onHighlightBlock?.(match.blockId);
  };

  const handleReplaceCurrent = () => {
    if (matches.length === 0 || !findQuery) return;
    const currentMatch = matches[activeMatchIndex] || matches[0];
    if (!currentMatch) return;

    const targetBlock = blocks.find((b) => b.id === currentMatch.blockId);
    if (!targetBlock || !targetBlock.text) return;

    // Replace first occurrence in that block
    const regex = new RegExp(
      findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      matchCase ? '' : 'i'
    );
    const newText = targetBlock.text.replace(regex, replaceQuery);

    const updated = blocks.map((b) =>
      b.id === currentMatch.blockId ? { ...b, text: newText } : b
    );
    onUpdateBlocks(updated);
  };

  const handleReplaceAll = () => {
    if (!findQuery || matches.length === 0) return;
    const regex = new RegExp(
      findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      matchCase ? 'g' : 'gi'
    );
    const updated = blocks.map((b) => {
      if (b.text) {
        return { ...b, text: b.text.replace(regex, replaceQuery) };
      }
      return b;
    });
    onUpdateBlocks(updated);
  };

  return (
    <div className="fixed top-28 right-6 z-40 bg-white rounded-xl shadow-2xl border border-neutral-300 p-3.5 w-80 animate-in fade-in zoom-in-95 duration-150 select-none">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-100 mb-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
          <Search className="w-3.5 h-3.5 text-blue-600" />
          <span>Find and Replace</span>
        </div>
        <button
          type="button"
          onClick={() => setShowFindReplace(false)}
          className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Find input */}
      <div className="space-y-2 text-xs">
        <div className="relative flex items-center">
          <input
            id="find-in-document-input"
            name="find_query"
            aria-label="Find in document"
            type="text"
            placeholder="Find in document..."
            value={findQuery}
            autoFocus
            onChange={(e) => {
              setFindQuery(e.target.value);
              setActiveMatchIndex(0);
            }}
            className="w-full pl-7 pr-16 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
          />
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2 pointer-events-none" />
          <span className="absolute right-2 text-[10px] text-neutral-400 font-mono">
            {matches.length > 0 ? `${activeMatchIndex + 1} of ${matches.length}` : '0 results'}
          </span>
        </div>

        {/* Replace input */}
        <div className="relative flex items-center">
          <input
            id="replace-in-document-input"
            name="replace_query"
            aria-label="Replace with"
            type="text"
            placeholder="Replace with..."
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
          />
          <Replace className="w-3.5 h-3.5 text-neutral-400 absolute left-2 pointer-events-none" />
        </div>

        {/* Case match checkbox */}
        <div className="flex items-center gap-2 pt-0.5">
          <label htmlFor="find-match-case-checkbox" className="flex items-center gap-1.5 text-[11px] text-neutral-600 cursor-pointer">
            <input
              id="find-match-case-checkbox"
              name="match_case"
              aria-label="Match case"
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              className="rounded accent-blue-600"
            />
            <span>Match case</span>
          </label>
        </div>

        {/* Navigation & Action buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMatch}
              disabled={matches.length === 0}
              className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30 transition-colors"
              title="Previous Match"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMatch}
              disabled={matches.length === 0}
              className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30 transition-colors"
              title="Next Match"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleReplaceCurrent}
              disabled={matches.length === 0}
              className="px-2 py-1 rounded text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-800 disabled:opacity-40 font-medium transition-colors"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
              className="px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 font-medium transition-colors"
            >
              Replace All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
