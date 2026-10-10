/**
 * Service to generate a clean, professional print/PDF layout from document data.
 * Completely strips all editor UI controls (inputs, buttons, drag grips, delete buttons)
 * and renders pure semantic HTML with pristine typography.
 */

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getInlineStyleString(style = {}) {
  const rules = [];
  if (style.fontFamily && style.fontFamily !== 'inherit') rules.push(`font-family: ${style.fontFamily}`);
  if (style.fontSize) rules.push(`font-size: ${style.fontSize}`);
  if (style.color && style.color !== 'inherit') rules.push(`color: ${style.color}`);
  if (style.backgroundColor && style.backgroundColor !== 'transparent') rules.push(`background-color: ${style.backgroundColor}`);
  if (style.bold !== undefined) rules.push(`font-weight: ${style.bold ? '700' : '400'}`);
  if (style.italic !== undefined) rules.push(`font-style: ${style.italic ? 'italic' : 'normal'}`);
  
  const deco = [];
  if (style.underline) deco.push('underline');
  if (style.strikethrough) deco.push('line-through');
  if (deco.length > 0) rules.push(`text-decoration: ${deco.join(' ')}`);

  if (style.textAlign) rules.push(`text-align: ${style.textAlign}`);
  if (style.lineHeight) rules.push(`line-height: ${style.lineHeight}`);

  return rules.join('; ');
}

export function printDocument(doc) {
  if (!doc) return;

  const title = doc.title || 'Untitled Document';
  const content = doc.content || [];

  let htmlBody = `<h1 style="font-size: 26pt; font-weight: 700; margin-bottom: 20pt; color: #111827; line-height: 1.2;">${escapeHtml(title)}</h1>`;

  let inBulletList = false;
  let inNumberedList = false;

  content.forEach((block) => {
    const text = block.text || '';
    const styleStr = getInlineStyleString(block.style);


    // Handle list group closings
    if (block.type !== 'bullet' && inBulletList) {
      htmlBody += `</ul>`;
      inBulletList = false;
    }
    if (block.type !== 'numbered' && inNumberedList) {
      htmlBody += `</ol>`;
      inNumberedList = false;
    }

    switch (block.type) {
      case 'h1':
      case 'heading':
        htmlBody += `<h2 style="font-size: 18pt; font-weight: 700; margin-top: 18pt; margin-bottom: 6pt; color: ${block.style?.color || '#0f4c81'}; line-height: 1.3; ${styleStr}">${escapeHtml(text)}</h2>`;
        break;

      case 'h2':
        htmlBody += `<h3 style="font-size: 14pt; font-weight: 700; margin-top: 14pt; margin-bottom: 4pt; color: ${block.style?.color || '#1e293b'}; line-height: 1.35; ${styleStr}">${escapeHtml(text)}</h3>`;
        break;

      case 'h3':
        htmlBody += `<h4 style="font-size: 12pt; font-weight: 600; margin-top: 12pt; margin-bottom: 4pt; color: ${block.style?.color || '#1e293b'}; line-height: 1.4; ${styleStr}">${escapeHtml(text)}</h4>`;
        break;

      case 'bullet':
        if (!inBulletList) {
          htmlBody += `<ul style="margin: 6pt 0; padding-left: 20pt; list-style-type: disc;">`;
          inBulletList = true;
        }
        htmlBody += `<li style="font-size: 11pt; line-height: 1.6; margin: 3pt 0; color: #374151; ${styleStr}">${escapeHtml(text)}</li>`;
        break;

      case 'numbered':
        if (!inNumberedList) {
          htmlBody += `<ol style="margin: 6pt 0; padding-left: 20pt; list-style-type: decimal;">`;
          inNumberedList = true;
        }
        htmlBody += `<li style="font-size: 11pt; line-height: 1.6; margin: 3pt 0; color: #374151; ${styleStr}">${escapeHtml(text)}</li>`;
        break;

      case 'todo':
        htmlBody += `
          <div style="display: flex; align-items: flex-start; gap: 8pt; margin: 4pt 0; font-size: 11pt; line-height: 1.5; color: ${block.checked ? '#9ca3af; text-decoration: line-through;' : '#374151;'}; ${styleStr}">
            <span style="font-size: 12pt; user-select: none;">${block.checked ? '☑' : '☐'}</span>
            <span>${escapeHtml(text)}</span>
          </div>
        `;
        break;

      case 'quote':
        htmlBody += `
          <blockquote style="border-left: 4px solid #3b82f6; background: #f8fafc; padding: 8pt 14pt; margin: 10pt 0; font-style: italic; color: #475569; font-size: 11pt; line-height: 1.6; border-radius: 0 4pt 4pt 0; ${styleStr}">
            ${escapeHtml(text)}
          </blockquote>
        `;
        break;

      case 'callout':
        htmlBody += `
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6pt; padding: 10pt 14pt; margin: 10pt 0; color: #1e40af; font-size: 10.5pt; line-height: 1.5; ${styleStr}">
            <strong>ℹ Note:</strong> ${escapeHtml(text)}
          </div>
        `;
        break;

      case 'code':
        htmlBody += `
          <pre style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6pt; padding: 10pt 14pt; font-family: 'Courier New', monospace; font-size: 10pt; line-height: 1.5; margin: 10pt 0; overflow-x: auto; color: #1e293b;"><code>${escapeHtml(text)}</code></pre>
        `;
        break;

      case 'table': {
        const headers = block.headers || ['Column 1', 'Column 2', 'Column 3'];
        const rows = block.rows || [];
        htmlBody += `
          <table style="width: 100%; border-collapse: collapse; margin: 12pt 0; font-size: 10.5pt;">
            <thead>
              <tr style="background: #f8fafc;">
                ${headers.map((h) => `<th style="border: 1px solid #cbd5e1; padding: 6pt 10pt; text-align: left; font-weight: 600; color: #1e293b;">${escapeHtml(h)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  ${row.map((cell) => `<td style="border: 1px solid #e2e8f0; padding: 6pt 10pt; color: #334155;">${escapeHtml(cell)}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        break;
      }

      case 'board': {
        const columns = block.columns || [];
        htmlBody += `
          <div style="display: flex; gap: 10pt; margin: 12pt 0;">
            ${columns.map((col) => `
              <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6pt; padding: 8pt;">
                <div style="font-weight: 600; font-size: 10pt; margin-bottom: 6pt; color: #1e293b;">${escapeHtml(col.title)}</div>
                ${(col.cards || []).map((card) => `
                  <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4pt; padding: 6pt 8pt; margin-bottom: 4pt; font-size: 9.5pt; color: #334155;">
                    ${escapeHtml(card.title)}
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
        `;
        break;
      }

      case 'divider':
        htmlBody += `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16pt 0;" />`;
        break;

      case 'paragraph':
      default:
        if (text && text.trim()) {
          htmlBody += `<p style="font-size: 11pt; line-height: 1.65; margin: 5pt 0; color: #374151; ${styleStr}">${escapeHtml(text)}</p>`;
        }
        break;
    }
  });

  if (inBulletList) htmlBody += `</ul>`;
  if (inNumberedList) htmlBody += `</ol>`;

  // Create clean printable iframe
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 20mm;
          }
          *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #111827;
            padding: 0;
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        </style>
      </head>
      <body>
        ${htmlBody}
      </body>
    </html>
  `);
  iframeDoc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }
  }, 250);
}
