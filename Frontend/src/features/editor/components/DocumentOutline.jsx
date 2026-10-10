import { ListTree, X, FileText, ChevronRight } from 'lucide-react';
import { useEditorSettings } from '../../../context/EditorSettingsContext';
import { useWordStats } from '../hooks/useWordStats';

export default function DocumentOutline({ title = '', blocks = [], onSelectBlock }) {
  const { showOutline, setShowOutline } = useEditorSettings();
  const { headings } = useWordStats(title, blocks);

  if (!showOutline) return null;

  return (
    <aside className="w-64 bg-[#faf9f8] border-r border-neutral-200 flex flex-col h-full shrink-0 select-none animate-in slide-in-from-left duration-200 z-10">
      {/* Header */}
      <div className="p-3 border-b border-neutral-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2 text-xs font-bold text-neutral-800">
          <ListTree className="w-4 h-4 text-blue-600" />
          <span>Navigation Outline</span>
        </div>
        <button
          type="button"
          onClick={() => setShowOutline(false)}
          className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
          title="Close Navigation Outline"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Headings List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {headings.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-400">
            <FileText className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
            <p>No headings in this document yet.</p>
            <p className="text-[10px] text-neutral-400 mt-1">
              Add Heading 1, 2, or 3 from the Home ribbon tab to see outline.
            </p>
          </div>
        ) : (
          headings.map((heading) => {
            const indentClass =
              heading.level === 1 ? 'pl-2 font-semibold text-neutral-900' :
              heading.level === 2 ? 'pl-5 text-neutral-700' :
              'pl-8 text-neutral-500 text-[11px]';

            return (
              <button
                key={heading.id}
                type="button"
                onClick={() => onSelectBlock?.(heading.id)}
                className={`w-full text-left py-1.5 pr-2 rounded text-xs hover:bg-white hover:shadow-2xs transition-all flex items-center gap-1.5 group cursor-pointer ${indentClass}`}
              >
                <ChevronRight className="w-3 h-3 text-neutral-400 group-hover:text-blue-500 shrink-0" />
                <span className="truncate">{heading.text || 'Untitled Heading'}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-neutral-200 bg-white text-[10px] text-neutral-400 text-center">
        {headings.length} {headings.length === 1 ? 'heading' : 'headings'} found
      </div>
    </aside>
  );
}
