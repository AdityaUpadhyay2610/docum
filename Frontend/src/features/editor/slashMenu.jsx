import { useState, useEffect, useRef } from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  CheckSquare,
  List,
  ListOrdered,
  Code,
  Minus,
  Type,
  Table,
  LayoutGrid,
  FileDown,
  Quote,
  AlertCircle,
  Scissors,
} from 'lucide-react';

const MENU_ITEMS = [
  { id: 'paragraph', label: 'Text', sub: 'Just start writing with plain text.', icon: Type },
  { id: 'h1', label: 'Heading 1', sub: 'Large section heading.', icon: Heading1 },
  { id: 'h2', label: 'Heading 2', sub: 'Medium section heading.', icon: Heading2 },
  { id: 'h3', label: 'Heading 3', sub: 'Small section heading.', icon: Heading3 },
  { id: 'callout', label: 'Callout Note', sub: 'Highlighted info or tip box.', icon: AlertCircle },
  { id: 'quote', label: 'Blockquote', sub: 'Capture an indented quote.', icon: Quote },
  { id: 'table', label: 'Table', sub: 'Insert an editable data table.', icon: Table },
  { id: 'board', label: 'Board view', sub: 'Organize tasks in Kanban cards & columns.', icon: LayoutGrid },
  { id: 'todo', label: 'To-do list', sub: 'Track tasks with a checkbox.', icon: CheckSquare },
  { id: 'bullet', label: 'Bulleted list', sub: 'Create a simple bulleted list.', icon: List },
  { id: 'numbered', label: 'Numbered list', sub: 'Create an ordered numbered list.', icon: ListOrdered },
  { id: 'code', label: 'Code snippet', sub: 'Capture code with syntax styling.', icon: Code },
  { id: 'divider', label: 'Divider', sub: 'Visually separate sections.', icon: Minus },
  { id: 'page-break', label: 'Page Break', sub: 'Split content into a new page / sheet.', icon: Scissors },
  { id: 'export-docx', label: 'Save / Export DOCX', sub: 'Save document to device as Word (.docx).', icon: FileDown },
];

export default function SlashMenu({ query = '', position = { top: 0, left: 0 }, onSelect, onClose }) {
  const cleanQuery = (query || '').toLowerCase().trim();
  const [prevQuery, setPrevQuery] = useState(cleanQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef(null);

  if (prevQuery !== cleanQuery) {
    setPrevQuery(cleanQuery);
    setSelectedIndex(0);
  }

  const filteredItems = MENU_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(cleanQuery) ||
      item.id.toLowerCase().includes(cleanQuery) ||
      item.sub.toLowerCase().includes(cleanQuery)
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (filteredItems.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          onSelect(filteredItems[selectedIndex].id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, selectedIndex, onSelect, onClose]);

  if (filteredItems.length === 0) return null;

  const viewportWidth = window.innerWidth || 1000;
  const viewportHeight = window.innerHeight || 800;
  const menuWidth = 280;
  const menuHeight = Math.min(filteredItems.length * 52 + 40, 320);

  let adjustedLeft = position.left;
  if (adjustedLeft + menuWidth > viewportWidth - 20) {
    adjustedLeft = Math.max(20, viewportWidth - menuWidth - 20);
  }

  let adjustedTop = position.top;
  if (adjustedTop + menuHeight > viewportHeight - 20) {
    adjustedTop = Math.max(20, position.top - menuHeight - 30);
  }

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedTop}px`, left: `${adjustedLeft}px` }}
      className="fixed z-50 w-72 bg-white rounded-xl shadow-2xl border border-neutral-200/90 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
    >
      <div className="px-3 py-1 text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
        Insert Word Block
      </div>

      <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
        <div className="py-1">
          {filteredItems.map((item, index) => {
            const Icon = item.icon;
            const isSelected = index === selectedIndex;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => onSelect(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-all rounded-md mx-1 my-0.5 cursor-pointer ${
                  isSelected
                    ? 'bg-neutral-100 text-neutral-900 font-medium'
                    : 'text-neutral-700 hover:bg-neutral-50'
                }`}
                style={{ width: 'calc(100% - 8px)' }}
              >
                <div
                  className={`p-1.5 rounded-lg border shrink-0 transition-colors ${
                    isSelected
                      ? 'border-neutral-300 bg-white text-neutral-900 shadow-sm'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-500'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="truncate flex-1">
                  <div className="font-medium text-xs text-neutral-800 leading-tight">
                    {item.label}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate">{item.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}