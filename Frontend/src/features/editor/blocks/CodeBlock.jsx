import { useState, useRef, useEffect } from 'react';
import { Copy, Check, ChevronDown } from 'lucide-react';

const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Bash / Shell' },
  { id: 'cpp', label: 'C++' },
  { id: 'java', label: 'Java' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
];

export default function CodeBlock({
  block,
  onChange,
  onKeyDown,
  inputRef,
  onDragStart,
  onDragEnd,
  isDragging,
}) {
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState(block.language || 'javascript');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langMenuRef = useRef(null);
  const textareaRef = useRef(null);

  const lines = (block.text || '').split('\n');
  const lineCount = Math.max(lines.length, 1);

  // Auto resize helper
  const handleInput = (e) => {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [block.text]);

  // Click outside listener for language picker
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(block.text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectLanguage = (langId) => {
    setLanguage(langId);
    setIsLangOpen(false);
  };

  // Support Tab key indentation inside code block
  const handleLocalKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.target;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue, textarea);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
      return;
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div
      className={`w-full my-2.5 rounded-xl bg-[#1e222d] border border-neutral-800/90 shadow-2xl overflow-hidden font-mono text-xs sm:text-sm transition-all duration-150 ${
        isDragging ? 'opacity-40 scale-[0.99] ring-2 ring-blue-500' : ''
      }`}
    >
      {/* macOS Terminal Window Titlebar (Draggable for Code Snippets) */}
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 bg-[#141720] border-b border-neutral-800/80 select-none cursor-grab active:cursor-grabbing group/titlebar gap-2"
        title="Drag code snippet to move"
      >
        {/* Traffic Light Window Dots */}
        <div
          className="flex items-center gap-1.5 sm:gap-2 shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full bg-[#ff5f56] hover:brightness-110 transition-all cursor-pointer shadow-sm" title="Close" />
          <span className="w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full bg-[#ffbd2e] hover:brightness-110 transition-all cursor-pointer shadow-sm" title="Minimize" />
          <span className="w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full bg-[#27c93f] hover:brightness-110 transition-all cursor-pointer shadow-sm" title="Expand" />
        </div>

        {/* Center Draggable Snippet Title & Grip Badge */}
        <div className="hidden sm:flex items-center gap-1.5 text-neutral-500 text-[11px] font-mono select-none opacity-70 group-hover/titlebar:opacity-100 transition-opacity pointer-events-none truncate">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
          <span className="text-neutral-400 font-medium truncate">Code Snippet</span>
          <span className="text-neutral-600 text-[10px] hidden md:inline">(drag to move)</span>
        </div>

        {/* Center / Right controls: Language Picker & Copy Button */}
        <div
          className="flex items-center gap-1.5 sm:gap-2.5 shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Language Selector Dropdown */}
          <div className="relative" ref={langMenuRef}>
            <button
              type="button"
              onClick={() => setIsLangOpen(!isLangOpen)}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-mono text-neutral-400 hover:text-neutral-200 bg-neutral-800/60 hover:bg-neutral-800 rounded-md transition-colors"
            >
              <span>{LANGUAGES.find((l) => l.id === language)?.label || language}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {isLangOpen && (
              <div className="absolute right-0 top-8 z-50 w-36 bg-[#181b22] border border-neutral-700/80 rounded-lg shadow-2xl py-1 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => handleSelectLanguage(lang.id)}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                      language === lang.id
                        ? 'bg-neutral-800 text-emerald-400 font-semibold'
                        : 'text-neutral-300 hover:bg-neutral-800/60'
                    }`}
                  >
                    <span>{lang.label}</span>
                    {language === lang.id && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Copy Code Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-mono text-neutral-400 hover:text-neutral-200 bg-neutral-800/60 hover:bg-neutral-800 rounded-md transition-colors"
            title="Copy code to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="hidden xs:inline">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Editor Body with Line Numbers */}
      <div className="relative flex bg-[#181b22] p-3 text-neutral-200 min-h-[90px]">
        {/* Line Numbers Gutter */}
        <div className="pr-3.5 pl-1 select-none text-neutral-600 text-right font-mono text-xs sm:text-sm leading-relaxed border-r border-neutral-800/80">
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} className="min-w-[1.2rem]">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code Textarea */}
        <div className="flex-1 pl-3.5 overflow-hidden">
          <textarea
            ref={(el) => {
              textareaRef.current = el;
              if (inputRef) inputRef(el);
            }}
            rows={1}
            value={block.text || ''}
            placeholder="// Paste or write your code here..."
            onInput={handleInput}
            onChange={(e) => onChange(e.target.value, e.target)}
            onKeyDown={handleLocalKeyDown}
            spellCheck="false"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="w-full font-mono text-xs sm:text-sm text-neutral-100 placeholder-neutral-600 bg-transparent resize-none focus:outline-none leading-relaxed overflow-hidden border-none p-0 selection:bg-neutral-700/80"
          />
        </div>
      </div>
    </div>
  );
}
