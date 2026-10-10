/**
 * Generates and downloads a .docx file on the user's device with rich Word formatting.
 * Dynamically imports docx library to optimize initial bundle size.
 * @param {string} title - Title of the document
 * @param {Array} content - List of block objects
 */
export async function exportToDocx(title = 'Untitled', content = []) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ShadingType,
    AlignmentType,
    PageBreak,
  } = await import('docx');

  const children = [];

  // Document Title Header
  children.push(
    new Paragraph({
      text: title && title.trim() !== '' ? title : 'Untitled Document',
      heading: HeadingLevel.TITLE,
      spacing: { after: 300, before: 100 },
    })
  );

  let numberedCounter = 0;

  content.forEach((block) => {
    if (block.type === 'numbered') {
      numberedCounter += 1;
    } else {
      numberedCounter = 0;
    }

    const s = block.style || {};
    const fontName = s.fontFamily ? s.fontFamily.split(',')[0].replace(/['"]/g, '') : undefined;
    const fontSizePt = s.fontSize ? parseInt(s.fontSize, 10) * 2 : 24; // docx uses half-points (24 = 12pt)
    const colorHex = s.color ? s.color.replace('#', '') : undefined;

    const alignment =
      s.textAlign === 'center'
        ? AlignmentType.CENTER
        : s.textAlign === 'right'
        ? AlignmentType.RIGHT
        : s.textAlign === 'justify'
        ? AlignmentType.JUSTIFIED
        : AlignmentType.LEFT;

    // 1. Headings
    if (block.type === 'h1' || block.type === 'heading') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text || '',
              bold: true,
              size: 32, // 16pt
              font: fontName,
              color: colorHex || '1E293B',
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          alignment,
          spacing: { before: 240, after: 120 },
        })
      );
    } else if (block.type === 'h2') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text || '',
              bold: true,
              size: 28, // 14pt
              font: fontName,
              color: colorHex || '334155',
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          alignment,
          spacing: { before: 200, after: 100 },
        })
      );
    } else if (block.type === 'h3') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text || '',
              bold: true,
              size: 24, // 12pt
              font: fontName,
              color: colorHex || '475569',
            }),
          ],
          heading: HeadingLevel.HEADING_3,
          alignment,
          spacing: { before: 160, after: 80 },
        })
      );
    }
    // 2. Callout / Alert Note
    else if (block.type === 'callout') {
      const calloutType = block.calloutType || 'info';
      const fillHex =
        calloutType === 'warning' ? 'FEF3C7' :
        calloutType === 'tip' ? 'D1FAE5' :
        calloutType === 'success' ? 'EDE9FE' : 'E0F2FE';

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `💡 [${calloutType.toUpperCase()}]: ${block.text || ''}`,
              size: 22,
              font: fontName,
              color: '1E293B',
            }),
          ],
          shading: {
            type: ShadingType.CLEAR,
            fill: fillHex,
          },
          border: {
            left: { color: '3B82F6', size: 12, space: 4, value: 'single' },
          },
          spacing: { before: 140, after: 140 },
          indent: { left: 240, right: 240 },
        })
      );
    }
    // 3. To-do Item
    else if (block.type === 'todo') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.checked ? '☑ ' : '☐ ',
              bold: true,
              size: 24,
              color: block.checked ? '10B981' : '6B7280',
            }),
            new TextRun({
              text: block.text || '',
              strike: Boolean(block.checked || s.strikethrough),
              bold: Boolean(s.bold),
              italics: Boolean(s.italic),
              underline: s.underline ? {} : undefined,
              color: block.checked ? '9CA3AF' : colorHex || '1F2937',
              font: fontName,
              size: fontSizePt || 22,
            }),
          ],
          alignment,
          spacing: { after: 80 },
        })
      );
    }
    // 4. Bullet List
    else if (block.type === 'bullet') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text || '',
              bold: Boolean(s.bold),
              italics: Boolean(s.italic),
              underline: s.underline ? {} : undefined,
              strike: Boolean(s.strikethrough),
              color: colorHex,
              font: fontName,
              size: fontSizePt || 22,
            }),
          ],
          bullet: { level: 0 },
          alignment,
          spacing: { after: 80 },
        })
      );
    }
    // 5. Numbered List
    else if (block.type === 'numbered') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${numberedCounter}. `, bold: true }),
            new TextRun({
              text: block.text || '',
              bold: Boolean(s.bold),
              italics: Boolean(s.italic),
              underline: s.underline ? {} : undefined,
              strike: Boolean(s.strikethrough),
              color: colorHex,
              font: fontName,
              size: fontSizePt || 22,
            }),
          ],
          alignment,
          spacing: { after: 80 },
        })
      );
    }
    // 6. Quote
    else if (block.type === 'quote') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.text || '',
              italics: true,
              color: colorHex || '4B5563',
              font: fontName,
              size: fontSizePt || 22,
            }),
          ],
          border: {
            left: { color: '3B82F6', size: 12, space: 4, value: 'single' },
          },
          indent: { left: 720 },
          spacing: { before: 120, after: 120 },
        })
      );
    }
    // 7. Code Block
    else if (block.type === 'code') {
      const codeLines = (block.text || '').split('\n');
      const textRuns = [];

      codeLines.forEach((line, index) => {
        textRuns.push(
          new TextRun({
            text: line || ' ',
            font: 'Consolas',
            size: 19,
            color: '1E293B',
            break: index > 0 ? 1 : 0,
          })
        );
      });

      children.push(
        new Paragraph({
          children: textRuns,
          shading: {
            type: ShadingType.CLEAR,
            fill: 'F1F5F9',
          },
          spacing: { before: 140, after: 140 },
          indent: { left: 360, right: 360 },
        })
      );
    }
    // 8. Divider
    else if (block.type === 'divider') {
      children.push(
        new Paragraph({
          border: {
            bottom: {
              color: 'CBD5E1',
              size: 8,
              space: 4,
              value: 'single',
            },
          },
          spacing: { before: 160, after: 160 },
        })
      );
    }
    // 9. Table Block
    else if (block.type === 'table') {
      const headers = block.headers || ['Name', 'Tag', 'Notes'];
      const rows = block.rows || [];

      const tableRows = [
        new TableRow({
          tableHeader: true,
          children: headers.map(
            (h) =>
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: 'E2E8F0' },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: h || '', bold: true, size: 21 })],
                  }),
                ],
              })
          ),
        }),
        ...rows.map(
          (row) =>
            new TableRow({
              children: headers.map(
                (_, cIdx) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: row[cIdx] || '', size: 20 })],
                      }),
                    ],
                  })
              ),
            })
        ),
      ];

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows,
        })
      );
      children.push(new Paragraph({ text: '', spacing: { after: 140 } }));
    }
    // 10. Board View Block
    else if (block.type === 'board') {
      const columns = block.columns || [];
      children.push(
        new Paragraph({
          text: 'Kanban Board View',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 180, after: 100 },
        })
      );

      columns.forEach((col) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `▸ ${col.title}`, bold: true, size: 22 })],
            spacing: { before: 80, after: 40 },
          })
        );

        (col.cards || []).forEach((card) => {
          children.push(
            new Paragraph({
              text: card.title || '',
              bullet: { level: 0 },
              spacing: { after: 40 },
            })
          );
        });
      });
      children.push(new Paragraph({ text: '', spacing: { after: 140 } }));
    }
    // 11. Page Break
    else if (block.type === 'page-break') {
      children.push(
        new Paragraph({
          children: [new PageBreak()],
        })
      );
    }
    // 12. Default: Paragraph
    else {
      if (block.text && block.text.trim() !== '') {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.text,
                bold: Boolean(s.bold),
                italics: Boolean(s.italic),
                underline: s.underline ? {} : undefined,
                strike: Boolean(s.strikethrough),
                color: colorHex,
                font: fontName,
                size: fontSizePt || 24,
              }),
            ],
            alignment,
            spacing: { after: 100 },
          })
        );
      }
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children.length > 0 ? children : [new Paragraph({ text: '' })],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const cleanFileName = (title || 'Untitled Document')
    .replace(/[^\w\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '_');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanFileName || 'Document'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
