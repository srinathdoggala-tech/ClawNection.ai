#!/usr/bin/env node
/**
 * Convert a markdown file to a .docx using the `docx` npm module.
 *
 * Handles a focused subset of markdown sufficient for the HW7 summary:
 *   - Headings (H1-H4)
 *   - Paragraphs with **bold**, *italic*, `inline code`, [links](url)
 *   - Bullet and numbered lists (single level)
 *   - Tables (GFM)
 *   - Code blocks (fenced ```)
 *   - Horizontal rules
 *   - Blockquotes (rendered as indented italic paragraphs)
 *
 * Usage:
 *   node scripts/md-to-docx.mjs <input.md> <output.docx>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  LevelFormat,
  ExternalHyperlink,
  PageOrientation,
} from "docx";

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error("Usage: node scripts/md-to-docx.mjs <input.md> <output.docx>");
  process.exit(1);
}
const [inputPath, outputPath] = args;
const md = readFileSync(inputPath, "utf8");
const tokens = marked.lexer(md);

const PAGE_WIDTH = 12240; // US Letter
const PAGE_HEIGHT = 15840;
const MARGIN_TWIPS = 1080; // 0.75 inch
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_TWIPS; // 10080

const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const cellBorders = { top: border, bottom: border, left: border, right: border };

// ----- Inline parsing: bold/italic/code/links inside a token's children -----

function inlineRuns(inlineTokens) {
  const runs = [];
  for (const t of inlineTokens) {
    if (t.type === "text") {
      // marked sometimes nests inline tokens inside text
      if (t.tokens && t.tokens.length) {
        runs.push(...inlineRuns(t.tokens));
      } else {
        runs.push(new TextRun({ text: t.text }));
      }
    } else if (t.type === "strong") {
      runs.push(...inlineRuns(t.tokens).map(applyBold));
    } else if (t.type === "em") {
      runs.push(...inlineRuns(t.tokens).map(applyItalic));
    } else if (t.type === "codespan") {
      runs.push(
        new TextRun({
          text: t.text,
          font: "Consolas",
          size: 20, // 10pt
          shading: { type: ShadingType.CLEAR, fill: "F3F3F5" },
        }),
      );
    } else if (t.type === "link") {
      runs.push(
        new ExternalHyperlink({
          link: t.href,
          children: inlineRuns(t.tokens).map(applyLink),
        }),
      );
    } else if (t.type === "br") {
      runs.push(new TextRun({ text: "", break: 1 }));
    } else if (t.type === "del") {
      runs.push(...inlineRuns(t.tokens).map(applyStrike));
    } else if (t.type === "html") {
      // ignore inline HTML (e.g. comments) — strip
    } else {
      // fallback: any unknown token with .raw
      if (t.raw) runs.push(new TextRun({ text: t.raw }));
    }
  }
  return runs;
}

// docx-js TextRun is immutable for some props; easier to wrap by reconstructing
function applyBold(run) {
  if (run instanceof ExternalHyperlink) return run;
  return new TextRun({ ...runOptions(run), bold: true });
}
function applyItalic(run) {
  if (run instanceof ExternalHyperlink) return run;
  return new TextRun({ ...runOptions(run), italics: true });
}
function applyStrike(run) {
  if (run instanceof ExternalHyperlink) return run;
  return new TextRun({ ...runOptions(run), strike: true });
}
function applyLink(run) {
  if (run instanceof ExternalHyperlink) return run;
  return new TextRun({ ...runOptions(run), color: "1453B8" });
}
function runOptions(run) {
  // best-effort extraction from a TextRun's options.
  // Since docx-js doesn't expose its options publicly, rely on text + font.
  // For our purposes the raw text is what matters.
  const text = run.options?.text ?? "";
  const opts = { text };
  if (run.options?.font) opts.font = run.options.font;
  if (run.options?.size) opts.size = run.options.size;
  if (run.options?.shading) opts.shading = run.options.shading;
  return opts;
}

// ----- Block-level: turn a token into Paragraph(s) or Table -----

const blocks = [];

function pushParagraph(opts) {
  blocks.push(new Paragraph(opts));
}

for (const tok of tokens) {
  if (tok.type === "heading") {
    const level = tok.depth;
    const headingMap = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
      4: HeadingLevel.HEADING_4,
    };
    pushParagraph({
      heading: headingMap[level] ?? HeadingLevel.HEADING_4,
      children: inlineRuns(tok.tokens),
    });
  } else if (tok.type === "paragraph") {
    pushParagraph({ children: inlineRuns(tok.tokens) });
  } else if (tok.type === "space") {
    // ignore — paragraph spacing handled by docx defaults
  } else if (tok.type === "hr") {
    pushParagraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } },
      children: [new TextRun({ text: "" })],
    });
  } else if (tok.type === "list") {
    for (const item of tok.items) {
      pushParagraph({
        numbering: tok.ordered
          ? { reference: "ordered", level: 0 }
          : { reference: "bullets", level: 0 },
        children: inlineRuns(item.tokens.flatMap((t) => (t.tokens ? t.tokens : [t]))),
      });
    }
  } else if (tok.type === "blockquote") {
    for (const inner of tok.tokens) {
      const innerTokens = inner.tokens ?? [];
      pushParagraph({
        indent: { left: 360 },
        children: inlineRuns(innerTokens).map(applyItalic),
      });
    }
  } else if (tok.type === "code") {
    // code block — render as monospace paragraph
    const lines = tok.text.split("\n");
    for (const line of lines) {
      pushParagraph({
        shading: { type: ShadingType.CLEAR, fill: "F6F6F8" },
        children: [
          new TextRun({
            text: line || " ",
            font: "Consolas",
            size: 18, // 9pt
          }),
        ],
      });
    }
  } else if (tok.type === "table") {
    blocks.push(buildTable(tok));
    // small spacer paragraph after tables
    pushParagraph({ children: [new TextRun({ text: "" })] });
  } else if (tok.type === "html") {
    // strip HTML comments / unsupported HTML
  } else {
    // fallback: stringify
    if (tok.raw) {
      pushParagraph({ children: [new TextRun({ text: tok.raw })] });
    }
  }
}

function buildTable(tok) {
  const numCols = tok.header.length;
  const colWidth = Math.floor(CONTENT_WIDTH / numCols);
  const colWidths = Array(numCols).fill(colWidth);

  const headerCells = tok.header.map(
    (h) =>
      new TableCell({
        borders: cellBorders,
        width: { size: colWidth, type: WidthType.DXA },
        shading: { fill: "F3F3F5", type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: inlineRuns(h.tokens).map(applyBold),
          }),
        ],
      }),
  );
  const headerRow = new TableRow({ children: headerCells, tableHeader: true });

  const bodyRows = tok.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              borders: cellBorders,
              width: { size: colWidth, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: inlineRuns(cell.tokens) })],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...bodyRows],
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } }, // 11pt
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 44, bold: true, font: "Calibri" },
        paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 30, bold: true, font: "Calibri" },
        paragraph: {
          spacing: { before: 280, after: 140 },
          outlineLevel: 1,
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "DDDDE0", space: 1 },
          },
        },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 24, bold: true, font: "Calibri" },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 2 },
      },
      {
        id: "Heading4",
        name: "Heading 4",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 22, bold: true, font: "Calibri" },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 3 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "ordered",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: {
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            orientation: PageOrientation.PORTRAIT,
          },
          margin: {
            top: MARGIN_TWIPS,
            right: MARGIN_TWIPS,
            bottom: MARGIN_TWIPS,
            left: MARGIN_TWIPS,
          },
        },
      },
      children: blocks,
    },
  ],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(outputPath, buf);
const sizeKb = (buf.length / 1024).toFixed(1);
console.log(`✓ ${inputPath} → ${outputPath} (${sizeKb} KB)`);
