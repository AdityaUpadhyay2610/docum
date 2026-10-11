import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import SlashMenu from './slashMenu';
import { CodeBlock, TableBlock, BoardBlock, CalloutBlock } from './blocks';
import { exportToDocx } from '../../services/docxExport';
import { useEditorSettings, PAGE_SIZES, PAGE_THEMES } from '../../context/EditorSettingsContext';

// ─── Constants for Automatic Page Pagination ──────────────────────────────────
// In standard Word / Google Docs formatting (A4/Letter, 1-inch margins, 11-12pt font):
// 1 standard page holds approx 380 - 450 words or ~35 lines of text.
const TARGET_WORDS_PER_PAGE = 400;

export default function EditorCanvas({
  blocks = [],
  onUpdateBlocks,
  title = 'Untitled',
  onTitleChange,
  onActiveBlockChange,
  onPageInfoChange,
}) {
  const {
    pageSize,
    orientation,

    rulerMargins = { left: 12, right: 12 },
    pageTheme,
    zoomLevel,
    showParagraphMarks,
    viewMode,
  } = useEditorSettings();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const blockRefs = useRef({});
  const titleRef = useRef(null);
  const pageRef = useRef(null);

  // ─── Style mapper ────────────────────────────────────────────────────────────
  const getBlockStyle = (block) => {
    const s = block?.style || {};
    const styles = {};
    if (s.fontFamily && s.fontFamily !== 'inherit') styles.fontFamily = s.fontFamily;
    if (s.fontSize) styles.fontSize = s.fontSize;
    if (s.color && s.color !== 'inherit') styles.color = s.color;
    if (s.backgroundColor && s.backgroundColor !== 'transparent') styles.backgroundColor = s.backgroundColor;
    if (s.bold !== undefined) styles.fontWeight = s.bold ? '700' : '400';
    if (s.italic !== undefined) styles.fontStyle = s.italic ? 'italic' : 'normal';
    if (s.underline && s.strikethrough) styles.textDecoration = 'underline line-through';
    else if (s.underline) styles.textDecoration = 'underline';
    else if (s.strikethrough) styles.textDecoration = 'line-through';
    if (s.textAlign) styles.textAlign = s.textAlign;
    if (s.lineHeight) styles.lineHeight = s.lineHeight;
    return styles;
  };

  const handleBlockFocus = (blockId, pageIdx = 0) => {
    setActiveBlockId(blockId);
    setActivePageIndex(pageIdx);
    onActiveBlockChange?.(blockId);
  };

  // ─── Auto resize textarea ────────────────────────────────────────────────────
  const autoResize = useCallback((el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Resize all textareas when blocks or title change
  useEffect(() => {
    if (titleRef.current && titleRef.current.tagName === 'TEXTAREA') {
      autoResize(titleRef.current);
    }
    Object.values(blockRefs.current).forEach((el) => {
      if (el && el.tagName === 'TEXTAREA') autoResize(el);
    });
  }, [blocks, title, autoResize]);

  // Auto-resize on window / viewport resize (split screen, mobile, sidebar toggle)
  useEffect(() => {
    const handleResize = () => {
      if (titleRef.current && titleRef.current.tagName === 'TEXTAREA') {
        autoResize(titleRef.current);
      }
      Object.values(blockRefs.current).forEach((el) => {
        if (el && el.tagName === 'TEXTAREA') autoResize(el);
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [autoResize]);

  // ─── Auto-initialize empty document & Auto-Focus Cursor ───────────────────────
  useEffect(() => {
    if (blocks.length === 0) {
      const defaultBlock = { id: crypto.randomUUID(), type: 'paragraph', text: '' };
      onUpdateBlocks([defaultBlock]);
      setTimeout(() => {
        const el = blockRefs.current[defaultBlock.id];
        if (el) el.focus();
      }, 50);
    } else {
      const timer = setTimeout(() => {
        if (!document.activeElement || document.activeElement === document.body) {
          const firstBlock = blocks[0];
          if (firstBlock && blockRefs.current[firstBlock.id]) {
            blockRefs.current[firstBlock.id].focus();
          }
        }
      }, 80);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Click anywhere on blank page → focus nearest / last block ───────────────
  const handlePageClick = (e, pageBlocks = []) => {
    if (
      e.target.tagName === 'INPUT' ||
      e.target.tagName === 'TEXTAREA' ||
      e.target.tagName === 'BUTTON' ||
      e.target.closest('button') ||
      e.target.closest('table') ||
      e.target.closest('.kanban-board')
    ) {
      return;
    }

    const currentBlocks = pageBlocks.length > 0 ? pageBlocks : blocks;
    if (currentBlocks.length === 0) {
      const defaultBlock = { id: crypto.randomUUID(), type: 'paragraph', text: '' };
      onUpdateBlocks([defaultBlock]);
      setTimeout(() => {
        const el = blockRefs.current[defaultBlock.id];
        if (el) el.focus();
      }, 20);
      return;
    }

    const lastItem = currentBlocks[currentBlocks.length - 1];
    const targetId = lastItem.refId || lastItem.id;
    const el = blockRefs.current[targetId];
    if (el) {
      el.focus();
      if (el.setSelectionRange && el.value !== undefined) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }
  };

  // ─── Text change with slash detection ───────────────────────────────────────
  const handleTextChange = (id, newText, targetElement, extraProps = {}) => {
    setActiveBlockId(id);
    onActiveBlockChange?.(id);
    const updated = blocks.map((block) =>
      block.id === id ? { ...block, text: newText, ...extraProps } : block
    );
    onUpdateBlocks(updated);

    const slashMatch = newText.match(/(?:^|\s)\/([a-zA-Z0-9]*)$/);
    if (slashMatch && targetElement) {
      const rect = targetElement.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: Math.max(16, rect.left) });
      setMenuQuery(slashMatch[1] || '');
      setMenuOpen(true);
    } else {
      setMenuOpen(false);
    }
  };

  // ─── Handling Chunked Text Updates for massive paragraphs ───────────────────
  const handleChunkTextChange = (parentId, chunkIndex, totalChunks, newChunkText, chunksArray) => {
    const newFullChunks = [...chunksArray];
    newFullChunks[chunkIndex] = newChunkText;
    const combinedText = newFullChunks.join('');
    const updated = blocks.map((block) =>
      block.id === parentId ? { ...block, text: combinedText } : block
    );
    onUpdateBlocks(updated);
  };

  // ─── Slash menu block selection ──────────────────────────────────────────────
  const handleSelectBlockType = (type) => {
    if (type === 'export-docx') {
      const updated = blocks.map((block) => {
        if (block.id === activeBlockId) {
          const lastSlashIndex = block.text ? block.text.lastIndexOf('/') : -1;
          const cleanText = lastSlashIndex !== -1 ? block.text.slice(0, lastSlashIndex).trim() : block.text || '';
          return { ...block, text: cleanText };
        }
        return block;
      });
      onUpdateBlocks(updated);
      setMenuOpen(false);
      setMenuQuery('');
      exportToDocx(title, updated);
      return;
    }

    const updated = blocks.map((block) => {
      if (block.id === activeBlockId) {
        const lastSlashIndex = block.text ? block.text.lastIndexOf('/') : -1;
        const cleanText = lastSlashIndex !== -1 ? block.text.slice(0, lastSlashIndex).trim() : block.text || '';
        let extraFields = {};
        if (type === 'table') {
          extraFields = {
            headers: block.headers || ['Name', 'Tag', 'Notes'],
            rows: block.rows || [['Task 1', 'Active', 'Initial design draft'], ['Task 2', 'Pending', 'Code review']],
          };
        } else if (type === 'board') {
          extraFields = {
            columns: block.columns || [
              { id: crypto.randomUUID(), title: 'To Do', color: 'amber', cards: [{ id: crypto.randomUUID(), title: 'Brainstorm feature ideas' }] },
              { id: crypto.randomUUID(), title: 'In Progress', color: 'blue', cards: [{ id: crypto.randomUUID(), title: 'Build UI prototype' }] },
              { id: crypto.randomUUID(), title: 'Done', color: 'emerald', cards: [{ id: crypto.randomUUID(), title: 'Project setup & repository' }] },
            ],
          };
        } else if (type === 'callout') {
          extraFields = { calloutType: 'info' };
        }
        return { ...block, type, text: cleanText, checked: type === 'todo' ? false : undefined, ...extraFields };
      }
      return block;
    });

    onUpdateBlocks(updated);
    setMenuOpen(false);
    setMenuQuery('');
    setTimeout(() => {
      const activeInput = blockRefs.current[activeBlockId];
      if (activeInput) {
        activeInput.focus();
        if (activeInput.tagName === 'TEXTAREA') autoResize(activeInput);
      }
    }, 20);
  };

  const handleUpdateBlockData = (id, customData) => {
    const updated = blocks.map((block) => (block.id === id ? { ...block, ...customData } : block));
    onUpdateBlocks(updated);
  };

  const handleToggleTodo = (id) => {
    const updated = blocks.map((block) => (block.id === id ? { ...block, checked: !block.checked } : block));
    onUpdateBlocks(updated);
  };

  const handleAddBlockAfter = (index, type = 'paragraph', text = '') => {
    const newBlock = { id: crypto.randomUUID(), type, text, checked: type === 'todo' ? false : undefined };
    const updated = [...blocks];
    updated.splice(index + 1, 0, newBlock);
    onUpdateBlocks(updated);
    setTimeout(() => {
      const nextInput = blockRefs.current[newBlock.id];
      if (nextInput) {
        nextInput.focus();
        if (nextInput.setSelectionRange) nextInput.setSelectionRange(0, 0);
        if (nextInput.tagName === 'TEXTAREA') autoResize(nextInput);
      }
    }, 20);
  };

  // ─── Seamless Keyboard Typing Navigation ────────────────────────────────────
  const handleKeyDown = (e, globalIndex, block) => {
    if (menuOpen) return;

    if (e.key === 'Enter') {
      if (block.type === 'code' && !e.shiftKey && !e.ctrlKey && !e.metaKey) return;
      if (!e.shiftKey) {
        e.preventDefault();
        const target = e.target;
        const selStart = target?.selectionStart ?? (block.text || '').length;
        const text = block.text || '';
        const beforeText = text.slice(0, selStart);
        const afterText = text.slice(selStart);

        if ((block.type === 'todo' || block.type === 'bullet' || block.type === 'numbered') && (!text || text.trim() === '')) {
          const updated = [...blocks];
          updated[globalIndex] = { ...block, type: 'paragraph', checked: undefined };
          onUpdateBlocks(updated);
          return;
        }

        let nextType = 'paragraph';
        if (block.type === 'todo') nextType = 'todo';
        else if (block.type === 'bullet') nextType = 'bullet';
        else if (block.type === 'numbered') nextType = 'numbered';

        const newBlock = {
          id: crypto.randomUUID(),
          type: nextType,
          text: afterText,
          checked: nextType === 'todo' ? false : undefined,
        };
        const updated = [...blocks];
        updated[globalIndex] = { ...block, text: beforeText };
        updated.splice(globalIndex + 1, 0, newBlock);
        onUpdateBlocks(updated);

        setTimeout(() => {
          const nextInput = blockRefs.current[newBlock.id];
          if (nextInput) {
            nextInput.focus();
            if (nextInput.setSelectionRange) nextInput.setSelectionRange(0, 0);
            if (nextInput.tagName === 'TEXTAREA') autoResize(nextInput);
          }
        }, 20);
      }
    } else if (e.key === 'Backspace') {
      const target = e.target;
      const selStart = target?.selectionStart ?? 0;
      const selEnd = target?.selectionEnd ?? 0;
      const isCollapsedAtStart = selStart === 0 && selEnd === 0;

      if (isCollapsedAtStart) {
        if (block.type !== 'paragraph' && (!block.text || block.text === '')) {
          e.preventDefault();
          const updated = [...blocks];
          updated[globalIndex] = { ...block, type: 'paragraph', checked: undefined };
          onUpdateBlocks(updated);
          return;
        }

        if (globalIndex > 0) {
          e.preventDefault();
          const prevBlock = blocks[globalIndex - 1];
          const prevText = prevBlock.text || '';
          const currentText = block.text || '';

          if (!currentText) {
            const updated = blocks.filter((_, i) => i !== globalIndex);
            onUpdateBlocks(updated);
            setTimeout(() => {
              const prevInput = blockRefs.current[prevBlock.id];
              if (prevInput) {
                prevInput.focus();
                const len = prevInput.value?.length || prevText.length;
                if (prevInput.setSelectionRange) prevInput.setSelectionRange(len, len);
              }
            }, 20);
            return;
          }

          if (['paragraph', 'h1', 'h2', 'h3', 'heading', 'bullet', 'numbered', 'quote'].includes(prevBlock.type)) {
            const mergedText = prevText + currentText;
            const updated = blocks.filter((_, i) => i !== globalIndex);
            const prevIdx = updated.findIndex((b) => b.id === prevBlock.id);
            if (prevIdx !== -1) {
              updated[prevIdx] = { ...prevBlock, text: mergedText };
            }
            onUpdateBlocks(updated);
            setTimeout(() => {
              const prevInput = blockRefs.current[prevBlock.id];
              if (prevInput) {
                prevInput.focus();
                if (prevInput.setSelectionRange) prevInput.setSelectionRange(prevText.length, prevText.length);
                if (prevInput.tagName === 'TEXTAREA') autoResize(prevInput);
              }
            }, 20);
            return;
          }
        }
      }
    } else if (e.key === 'ArrowUp') {
      const target = e.target;
      if (target && target.selectionStart === 0 && globalIndex > 0) {
        const prevBlock = blocks[globalIndex - 1];
        if (prevBlock && blockRefs.current[prevBlock.id]) {
          e.preventDefault();
          const prevInput = blockRefs.current[prevBlock.id];
          prevInput.focus();
          const len = prevInput.value?.length || 0;
          if (prevInput.setSelectionRange) prevInput.setSelectionRange(len, len);
        }
      }
    } else if (e.key === 'ArrowDown') {
      const target = e.target;
      const len = target?.value?.length || 0;
      if (target && target.selectionEnd === len && globalIndex < blocks.length - 1) {
        const nextBlock = blocks[globalIndex + 1];
        if (nextBlock && blockRefs.current[nextBlock.id]) {
          e.preventDefault();
          const nextInput = blockRefs.current[nextBlock.id];
          nextInput.focus();
          if (nextInput.setSelectionRange) nextInput.setSelectionRange(0, 0);
        }
      }
    }
  };

  // ─── Numbered list sequential counter ───────────────────────────────────────
  let numberedCounter = 0;

  // ─── Layout config ───────────────────────────────────────────────────────────
  const themeConfig = PAGE_THEMES[pageTheme] || PAGE_THEMES.white;

  const sizeConfig = PAGE_SIZES[pageSize] || PAGE_SIZES.letter;

  const isPrintView = viewMode === 'print';
  const pageContainerClass = isPrintView
    ? `mx-auto my-2 sm:my-4 md:my-6 ${themeConfig.pageBg} ${themeConfig.border} border shadow-xl rounded-xs min-h-[1056px] w-full py-12 ${orientation === 'landscape' ? 'max-w-[1056px] min-h-[816px]' : sizeConfig.class}`
    : `mx-auto w-full max-w-[210mm] sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl min-h-[calc(100vh-120px)] py-6 sm:py-10 md:py-14 px-4 sm:px-8 md:px-16 ${themeConfig.pageBg} shadow-sm border border-neutral-200/60 rounded-xs`;

  // ─── Title keyboard: Tab / Enter → focus first block ────────────────────────
  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (blocks.length > 0) {
        const firstInput = blockRefs.current[blocks[0].id];
        if (firstInput) firstInput.focus();
      }
    }
  };

  // ─── Helper function to estimate block size in word-equivalents ─────────────
  const getBlockWeight = useCallback((block) => {
    if (!block) return 0;
    if (block.type === 'page-break') return 999999;
    // Headings take ~1-2 lines visually; use actual word count + small overhead
    if (block.type === 'h1' || block.type === 'heading') {
      const hw = block.text ? block.text.trim().split(/\s+/).filter(Boolean).length : 0;
      return hw + 15;
    }
    if (block.type === 'h2') {
      const hw = block.text ? block.text.trim().split(/\s+/).filter(Boolean).length : 0;
      return hw + 10;
    }
    if (block.type === 'h3') {
      const hw = block.text ? block.text.trim().split(/\s+/).filter(Boolean).length : 0;
      return hw + 8;
    }
    if (block.type === 'table') return 140;
    if (block.type === 'board') return 180;
    if (block.type === 'callout') {
      const textWords = block.text ? block.text.trim().split(/\s+/).filter(Boolean).length : 0;
      return 40 + textWords;
    }
    if (block.type === 'divider') return 20;

    const text = block.text || '';
    if (!text) return 15;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const lines = text.split('\n').length;
    return Math.max(words, lines * 12);
  }, []);

  // ─── Automatic Page Pagination Algorithm ────────────────────────────────────
  // Automatically breaks long documents (e.g. 15,000 words) across multiple A4 pages
  const pages = useMemo(() => {
    const result = [[]];
    let pageIndex = 0;
    // Title takes roughly 1-2 lines; use actual word count + small overhead
    const titleWords = title && title.trim() ? title.trim().split(/\s+/).filter(Boolean).length : 0;
    let currentWordsOnPage = titleWords > 0 ? titleWords + 10 : 0;

    blocks.forEach((block, globalIndex) => {
      // 1. Manual Page Break
      if (block.type === 'page-break') {
        pageIndex += 1;
        result[pageIndex] = [];
        currentWordsOnPage = 0;
        return;
      }

      const weight = getBlockWeight(block);

      // 2. Giant paragraph with more than TARGET_WORDS_PER_PAGE words (e.g. 15,000 words pasted in single block)
      if (
        (!block.type || block.type === 'paragraph') &&
        weight > TARGET_WORDS_PER_PAGE
      ) {
        // Calculate remaining capacity on the current page
        const remainingCapacity = Math.max(80, TARGET_WORDS_PER_PAGE - currentWordsOnPage);
        // First chunk target fills the remaining space on the current page
        const firstChunkTarget = Math.min(remainingCapacity, 400);

        const allWords = (block.text || '').split(/(\s+)/);
        let chunkWords = [];
        let chunkCount = 0;
        const textChunks = [];
        let isFirstChunk = true;

        for (let i = 0; i < allWords.length; i++) {
          const w = allWords[i];
          chunkWords.push(w);
          if (w.trim().length > 0) chunkCount++;

          const targetSize = isFirstChunk ? firstChunkTarget : 380;
          const maxSize = isFirstChunk ? firstChunkTarget + 40 : 420;
          const isBoundary = w.includes('\n') || w.includes('.') || w.includes('!') || w.includes('?');
          if ((chunkCount >= targetSize && isBoundary) || chunkCount >= maxSize) {
            textChunks.push(chunkWords.join(''));
            chunkWords = [];
            chunkCount = 0;
            isFirstChunk = false;
          }
        }
        if (chunkWords.length > 0) {
          textChunks.push(chunkWords.join(''));
        }

        // Distribute text chunks across pages — first chunk stays on current page
        textChunks.forEach((chunkText, cIdx) => {
          const chunkWeight = Math.max(20, chunkText.trim().split(/\s+/).filter(Boolean).length);
          if (cIdx > 0 && currentWordsOnPage + chunkWeight > TARGET_WORDS_PER_PAGE) {
            pageIndex += 1;
            result[pageIndex] = [];
            currentWordsOnPage = 0;
          }

          result[pageIndex].push({
            ...block,
            id: `${block.id}-chunk-${cIdx}`,
            refId: cIdx === 0 ? block.id : `${block.id}-chunk-${cIdx}`,
            parentBlockId: block.id,
            isChunk: true,
            chunkIndex: cIdx,
            totalChunks: textChunks.length,
            chunksArray: textChunks,
            text: chunkText,
            globalIndex,
          });

          currentWordsOnPage += chunkWeight;
        });

        return;
      }

      // 3. Normal block: if adding it exceeds page capacity, start a new page
      if (
        currentWordsOnPage + weight > TARGET_WORDS_PER_PAGE &&
        result[pageIndex].length > 0
      ) {
        pageIndex += 1;
        result[pageIndex] = [];
        currentWordsOnPage = 0;
      }

      result[pageIndex].push({
        ...block,
        refId: block.id,
        globalIndex,
      });

      currentWordsOnPage += weight;
    });

    return result;
  }, [blocks, title, getBlockWeight]);

  const pageCount = pages.length;

  // Inform parent of current page and total page count for status bar
  useEffect(() => {
    onPageInfoChange?.({
      pageCount,
      currentPage: Math.min(pageCount, activePageIndex + 1),
    });
  }, [pageCount, activePageIndex, onPageInfoChange]);

  // ─── Render Clean Block without hover '+' or 'delete' buttons ────────────────
  const renderBlock = (block, localIndex, pageIdx) => {
    const globalIndex = block.globalIndex ?? localIndex;
    const targetRefId = block.refId || block.id;

    return (
      <div
        key={block.id}
        id={`doc-block-${targetRefId}`}
        className="relative w-full my-0.5"
      >
        <div className="w-full">
          {/* H1 */}
          {(block.type === 'h1' || block.type === 'heading') && (
            <textarea
              id={`block-h1-${targetRefId}`}
              name={`block_h1_${targetRefId}`}
              aria-label="Heading 1 content"
              ref={(el) => { blockRefs.current[targetRefId] = el; if (el) autoResize(el); }}
              rows={1}
              value={block.text || ''}
              placeholder="Heading 1"
              onInput={(e) => autoResize(e.target)}
              onChange={(e) => handleTextChange(block.id, e.target.value, e.target)}
              onFocus={() => handleBlockFocus(block.id, pageIdx)}
              onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
              style={getBlockStyle(block)}
              className="w-full text-2xl sm:text-3xl font-extrabold text-neutral-900 placeholder-neutral-300 border-none bg-transparent focus:outline-none py-1 tracking-tight resize-none overflow-hidden break-words leading-tight"
            />
          )}

          {/* H2 */}
          {block.type === 'h2' && (
            <textarea
              id={`block-h2-${targetRefId}`}
              name={`block_h2_${targetRefId}`}
              aria-label="Heading 2 content"
              ref={(el) => { blockRefs.current[targetRefId] = el; if (el) autoResize(el); }}
              rows={1}
              value={block.text || ''}
              placeholder="Heading 2"
              onInput={(e) => autoResize(e.target)}
              onChange={(e) => handleTextChange(block.id, e.target.value, e.target)}
              onFocus={() => handleBlockFocus(block.id, pageIdx)}
              onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
              style={getBlockStyle(block)}
              className="w-full text-xl sm:text-2xl font-bold text-neutral-800 placeholder-neutral-300 border-none bg-transparent focus:outline-none py-0.5 tracking-tight resize-none overflow-hidden break-words leading-snug"
            />
          )}

          {/* H3 */}
          {block.type === 'h3' && (
            <textarea
              id={`block-h3-${targetRefId}`}
              name={`block_h3_${targetRefId}`}
              aria-label="Heading 3 content"
              ref={(el) => { blockRefs.current[targetRefId] = el; if (el) autoResize(el); }}
              rows={1}
              value={block.text || ''}
              placeholder="Heading 3"
              onInput={(e) => autoResize(e.target)}
              onChange={(e) => handleTextChange(block.id, e.target.value, e.target)}
              onFocus={() => handleBlockFocus(block.id, pageIdx)}
              onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
              style={getBlockStyle(block)}
              className="w-full text-lg sm:text-xl font-semibold text-neutral-800 placeholder-neutral-300 border-none bg-transparent focus:outline-none py-0.5 tracking-tight resize-none overflow-hidden break-words leading-snug"
            />
          )}

          {/* To-Do */}
          {block.type === 'todo' && (
            <div className="flex items-start gap-2.5 py-0.5">
              <input
                id={`block-todo-check-${targetRefId}`}
                name={`block_todo_check_${targetRefId}`}
                aria-label="Toggle task completed"
                type="checkbox"
                checked={Boolean(block.checked)}
                onChange={() => handleToggleTodo(block.id)}
                className="mt-1.5 rounded w-4 h-4 accent-neutral-900 cursor-pointer shrink-0"
              />
              <textarea
                id={`block-todo-text-${targetRefId}`}
                name={`block_todo_text_${targetRefId}`}
                aria-label="To-do task content"
                ref={(el) => { blockRefs.current[targetRefId] = el; if (el) autoResize(el); }}
                rows={1}
                value={block.text || ''}
                placeholder="To-do item..."
                onInput={(e) => autoResize(e.target)}
                onChange={(e) => handleTextChange(block.id, e.target.value, e.target)}
                onFocus={() => handleBlockFocus(block.id, pageIdx)}
                onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
                style={getBlockStyle(block)}
                className={`w-full text-base bg-transparent border-none focus:outline-none min-w-0 resize-none overflow-hidden break-words leading-relaxed py-0.5 ${block.checked ? 'line-through text-neutral-400' : 'text-neutral-800'}`}
              />
            </div>
          )}

          {/* Bullet */}
          {block.type === 'bullet' && (
            <div className="flex items-start gap-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0 mt-2.5 mx-1" />
              <textarea
                id={`block-bullet-${targetRefId}`}
                name={`block_bullet_${targetRefId}`}
                aria-label="Bullet list item"
                ref={(el) => { blockRefs.current[targetRefId] = el; if (el) autoResize(el); }}
                rows={1}
                value={block.text || ''}
                placeholder="List item..."
                onInput={(e) => autoResize(e.target)}
                onChange={(e) => handleTextChange(block.id, e.target.value, e.target)}
                onFocus={() => handleBlockFocus(block.id, pageIdx)}
                onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
                style={getBlockStyle(block)}
                className="w-full text-base text-neutral-800 placeholder-neutral-300 border-none bg-transparent focus:outline-none py-0.5 min-w-0 resize-none overflow-hidden break-words leading-relaxed"
              />
            </div>
          )}

          {/* Numbered */}
          {block.type === 'numbered' && (
            <div className="flex items-start gap-2 py-0.5">
              <span className="font-mono text-sm text-neutral-500 shrink-0 mt-1 min-w-[20px] select-none font-semibold">
                {(() => { numberedCounter += 1; return numberedCounter; })()}.
              </span>
              <textarea
                id={`block-numbered-${targetRefId}`}
                name={`block_numbered_${targetRefId}`}
                aria-label="Numbered list item"
                ref={(el) => { blockRefs.current[targetRefId] = el; if (el) autoResize(el); }}
                rows={1}
                value={block.text || ''}
                placeholder="Numbered item..."
                onInput={(e) => autoResize(e.target)}
                onChange={(e) => handleTextChange(block.id, e.target.value, e.target)}
                onFocus={() => handleBlockFocus(block.id, pageIdx)}
                onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
                style={getBlockStyle(block)}
                className="w-full text-base text-neutral-800 placeholder-neutral-300 border-none bg-transparent focus:outline-none py-0.5 min-w-0 resize-none overflow-hidden break-words leading-relaxed"
              />
            </div>
          )}

          {/* Quote */}
          {block.type === 'quote' && (
            <div className="border-l-4 border-blue-400 pl-3 py-0.5 my-0.5 bg-blue-50/30 rounded-r">
              <textarea
                id={`block-quote-${targetRefId}`}
                name={`block_quote_${targetRefId}`}
                aria-label="Quote content"
                ref={(el) => { blockRefs.current[targetRefId] = el; autoResize(el); }}
                rows={1}
                value={block.text || ''}
                placeholder="Quote..."
                onInput={(e) => autoResize(e.target)}
                onChange={(e) => handleTextChange(block.id, e.target.value, e.target)}
                onFocus={() => handleBlockFocus(block.id, pageIdx)}
                onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
                style={getBlockStyle(block)}
                className="w-full text-base text-neutral-600 placeholder-neutral-400 resize-none overflow-hidden border-none bg-transparent focus:outline-none leading-relaxed italic"
              />
            </div>
          )}

          {/* Callout */}
          {block.type === 'callout' && (
            <CalloutBlock
              block={block}
              onChange={(text, el, extra) => handleTextChange(block.id, text, el, extra)}
              onFocus={() => handleBlockFocus(block.id, pageIdx)}
              onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
              inputRef={(el) => { blockRefs.current[targetRefId] = el; if (el) autoResize(el); }}
              style={getBlockStyle(block)}
            />
          )}

          {/* Code */}
          {block.type === 'code' && (
            <CodeBlock
              block={block}
              onChange={(newText, targetEl) => handleTextChange(block.id, newText, targetEl)}
              onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
              inputRef={(el) => { if (el) blockRefs.current[targetRefId] = el; }}
            />
          )}

          {/* Table */}
          {block.type === 'table' && (
            <TableBlock block={block} onChange={(data) => handleUpdateBlockData(block.id, data)} />
          )}

          {/* Board */}
          {block.type === 'board' && (
            <BoardBlock block={block} onChange={(data) => handleUpdateBlockData(block.id, data)} />
          )}

          {/* Divider */}
          {block.type === 'divider' && (
            <div className="py-3 flex items-center">
              <hr className="w-full border-t border-neutral-200" />
            </div>
          )}

          {/* Paragraph (default text) */}
          {(!block.type || block.type === 'paragraph') && (
            <div className="relative flex items-start w-full">
              <textarea
                id={`block-paragraph-${targetRefId}`}
                name={`block_paragraph_${targetRefId}`}
                aria-label="Paragraph text block"
                ref={(el) => { blockRefs.current[targetRefId] = el; autoResize(el); }}
                rows={1}
                value={block.text || ''}
                placeholder=""
                onInput={(e) => autoResize(e.target)}
                onChange={(e) => {
                  if (block.isChunk) {
                    handleChunkTextChange(
                      block.parentBlockId,
                      block.chunkIndex,
                      block.totalChunks,
                      e.target.value,
                      block.chunksArray
                    );
                  } else {
                    handleTextChange(block.id, e.target.value, e.target);
                  }
                }}
                onFocus={() => handleBlockFocus(block.parentBlockId || block.id, pageIdx)}
                onKeyDown={(e) => handleKeyDown(e, globalIndex, block)}
                style={getBlockStyle(block)}
                className="w-full text-base text-neutral-800 placeholder-neutral-300 resize-none overflow-hidden border-none bg-transparent focus:outline-none leading-relaxed py-0.5 min-w-0"
              />
              {showParagraphMarks && (
                <span className="text-neutral-300 font-serif select-none pl-1 text-sm pointer-events-none shrink-0">¶</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`min-h-full pb-16 px-2 sm:px-4 md:px-6 transition-all duration-150 ${isPrintView ? 'bg-[#edebe9] py-3 sm:py-6' : 'bg-[#f8f7f5] py-3 sm:py-8'}`}
      style={{
        transformOrigin: 'top center',
        transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
      }}
    >
      {pages.map((pageBlocks, pageIdx) => {
        const isFirstPage = pageIdx === 0;

        return (
          <div key={`page-${pageIdx}`} className="relative">
            {/* Page number label (shown between pages) */}
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-3 my-3 select-none">
                <div className="h-px flex-1 bg-neutral-300/60" />
                <span className="text-[11px] font-medium text-neutral-400 tracking-widest uppercase">
                  Page {pageIdx + 1} of {pageCount}
                </span>
                <div className="h-px flex-1 bg-neutral-300/60" />
              </div>
            )}

            {/* Paper Page Sheet */}
            <div
              id={isFirstPage ? 'word-document-page' : `word-document-page-${pageIdx}`}
              ref={isFirstPage ? pageRef : undefined}
              onClick={(e) => handlePageClick(e, pageBlocks)}
              style={
                isPrintView
                  ? { paddingLeft: `${rulerMargins.left}%`, paddingRight: `${rulerMargins.right}%` }
                  : undefined
              }
              className={`${pageContainerClass} relative ${themeConfig.text} cursor-text transition-[padding] duration-75`}
            >
              {/* Document Title — on first page */}
              {isFirstPage && (
                <div className="mb-4 sm:mb-6">
                  <textarea
                    id="editor-document-title-input"
                    name="document_title"
                    aria-label="Document title"
                    ref={titleRef}
                    rows={1}
                    value={title || ''}
                    onChange={(e) => onTitleChange?.(e.target.value)}
                    onInput={(e) => autoResize(e.target)}
                    onKeyDown={handleTitleKeyDown}
                    placeholder="Untitled Document"
                    className={`
                      w-full bg-transparent border-none outline-none p-0
                      text-2xl sm:text-3xl md:text-[2.25rem] font-bold leading-tight tracking-tight
                      placeholder:text-neutral-300 ${themeConfig.text || 'text-neutral-900'}
                      transition-colors resize-none overflow-hidden break-words
                    `}
                  />
                </div>
              )}

              {/* Clean Blocks for this page */}
              {pageBlocks.map((block, localIdx) => {
                return renderBlock(block, localIdx, pageIdx);
              })}

              {/* Clickable padding at bottom of page sheet to seamlessly place cursor */}
              <div
                className="h-24 w-full cursor-text"
                onClick={() => {
                  const lastBlock = pageBlocks[pageBlocks.length - 1];
                  const lastRefId = lastBlock?.refId || lastBlock?.id;
                  if (lastBlock && lastBlock.text === '' && lastBlock.type === 'paragraph') {
                    blockRefs.current[lastRefId]?.focus();
                  } else {
                    handleAddBlockAfter(blocks.length - 1);
                  }
                }}
              />
            </div>

            {/* Visual Sheet separation */}
            {pageIdx < pages.length - 1 && <div className="h-4" />}
          </div>
        );
      })}

      {/* Add Blank Page button */}
      <div className="flex items-center justify-center mt-6 mb-4">
        <button
          type="button"
          onClick={() => {
            const pageBreakBlock = { id: crypto.randomUUID(), type: 'page-break', text: '' };
            const emptyPara = { id: crypto.randomUUID(), type: 'paragraph', text: '' };
            const newBlocks = [...blocks, pageBreakBlock, emptyPara];
            onUpdateBlocks(newBlocks);
            setTimeout(() => {
              const el = blockRefs.current[emptyPara.id];
              if (el) el.focus();
            }, 50);
          }}
          className="group flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-neutral-600 bg-white hover:bg-blue-600 hover:text-white border border-neutral-200 hover:border-blue-600 rounded-xl shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer"
          title="Add a new blank page"
        >
          <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
          Add Blank Page
        </button>
      </div>

      {/* Slash Command Menu */}
      {menuOpen && (
        <SlashMenu
          query={menuQuery}
          position={menuPosition}
          onSelect={handleSelectBlockType}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}