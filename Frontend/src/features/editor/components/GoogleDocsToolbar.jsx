import { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  Search,
  RotateCcw,
  RotateCw,
  Printer,
  CheckCheck,
  Paintbrush,
  ChevronDown,
  Bold,
  Italic,
  Underline,
  Highlighter,
  Table,
  Columns,
  Code,
  FileDown,
  Save,
  FilePlus,
  Share2,
  Check,
  Sparkles,
  Loader2,
  CheckCircle2,
  SlidersHorizontal,
  FileText,
  Info,
  Keyboard,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ListTodo,
  List,
  ListOrdered,
  RemoveFormatting,
} from 'lucide-react';
import {
  useEditorSettings,
} from '../../../context/EditorSettingsContext';

const FONT_FAMILIES = [
  { id: 'Arial, sans-serif', label: 'Arial' },
  { id: 'Calibri, sans-serif', label: 'Calibri' },
  { id: 'Aptos, sans-serif', label: 'Aptos' },
  { id: 'Inter, sans-serif', label: 'Inter' },
  { id: 'Roboto, sans-serif', label: 'Roboto' },
  { id: 'Georgia, serif', label: 'Georgia' },
  { id: '"Times New Roman", serif', label: 'Times New Roman' },
  { id: '"Courier New", monospace', label: 'Courier New' },
  { id: '"Playfair Display", serif', label: 'Playfair Display' },
  { id: '"Caveat", cursive', label: 'Caveat (Handwritten)' },
];

const STYLES = [
  { id: 'paragraph', label: 'Normal text', previewClass: 'text-sm text-neutral-800' },
  { id: 'h1', label: 'Heading 1', previewClass: 'text-xl font-bold text-neutral-900' },
  { id: 'h2', label: 'Heading 2', previewClass: 'text-lg font-semibold text-neutral-800' },
  { id: 'h3', label: 'Heading 3', previewClass: 'text-base font-medium text-neutral-800' },
  { id: 'quote', label: 'Quote', previewClass: 'text-sm italic text-neutral-600 border-l-2 border-blue-400 pl-2' },
  { id: 'callout', label: 'Callout Box', previewClass: 'text-sm font-medium text-blue-800 bg-blue-50 px-2 py-0.5 rounded' },
  { id: 'code', label: 'Code Snippet', previewClass: 'text-xs font-mono text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded' },
];

const ZOOM_OPTIONS = [50, 75, 90, 100, 125, 150, 200];

const TEXT_COLORS = [
  { name: 'Default Black', value: '#111827' },
  { name: 'Dark Gray', value: '#4b5563' },
  { name: 'Slate Blue', value: '#0f4c81' },
  { name: 'Sky Blue', value: '#0284c7' },
  { name: 'Emerald Green', value: '#059669' },
  { name: 'Amber Orange', value: '#d97706' },
  { name: 'Ruby Red', value: '#dc2626' },
  { name: 'Purple', value: '#7c3aed' },
];

const HIGHLIGHT_COLORS = [
  { name: 'None', value: 'transparent' },
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Cyan', value: '#a5f3fc' },
  { name: 'Pink', value: '#fbcfe8' },
  { name: 'Orange', value: '#fed7aa' },
  { name: 'Purple', value: '#e9d5ff' },
];

