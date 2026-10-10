import { useMemo } from 'react';

/**
 * Hook to calculate comprehensive document statistics
 * @param {string} title
 * @param {Array} blocks
 */
export function useWordStats(title = '', blocks = []) {
  return useMemo(() => {
    let wordCount = 0;
    let charCount = 0;
    let charNoSpaces = 0;
    let paragraphCount = 0;
    let headingCount = 0;
    let tableCount = 0;
    let todoCount = 0;
    let todoDoneCount = 0;

    const headings = [];

    if (title && title.trim()) {
      const words = title.trim().split(/\s+/).filter(Boolean);
      wordCount += words.length;
      charCount += title.length;
      charNoSpaces += title.replace(/\s/g, '').length;
    }

    blocks.forEach((block) => {
      if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3' || block.type === 'heading') {
        headingCount++;
        if (block.text) {
          headings.push({
            id: block.id,
            level: block.type === 'h1' || block.type === 'heading' ? 1 : block.type === 'h2' ? 2 : 3,
            text: block.text,
          });
        }
      } else if (block.type === 'table') {
        tableCount++;
        const headers = block.headers || [];
        const rows = block.rows || [];
        headers.forEach((h) => {
          if (h) {
            wordCount += h.trim().split(/\s+/).filter(Boolean).length;
            charCount += h.length;
          }
        });
        rows.forEach((row) => {
          row.forEach((cell) => {
            if (cell) {
              wordCount += cell.trim().split(/\s+/).filter(Boolean).length;
              charCount += cell.length;
            }
          });
        });
      } else if (block.type === 'todo') {
        todoCount++;
        if (block.checked) todoDoneCount++;
      }

      if (block.type === 'paragraph' || block.type === 'quote' || block.type === 'callout') {
        if (block.text && block.text.trim()) {
          paragraphCount++;
        }
      }

      if (block.text) {
        const words = block.text.trim().split(/\s+/).filter(Boolean);
        wordCount += words.length;
        charCount += block.text.length;
        charNoSpaces += block.text.replace(/\s/g, '').length;
      }
    });

    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    return {
      wordCount,
      charCount,
      charNoSpaces,
      paragraphCount,
      headingCount,
      tableCount,
      todoCount,
      todoDoneCount,
      readingTimeMinutes,
      headings,
    };
  }, [title, blocks]);
}

export default useWordStats;
