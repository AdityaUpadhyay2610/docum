import { Keyboard, X } from 'lucide-react';
import { useEditorSettings } from '../../../context/EditorSettingsContext';

const SHORTCUTS = [
  { keys: ['Ctrl', 'B'], desc: 'Toggle bold formatting' },
  { keys: ['Ctrl', 'I'], desc: 'Toggle italic formatting' },
  { keys: ['Ctrl', 'U'], desc: 'Toggle underline formatting' },
  { keys: ['Ctrl', 'Z'], desc: 'Undo last change' },
  { keys: ['Ctrl', 'Y'], desc: 'Redo previously undone change' },
  { keys: ['Ctrl', 'S'], desc: 'Quick save document to cloud' },
  { keys: ['Ctrl', 'F'], desc: 'Open Find and Replace dialog' },
  { keys: ['Ctrl', 'P'], desc: 'Print document / Export PDF' },
  { keys: ['/'], desc: 'Open block insertion menu (slash command)' },
  { keys: ['Enter'], desc: 'Create new paragraph below active block' },
  { keys: ['Backspace'], desc: 'Remove empty block or merge with previous' },
];

export default function ShortcutsModal() {
  const { showShortcuts, setShowShortcuts } = useEditorSettings();

  if (!showShortcuts) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 p-5 w-full max-w-md">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
          <div className="flex items-center gap-2 font-bold text-neutral-900 text-sm">
            <Keyboard className="w-5 h-5 text-blue-600" />
            <span>Keyboard Shortcuts</span>
          </div>
          <button
            type="button"
            onClick={() => setShowShortcuts(false)}
            className="text-neutral-400 hover:text-neutral-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {SHORTCUTS.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-neutral-50 border border-transparent hover:border-neutral-100 text-xs"
            >
              <span className="text-neutral-600">{item.desc}</span>
              <div className="flex items-center gap-1">
                {item.keys.map((k, kIdx) => (
                  <kbd
                    key={kIdx}
                    className="px-1.5 py-0.5 text-[11px] font-semibold text-neutral-700 bg-neutral-100 border border-neutral-300 rounded shadow-2xs font-mono"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowShortcuts(false)}
          className="mt-5 w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Got It
        </button>
      </div>
    </div>
  );
}
