#!/usr/bin/env node
/**
 * Convert markdown files to PDFs using marked (md→HTML) + Puppeteer (HTML→PDF).
 *
 * Usage:
 *   node scripts/md-to-pdf.mjs <input.md> <output.pdf>
 *   node scripts/md-to-pdf.mjs --batch <inputDir> <outputDir>
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { marked } from "marked";
import puppeteer from "puppeteer";

const args = process.argv.slice(2);
let inputs = [];
let outputs = [];

if (args[0] === "--batch") {
  const inputDir = args[1];
  const outputDir = args[2];
  if (!inputDir || !outputDir) {
    console.error("Usage: --batch <inputDir> <outputDir>");
    process.exit(1);
  }
  mkdirSync(outputDir, { recursive: true });
  for (const f of readdirSync(inputDir)) {
    if (extname(f).toLowerCase() !== ".md") continue;
    inputs.push(join(inputDir, f));
    outputs.push(join(outputDir, basename(f, ".md") + ".pdf"));
  }
} else {
  if (!args[0] || !args[1]) {
    console.error("Usage: <input.md> <output.pdf>  OR  --batch <inputDir> <outputDir>");
    process.exit(1);
  }
  inputs = [args[0]];
  outputs = [args[1]];
}

const css = `
@page { size: Letter; margin: 0.75in 0.85in; }
* { box-sizing: border-box; }
body {
  font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.55;
  color: #1c1c1f;
  margin: 0;
  padding: 0;
}
h1 { font-size: 22pt; margin: 0 0 0.4em; line-height: 1.2; }
h2 { font-size: 14pt; margin: 1.1em 0 0.4em; padding-bottom: 0.15em; border-bottom: 1px solid #e0e0e6; }
h3 { font-size: 12pt; margin: 0.95em 0 0.3em; }
h4 { font-size: 11pt; margin: 0.85em 0 0.25em; }
p { margin: 0 0 0.65em; }
ul, ol { margin: 0 0 0.65em 1.4em; padding: 0; }
li { margin: 0.1em 0; }
li > p { margin: 0.1em 0; }
code {
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 9.5pt;
  background: #f3f3f5;
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
pre {
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 9pt;
  background: #f6f6f8;
  border: 1px solid #e5e5ea;
  border-radius: 4px;
  padding: 0.7em 0.9em;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0 0 0.75em;
  line-height: 1.4;
}
pre code { background: transparent; padding: 0; font-size: inherit; }
blockquote {
  border-left: 3px solid #c8c8d0;
  margin: 0.5em 0 0.75em;
  padding: 0.1em 0.9em;
  color: #555;
}
table {
  border-collapse: collapse;
  margin: 0.6em 0 0.85em;
  width: 100%;
  font-size: 10pt;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid #d4d4d8;
  padding: 0.35em 0.55em;
  text-align: left;
  vertical-align: top;
}
th { background: #f3f3f5; font-weight: 600; }
a { color: #1453b8; text-decoration: none; }
hr { border: 0; border-top: 1px solid #d4d4d8; margin: 1em 0; }
strong { font-weight: 600; }
`;

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  for (let i = 0; i < inputs.length; i++) {
    const inputPath = inputs[i];
    const outputPath = outputs[i];
    const md = readFileSync(inputPath, "utf8");
    const bodyHtml = marked.parse(md);
    const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>${basename(inputPath)}</title>
<style>${css}</style>
</head><body>${bodyHtml}</body></html>`;

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const buf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.close();
    writeFileSync(outputPath, buf);
    const sizeKb = (buf.length / 1024).toFixed(1);
    console.log(`✓ ${inputPath} → ${outputPath} (${sizeKb} KB)`);
    void statSync(outputPath);
  }
} finally {
  await browser.close();
}