export default function GoogleDocsToolbar({
  activeDoc,
  onToggleSidebar,
  saveStatus = 'saved',
  isGuest = false,
  activeBlock,
  onTitleChange,
  onFormatChange,
  onTransformBlockType,
  onInsertBlock,
  onInsertTableGrid,
  onCleanEmptyBlocks,
  onSaveImmediate,
  onDownloadDocx,
  onGuestSavePrompt,
  onCreateDoc,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onShare,
  onPrint,
  wordCount = 0,
}) {
  const {
    zoomLevel,
    setZoomLevel,
    showRuler,
    setShowRuler,
    showOutline,
    setShowOutline,
    setShowFindReplace,
    setShowShortcuts,
    copiedFormat,
    setCopiedFormat,
  } = useEditorSettings();

  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [spellCheckToast, setSpellCheckToast] = useState(false);

  const toolbarRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = (name) => {
    setActiveDropdown((curr) => (curr === name ? null : name));
  };

  const closeDropdown = () => setActiveDropdown(null);

  // Extract current active block formatting
  const currentStyle = activeBlock?.style || {};
  const currentBlockType = activeBlock?.type || 'paragraph';
  const isBold = Boolean(currentStyle.bold);
  const isItalic = Boolean(currentStyle.italic);
  const isUnderline = Boolean(currentStyle.underline);
  const currentColor = currentStyle.color || '#111827';
  const currentBgColor = currentStyle.backgroundColor || 'transparent';
  const currentFontFamily = currentStyle.fontFamily || 'Arial, sans-serif';
  const currentTextAlign = currentStyle.textAlign || 'left';
  const currentLineHeight = currentStyle.lineHeight || '1.5';

  const currentFontSizeNum = parseInt(currentStyle.fontSize || '11', 10) || 11;

  const handleFontSizeChange = (delta) => {
    const next = Math.max(8, Math.min(72, currentFontSizeNum + delta));
    onFormatChange({ fontSize: `${next}px` });
  };

  const handleFormatPainter = () => {
    if (copiedFormat) {
      onFormatChange(copiedFormat);
      setCopiedFormat(null);
    } else {
      setCopiedFormat({ ...currentStyle });
    }
  };

  const handleSpellCheck = () => {
    setSpellCheckToast(true);
    setTimeout(() => setSpellCheckToast(false), 2000);
  };

  const getStyleLabel = () => {
    const s = STYLES.find((item) => item.id === currentBlockType);
    return s ? s.label : 'Normal text';
  };

  const getFontLabel = () => {
    const f = FONT_FAMILIES.find((item) => item.id === currentFontFamily);
    return f ? f.label : 'Arial';
  };

  return (
    <div
      ref={toolbarRef}
      className="w-full bg-[#f9fbfd] border-b border-neutral-200/80 select-none shrink-0 relative z-50 overflow-visible shadow-xs"
    >
      {/* ── Top Header Row: Google Docs Brand, Editable Title & Menu Bar ──────── */}
      <div className="px-3 sm:px-6 pt-3.5 pb-1.5 flex flex-col md:flex-row md:items-center justify-between gap-2 overflow-visible">
        {/* Left: App Icon, Document Title & Menus */}
        <div className="flex items-start gap-3.5 min-w-0 overflow-visible">
          {/* Document Workshops Logo / Sidebar Toggle */}
          <button
            type="button"
            onClick={() => onToggleSidebar?.()}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 flex items-center justify-center shadow-sm cursor-pointer active:scale-95 transition-all shrink-0 mt-0.5"
            title="Toggle Document Explorer Sidebar"
          >
            <BookOpen className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
          </button>

          {/* Title and Top Menus Container */}
          <div className="flex flex-col min-w-0 overflow-visible">
            {/* Title & Status Bar */}
            <div className="flex items-center gap-3">
              {isEditingTitle ? (
                <input
                  type="text"
                  value={activeDoc?.title || ''}
                  autoFocus
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingTitle(false);
                  }}
                  onChange={(e) => onTitleChange?.(e.target.value)}
                  className="text-xl sm:text-2xl font-semibold text-neutral-900 bg-white px-3 py-1 rounded-lg border border-blue-500 outline-none shadow-xs max-w-xs sm:max-w-lg"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  className="text-xl sm:text-2xl font-semibold text-neutral-800 hover:text-neutral-950 px-2.5 py-0.5 rounded-lg hover:bg-neutral-200/60 transition-colors truncate max-w-xs sm:max-w-lg text-left cursor-pointer"
                  title="Click to rename document"
                >
                  {activeDoc?.title && activeDoc.title.trim() ? activeDoc.title : 'Untitled document'}
                </button>
              )}

              {/* Status Badge */}
              <div className="hidden sm:flex items-center">
                {isGuest ? (
                  <button
                    type="button"
                    onClick={onGuestSavePrompt}
                    className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-100/80 border border-amber-300 px-3 py-1 rounded-full hover:bg-amber-200 transition-colors cursor-pointer"
                    title="Guest Mode: Register to sync changes"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Guest</span>
                  </button>
                ) : saveStatus === 'saving' ? (
                  <span className="flex items-center gap-1.5 text-xs text-neutral-500 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Saving...</span>
                  </span>
                ) : (
                  <span
                    className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer font-medium"
                    title="All changes saved to cloud"
                    onClick={() => onSaveImmediate?.()}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="hidden md:inline">Saved to cloud</span>
                  </span>
                )}
              </div>
            </div>

            {/* Google Docs Menus: File | Edit | View | Insert | Format | Tools | Help */}
            <div className="flex items-center gap-1 text-[14px] sm:text-[15px] text-neutral-700 font-medium relative mt-1.5 flex-wrap overflow-visible">
              {/* File Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => toggleDropdown('file')}
                  className={`px-3 py-1 rounded-md hover:bg-neutral-200/60 transition-colors cursor-pointer ${
                    activeDropdown === 'file' ? 'bg-neutral-200 text-neutral-900 font-semibold' : ''
                  }`}
                >
                  File
                </button>
                {activeDropdown === 'file' && (
                  <div className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-2xl border border-neutral-200 py-2 z-[100] text-[14px] text-neutral-800 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        onCreateDoc?.();
                        closeDropdown();
                      }}
                      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <FilePlus className="w-4 h-4 text-blue-600" />
                      <span>New Document</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSaveImmediate?.();
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <Save className="w-4 h-4 text-emerald-600" />
                        <span>Save Document</span>
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">Ctrl+S</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDownloadDocx?.();
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <FileDown className="w-4 h-4 text-blue-600" />
                      <span>Download as Word (.docx)</span>
                    </button>
                    <div className="my-1 border-t border-neutral-100" />
                    <button
                      type="button"
                      onClick={() => {
                        onPrint?.();
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <Printer className="w-4 h-4 text-neutral-600" />
                        <span>Print / Save as PDF</span>
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">Ctrl+P</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Edit Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => toggleDropdown('edit')}
                  className={`px-2.5 py-1 rounded-md hover:bg-neutral-200/60 transition-colors cursor-pointer ${
                    activeDropdown === 'edit' ? 'bg-neutral-200 text-neutral-900 font-semibold' : ''
                  }`}
                >
                  Edit
                </button>
                {activeDropdown === 'edit' && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-2xl border border-neutral-200 py-1.5 z-[100] text-sm text-neutral-800 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      disabled={!canUndo}
                      onClick={() => {
                        onUndo?.();
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <RotateCcw className="w-4 h-4" />
                        <span>Undo</span>
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">Ctrl+Z</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canRedo}
                      onClick={() => {
                        onRedo?.();
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <RotateCw className="w-4 h-4" />
                        <span>Redo</span>
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">Ctrl+Y</span>
                    </button>
                    <div className="my-1 border-t border-neutral-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setShowFindReplace(true);
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <Search className="w-4 h-4 text-blue-600" />
                        <span>Find and replace</span>
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">Ctrl+H</span>
                    </button>
                  </div>
                )}
              </div>

              {/* View Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => toggleDropdown('view')}
                  className={`px-2.5 py-1 rounded-md hover:bg-neutral-200/60 transition-colors cursor-pointer ${
                    activeDropdown === 'view' ? 'bg-neutral-200 text-neutral-900 font-semibold' : ''
                  }`}
                >
                  View
                </button>
                {activeDropdown === 'view' && (
                  <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-2xl border border-neutral-200 py-1.5 z-[100] text-sm text-neutral-800 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        setShowRuler(!showRuler);
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <span>Show ruler</span>
                      {showRuler && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowOutline(!showOutline);
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <span>Show document outline</span>
                      {showOutline && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Insert Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => toggleDropdown('insert')}
                  className={`px-2.5 py-1 rounded-md hover:bg-neutral-200/60 transition-colors cursor-pointer ${
                    activeDropdown === 'insert' ? 'bg-neutral-200 text-neutral-900 font-semibold' : ''
                  }`}
                >
                  Insert
                </button>
                {activeDropdown === 'insert' && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-2xl border border-neutral-200 py-1.5 z-[100] text-sm text-neutral-800 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        onInsertTableGrid?.(3, 4);
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <Table className="w-4 h-4 text-emerald-600" />
                      <span>Table (3 × 4)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertBlock?.('board');
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <Columns className="w-4 h-4 text-amber-600" />
                      <span>Kanban Board</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertBlock?.('code');
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <Code className="w-4 h-4 text-purple-600" />
                      <span>Code Block</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInsertBlock?.('callout');
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <Info className="w-4 h-4 text-blue-600" />
                      <span>Callout Note</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Format Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => toggleDropdown('format')}
                  className={`px-2.5 py-1 rounded-md hover:bg-neutral-200/60 transition-colors cursor-pointer ${
                    activeDropdown === 'format' ? 'bg-neutral-200 text-neutral-900 font-semibold' : ''
                  }`}
                >
                  Format
                </button>
                {activeDropdown === 'format' && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-2xl border border-neutral-200 py-1.5 z-[100] text-sm text-neutral-800 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        onFormatChange({ bold: !isBold });
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer font-bold"
                    >
                      <span>Bold</span>
                      <span className="text-xs text-neutral-400 font-mono">Ctrl+B</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onFormatChange({ italic: !isItalic });
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer italic"
                    >
                      <span>Italic</span>
                      <span className="text-xs text-neutral-400 font-mono">Ctrl+I</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onFormatChange({ underline: !isUnderline });
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer underline"
                    >
                      <span>Underline</span>
                      <span className="text-xs text-neutral-400 font-mono">Ctrl+U</span>
                    </button>
                    <div className="my-1 border-t border-neutral-100" />
                    <button
                      type="button"
                      onClick={() => {
                        onFormatChange({
                          bold: false,
                          italic: false,
                          underline: false,
                          strikethrough: false,
                          color: '#111827',
                          backgroundColor: 'transparent',
                          fontSize: '11px',
                          textAlign: 'left',
                          lineHeight: '1.5',
                        });
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center gap-2.5 hover:bg-neutral-100 text-left cursor-pointer text-red-600"
                    >
                      <RemoveFormatting className="w-4 h-4" />
                      <span>Clear formatting</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Tools Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => toggleDropdown('tools')}
                  className={`px-2.5 py-1 rounded-md hover:bg-neutral-200/60 transition-colors cursor-pointer ${
                    activeDropdown === 'tools' ? 'bg-neutral-200 text-neutral-900 font-semibold' : ''
                  }`}
                >
                  Tools
                </button>
                {activeDropdown === 'tools' && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-2xl border border-neutral-200 py-1.5 z-[100] text-sm text-neutral-800 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        handleSpellCheck();
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <CheckCheck className="w-4 h-4 text-emerald-600" />
                      <span>Spelling & grammar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        alert(`Total Words: ${wordCount}`);
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <span>Word count</span>
                      <span className="font-semibold font-mono text-blue-600">{wordCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onCleanEmptyBlocks?.();
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer text-neutral-700"
                    >
                      <RemoveFormatting className="w-4 h-4 text-amber-500" />
                      <span>Clean empty blocks</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Help Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => toggleDropdown('help')}
                  className={`px-2.5 py-1 rounded-md hover:bg-neutral-200/60 transition-colors cursor-pointer ${
                    activeDropdown === 'help' ? 'bg-neutral-200 text-neutral-900 font-semibold' : ''
                  }`}
                >
                  Help
                </button>
                {activeDropdown === 'help' && (
                  <div className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-2xl border border-neutral-200 py-1.5 z-[100] text-sm text-neutral-800 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        setShowShortcuts(true);
                        closeDropdown();
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <Keyboard className="w-4 h-4 text-blue-600" />
                        <span>Keyboard shortcuts</span>
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">Ctrl+/</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Share Pill Button */}
        <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-2 px-5 py-2 bg-[#c2e7ff] hover:bg-[#b3dcf8] text-[#001d35] font-semibold text-sm rounded-full transition-all shadow-xs active:scale-95 cursor-pointer"
          >
            <Share2 className="w-4 h-4 text-[#001d35]" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* ── Action Pill Toolbar (Exact Google Docs Style Row) ────────────────── */}
      <div className="px-3 sm:px-5 py-2 flex items-center overflow-visible">
        <div className="flex items-center gap-1 bg-[#edf2fa] hover:bg-[#e7eef8] border border-neutral-200/70 px-3 py-1.5 rounded-full shadow-2xs transition-colors shrink-0 overflow-visible relative">
          {/* 1. Search Icon */}
          <button
            type="button"
            onClick={() => setShowFindReplace(true)}
            className="p-2 rounded-full hover:bg-neutral-300/50 text-neutral-700 transition-colors cursor-pointer"
            title="Search the menus or text (Ctrl+F)"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* 2. Undo */}
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="p-2 rounded-full hover:bg-neutral-300/50 text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* 3. Redo */}
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="p-2 rounded-full hover:bg-neutral-300/50 text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Redo (Ctrl+Y)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* 4. Print */}
          <button
            type="button"
            onClick={onPrint}
            className="p-2 rounded-full hover:bg-neutral-300/50 text-neutral-700 transition-colors cursor-pointer"
            title="Print (Ctrl+P)"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* 5. Spell Check */}
          <button
            type="button"
            onClick={handleSpellCheck}
            className="p-2 rounded-full hover:bg-neutral-300/50 text-neutral-700 transition-colors cursor-pointer relative"
            title="Spelling and grammar check"
          >
            <CheckCheck className="w-4 h-4 text-emerald-600" />
            {spellCheckToast && (
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-xs px-2.5 py-1 rounded-md shadow z-[100] whitespace-nowrap">
                Spelling checked!
              </span>
            )}
          </button>

          {/* 6. Paint Format (Format Painter) */}
          <button
            type="button"
            onClick={handleFormatPainter}
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              copiedFormat ? 'bg-blue-200 text-blue-800' : 'hover:bg-neutral-300/50 text-neutral-700'
            }`}
            title={copiedFormat ? 'Click on any block to apply copied format' : 'Copy block formatting'}
          >
            <Paintbrush className="w-4 h-4" />
          </button>

          {/* 7. Zoom Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('zoom')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-neutral-700 rounded-lg hover:bg-neutral-300/50 transition-colors cursor-pointer ${
                activeDropdown === 'zoom' ? 'bg-neutral-300/70' : ''
              }`}
            >
              <span>{zoomLevel}%</span>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
            </button>
            {activeDropdown === 'zoom' && (
              <div className="absolute left-0 top-full mt-1.5 w-32 bg-white rounded-xl shadow-2xl border border-neutral-200 py-1.5 z-[100] text-sm text-neutral-800">
                {ZOOM_OPTIONS.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => {
                      setZoomLevel(z);
                      closeDropdown();
                    }}
                    className={`w-full px-3.5 py-1.5 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer ${
                      zoomLevel === z ? 'font-bold text-blue-600 bg-blue-50/50' : ''
                    }`}
                  >
                    <span>{z}%</span>
                    {zoomLevel === z && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-neutral-300 mx-1" />

          {/* 8. Text Style Dropdown (Normal text / Heading 1 / 2 / 3) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('style')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[14.5px] font-medium text-neutral-700 rounded-lg hover:bg-neutral-300/50 transition-colors cursor-pointer max-w-[150px] truncate ${
                activeDropdown === 'style' ? 'bg-neutral-300/70' : ''
              }`}
            >
              <span className="truncate">{getStyleLabel()}</span>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            </button>
            {activeDropdown === 'style' && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-2xl border border-neutral-200 py-2 z-[100] text-[14.5px] text-neutral-800">
                {STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      onTransformBlockType?.(st.id);
                      closeDropdown();
                    }}
                    className={`w-full px-4 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer ${
                      currentBlockType === st.id ? 'bg-blue-50 text-blue-600 font-semibold' : ''
                    }`}
                  >
                    <span className={st.previewClass}>{st.label}</span>
                    {currentBlockType === st.id && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-neutral-300 mx-1" />

          {/* 9. Font Family Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('font')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[14.5px] font-medium text-neutral-700 rounded-lg hover:bg-neutral-300/50 transition-colors cursor-pointer max-w-[140px] truncate ${
                activeDropdown === 'font' ? 'bg-neutral-300/70' : ''
              }`}
            >
              <span className="truncate">{getFontLabel()}</span>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            </button>
            {activeDropdown === 'font' && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-2xl border border-neutral-200 py-2 z-[100] text-[14.5px] text-neutral-800 max-h-64 overflow-y-auto">
                {FONT_FAMILIES.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    style={{ fontFamily: font.id }}
                    onClick={() => {
                      onFormatChange({ fontFamily: font.id });
                      closeDropdown();
                    }}
                    className={`w-full px-4 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer ${
                      currentFontFamily === font.id ? 'bg-blue-50 text-blue-600 font-semibold' : ''
                    }`}
                  >
                    <span>{font.label}</span>
                    {currentFontFamily === font.id && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-neutral-300 mx-1" />

          {/* 10. Font Size Controls: [ - ] [ 11 ] [ + ] */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleFontSizeChange(-1)}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-300/50 text-neutral-700 text-base font-bold transition-colors cursor-pointer"
              title="Decrease font size"
            >
              -
            </button>
            <input
              type="text"
              value={currentFontSizeNum}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) onFormatChange({ fontSize: `${val}px` });
              }}
              className="w-9 h-7 text-center text-[14.5px] font-semibold bg-white/90 border border-neutral-300/80 rounded-md outline-none text-neutral-800"
            />
            <button
              type="button"
              onClick={() => handleFontSizeChange(1)}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-neutral-300/50 text-neutral-700 text-base font-bold transition-colors cursor-pointer"
              title="Increase font size"
            >
              +
            </button>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-neutral-300 mx-1" />

          {/* 11. Bold */}
          <button
            type="button"
            onClick={() => onFormatChange({ bold: !isBold })}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isBold ? 'bg-neutral-300 text-neutral-900 font-bold' : 'hover:bg-neutral-300/50 text-neutral-700'
            }`}
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-4.5 h-4.5" />
          </button>

          {/* 12. Italic */}
          <button
            type="button"
            onClick={() => onFormatChange({ italic: !isItalic })}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isItalic ? 'bg-neutral-300 text-neutral-900' : 'hover:bg-neutral-300/50 text-neutral-700'
            }`}
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-4.5 h-4.5" />
          </button>

          {/* 13. Underline */}
          <button
            type="button"
            onClick={() => onFormatChange({ underline: !isUnderline })}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isUnderline ? 'bg-neutral-300 text-neutral-900' : 'hover:bg-neutral-300/50 text-neutral-700'
            }`}
            title="Underline (Ctrl+U)"
          >
            <Underline className="w-4.5 h-4.5" />
          </button>

          {/* 14. Text Color Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('color')}
              className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg hover:bg-neutral-300/50 transition-colors cursor-pointer ${
                activeDropdown === 'color' ? 'bg-neutral-300/70' : ''
              }`}
              title="Text color"
            >
              <span className="text-[15px] font-bold leading-none" style={{ color: currentColor }}>
                A
              </span>
              <div className="w-4.5 h-0.5 mt-0.5 rounded-full" style={{ backgroundColor: currentColor }} />
            </button>
            {activeDropdown === 'color' && (
              <div className="absolute left-0 top-full mt-1.5 p-2.5 bg-white rounded-xl shadow-2xl border border-neutral-200 z-[100] grid grid-cols-4 gap-2 w-44">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    style={{ backgroundColor: c.value }}
                    onClick={() => {
                      onFormatChange({ color: c.value });
                      closeDropdown();
                    }}
                    className={`w-7 h-7 rounded-full border border-neutral-300 transition-transform hover:scale-110 cursor-pointer ${
                      currentColor === c.value ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                    }`}
                    title={c.name}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 15. Highlight Color Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('highlight')}
              className={`p-2 rounded-lg hover:bg-neutral-300/50 transition-colors cursor-pointer ${
                activeDropdown === 'highlight' ? 'bg-neutral-300/70' : ''
              }`}
              title="Highlight color"
            >
              <Highlighter className="w-4.5 h-4.5 text-neutral-700" />
            </button>
            {activeDropdown === 'highlight' && (
              <div className="absolute left-0 top-full mt-1.5 p-2.5 bg-white rounded-xl shadow-2xl border border-neutral-200 z-[100] grid grid-cols-4 gap-2 w-44">
                {HIGHLIGHT_COLORS.map((hc) => (
                  <button
                    key={hc.value}
                    type="button"
                    style={{ backgroundColor: hc.value === 'transparent' ? '#ffffff' : hc.value }}
                    onClick={() => {
                      onFormatChange({ backgroundColor: hc.value });
                      closeDropdown();
                    }}
                    className={`w-7 h-7 rounded-full border border-neutral-300 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                      currentBgColor === hc.value ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                    }`}
                    title={hc.name}
                  >
                    {hc.value === 'transparent' && <span className="text-xs text-neutral-400">∅</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-neutral-300 mx-1" />

          {/* 16. Insert Table / Board / Block */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('insertBlock')}
              className={`p-2 rounded-lg hover:bg-neutral-300/50 transition-colors cursor-pointer ${
                activeDropdown === 'insertBlock' ? 'bg-neutral-300/70' : ''
              }`}
              title="Insert Table, Kanban Board, Code, Callout"
            >
              <Table className="w-4.5 h-4.5 text-neutral-700" />
            </button>
            {activeDropdown === 'insertBlock' && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-2xl border border-neutral-200 py-2 z-[100] text-[14.5px] text-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    onInsertTableGrid?.(3, 3);
                    closeDropdown();
                  }}
                  className="w-full px-4 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                >
                  <Table className="w-4 h-4 text-emerald-600" />
                  <span>Insert Table (3 × 3)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertBlock?.('board');
                    closeDropdown();
                  }}
                  className="w-full px-4 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                >
                  <Columns className="w-4 h-4 text-amber-600" />
                  <span>Insert Kanban Board</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertBlock?.('code');
                    closeDropdown();
                  }}
                  className="w-full px-4 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                >
                  <Code className="w-4 h-4 text-purple-600" />
                  <span>Insert Code Snippet</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInsertBlock?.('callout');
                    closeDropdown();
                  }}
                  className="w-full px-4 py-2 flex items-center gap-3 hover:bg-neutral-100 text-left cursor-pointer"
                >
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>Insert Callout Note</span>
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-neutral-300 mx-1" />

          {/* 17. Text Alignment Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('align')}
              className={`flex items-center gap-1 p-2 rounded-lg hover:bg-neutral-300/50 transition-colors cursor-pointer ${
                activeDropdown === 'align' ? 'bg-neutral-300/70' : ''
              }`}
              title="Align text"
            >
              {currentTextAlign === 'center' ? (
                <AlignCenter className="w-4.5 h-4.5 text-neutral-700" />
              ) : currentTextAlign === 'right' ? (
                <AlignRight className="w-4.5 h-4.5 text-neutral-700" />
              ) : currentTextAlign === 'justify' ? (
                <AlignJustify className="w-4.5 h-4.5 text-neutral-700" />
              ) : (
                <AlignLeft className="w-4.5 h-4.5 text-neutral-700" />
              )}
              <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
            </button>
            {activeDropdown === 'align' && (
              <div className="absolute left-0 top-full mt-1.5 p-2 bg-white rounded-xl shadow-2xl border border-neutral-200 z-[100] flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onFormatChange({ textAlign: 'left' });
                    closeDropdown();
                  }}
                  className={`p-2 rounded-lg hover:bg-neutral-100 cursor-pointer ${
                    currentTextAlign === 'left' ? 'bg-blue-50 text-blue-600' : 'text-neutral-700'
                  }`}
                  title="Left align"
                >
                  <AlignLeft className="w-4.5 h-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onFormatChange({ textAlign: 'center' });
                    closeDropdown();
                  }}
                  className={`p-2 rounded-lg hover:bg-neutral-100 cursor-pointer ${
                    currentTextAlign === 'center' ? 'bg-blue-50 text-blue-600' : 'text-neutral-700'
                  }`}
                  title="Center align"
                >
                  <AlignCenter className="w-4.5 h-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onFormatChange({ textAlign: 'right' });
                    closeDropdown();
                  }}
                  className={`p-2 rounded-lg hover:bg-neutral-100 cursor-pointer ${
                    currentTextAlign === 'right' ? 'bg-blue-50 text-blue-600' : 'text-neutral-700'
                  }`}
                  title="Right align"
                >
                  <AlignRight className="w-4.5 h-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onFormatChange({ textAlign: 'justify' });
                    closeDropdown();
                  }}
                  className={`p-2 rounded-lg hover:bg-neutral-100 cursor-pointer ${
                    currentTextAlign === 'justify' ? 'bg-blue-50 text-blue-600' : 'text-neutral-700'
                  }`}
                  title="Justify"
                >
                  <AlignJustify className="w-4.5 h-4.5" />
                </button>
              </div>
            )}
          </div>

          {/* 18. Line Spacing Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('spacing')}
              className={`p-2 rounded-lg hover:bg-neutral-300/50 transition-colors cursor-pointer ${
                activeDropdown === 'spacing' ? 'bg-neutral-300/70' : ''
              }`}
              title="Line spacing"
            >
              <SlidersHorizontal className="w-4.5 h-4.5 text-neutral-700" />
            </button>
            {activeDropdown === 'spacing' && (
              <div className="absolute left-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-2xl border border-neutral-200 py-2 z-[100] text-[14.5px] text-neutral-800">
                {[
                  { label: 'Single (1.0)', val: '1' },
                  { label: '1.15', val: '1.15' },
                  { label: '1.5', val: '1.5' },
                  { label: 'Double (2.0)', val: '2' },
                ].map((sp) => (
                  <button
                    key={sp.val}
                    type="button"
                    onClick={() => {
                      onFormatChange({ lineHeight: sp.val });
                      closeDropdown();
                    }}
                    className={`w-full px-4 py-2 flex items-center justify-between hover:bg-neutral-100 text-left cursor-pointer ${
                      currentLineHeight === sp.val ? 'font-bold text-blue-600 bg-blue-50' : ''
                    }`}
                  >
                    <span>{sp.label}</span>
                    {currentLineHeight === sp.val && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-neutral-300 mx-1" />

          {/* 19. Checklist (To-Do) */}
          <button
            type="button"
            onClick={() => onTransformBlockType?.('todo')}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              currentBlockType === 'todo' ? 'bg-neutral-300 text-neutral-900' : 'hover:bg-neutral-300/50 text-neutral-700'
            }`}
            title="Checklist / To-do list"
          >
            <ListTodo className="w-4.5 h-4.5" />
          </button>

          {/* 20. Bulleted List */}
          <button
            type="button"
            onClick={() => onTransformBlockType?.('bullet')}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              currentBlockType === 'bullet' ? 'bg-neutral-300 text-neutral-900' : 'hover:bg-neutral-300/50 text-neutral-700'
            }`}
            title="Bulleted list"
          >
            <List className="w-4.5 h-4.5" />
          </button>

          {/* 21. Numbered List */}
          <button
            type="button"
            onClick={() => onTransformBlockType?.('numbered')}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              currentBlockType === 'numbered' ? 'bg-neutral-300 text-neutral-900' : 'hover:bg-neutral-300/50 text-neutral-700'
            }`}
            title="Numbered list"
          >
            <ListOrdered className="w-4.5 h-4.5" />
          </button>

          {/* 22. Clear Formatting */}
          <button
            type="button"
            onClick={() =>
              onFormatChange({
                bold: false,
                italic: false,
                underline: false,
                strikethrough: false,
                color: '#111827',
                backgroundColor: 'transparent',
                fontSize: '11px',
                textAlign: 'left',
                lineHeight: '1.5',
              })
            }
            className="p-2 rounded-lg hover:bg-neutral-300/50 text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
            title="Clear formatting"
          >
            <RemoveFormatting className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
