#!/usr/bin/env node
/**
 * Build the HW10 final-presentation deck for Clawnection.
 *
 * 10 slides covering: problem → what we built → why agentic → architecture
 * → experiments → THE DISCOVERY (rubber-stamp problem) → the fix →
 * outcome distribution restored → what worked/failed/next → thanks.
 *
 * Visual treatment:
 *  - Sandwich structure: dark berry title + closing, light content between
 *  - Wine/berry palette matching the app brand (no generic blue)
 *  - Varied layouts per slide (no template repeated)
 *  - One consistent motif: berry "pill" kicker labels + coral stat callouts
 *
 * Outputs:
 *   ~/Desktop/clawnection-homework/HW10_DECK.pptx
 *
 * Usage:
 *   node scripts/build-hw10-deck.mjs
 */

import pptxgen from "pptxgenjs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================
// Palette + tokens
// ============================================================

const COL = {
  // Brand
  berry_dark: "2D0F1A",     // very deep berry — title/closing background
  berry: "6D2E46",          // primary brand
  berry_soft: "C4A7B0",     // muted rose — secondary text on dark
  coral: "F96167",          // accent / stat callouts
  coral_soft: "FBC1C3",     // pill backgrounds on light slides
  // Neutrals
  ink: "1C1C1F",            // primary text on light
  ink_secondary: "5C5C66",  // secondary text on light
  ink_muted: "8E8E97",      // tertiary text on light
  white: "FFFFFF",
  off_white: "F8F1F4",      // primary text on dark
  rule: "E5E1E3",           // dividers on light
  surface_card: "F3EEF1",   // panel/card background on light
};

const FONT_HEADER = "Calibri";
const FONT_BODY = "Calibri";

// 16:9 widescreen
const W = 13.33;
const H = 7.5;

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.title = "Clawnection · HW10 final presentation";
pptx.author = "Demetri / Clawnection team";
pptx.company = "MIT 6.S986 Agentic Infrastructure";

// Master slide for content slides — left-edge berry brand mark
pptx.defineSlideMaster({
  title: "CONTENT_LIGHT",
  background: { color: COL.white },
  objects: [
    // Left-edge brand mark — a small berry square top-left
    {
      rect: {
        x: 0.5, y: 0.5, w: 0.18, h: 0.18,
        fill: { color: COL.berry },
        line: { color: COL.berry, width: 0 },
      },
    },
    // Footer rule
    {
      line: {
        x: 0.5, y: H - 0.45, w: W - 1.0, h: 0,
        line: { color: COL.rule, width: 0.5 },
      },
    },
    // Footer left
    {
      text: {
        text: "Clawnection · MIT 6.S986",
        options: {
          x: 0.5, y: H - 0.4, w: 4, h: 0.3,
          fontSize: 9, fontFace: FONT_BODY, color: COL.ink_muted,
        },
      },
    },
    // Footer right (slide num)
    {
      text: {
        text: "clawnection.com",
        options: {
          x: W - 4.5, y: H - 0.4, w: 4, h: 0.3,
          fontSize: 9, fontFace: FONT_BODY, color: COL.ink_muted,
          align: "right",
        },
      },
    },
  ],
});

// ============================================================
// Helpers
// ============================================================

function pillLabel(slide, x, y, text, opts = {}) {
  const fillColor = opts.fill || COL.berry;
  const textColor = opts.color || COL.white;
  slide.addText(text, {
    x, y, w: opts.w || 1.6, h: 0.28,
    fontSize: 9, fontFace: FONT_HEADER, bold: true,
    color: textColor,
    fill: { color: fillColor },
    align: "center", valign: "middle",
    rectRadius: 0.14,
    charSpacing: 2,
  });
}

function kickerLabel(slide, x, y, text) {
  slide.addText(text, {
    x, y, w: 5, h: 0.3,
    fontSize: 10, fontFace: FONT_HEADER, bold: true,
    color: COL.berry, charSpacing: 3,
  });
}

function bigTitle(slide, x, y, w, text, opts = {}) {
  slide.addText(text, {
    x, y, w, h: opts.h || 1.4,
    fontSize: opts.size || 36, fontFace: FONT_HEADER, bold: true,
    color: opts.color || COL.ink,
    valign: "top",
  });
}

function bodyText(slide, x, y, w, h, text, opts = {}) {
  slide.addText(text, {
    x, y, w, h,
    fontSize: opts.size || 14, fontFace: FONT_BODY,
    color: opts.color || COL.ink_secondary,
    valign: opts.valign || "top",
    align: opts.align || "left",
    bold: opts.bold || false,
    italic: opts.italic || false,
  });
}

// Numbered step circle + caption (used on slide 3)
function numberedStep(slide, x, y, num, label, desc) {
  // Coral filled circle with number
  slide.addShape("ellipse", {
    x, y, w: 0.7, h: 0.7,
    fill: { color: COL.coral },
    line: { color: COL.coral, width: 0 },
  });
  slide.addText(String(num), {
    x, y, w: 0.7, h: 0.7,
    fontSize: 24, fontFace: FONT_HEADER, bold: true,
    color: COL.white, align: "center", valign: "middle",
  });
  // Label
  slide.addText(label, {
    x: x - 0.6, y: y + 0.85, w: 1.9, h: 0.35,
    fontSize: 14, fontFace: FONT_HEADER, bold: true,
    color: COL.ink, align: "center",
  });
  // Description
  slide.addText(desc, {
    x: x - 0.7, y: y + 1.2, w: 2.1, h: 1.0,
    fontSize: 11, fontFace: FONT_BODY, color: COL.ink_secondary,
    align: "center",
  });
}

// Stat callout — big number + small label
function statCallout(slide, x, y, w, num, label, opts = {}) {
  slide.addText(num, {
    x, y, w, h: 1.0,
    fontSize: opts.numSize || 56, fontFace: FONT_HEADER, bold: true,
    color: opts.numColor || COL.coral,
    align: "left", valign: "middle",
  });
  slide.addText(label, {
    x, y: y + 0.95, w, h: 0.5,
    fontSize: 11, fontFace: FONT_BODY, color: COL.ink_secondary,
    align: "left", valign: "top",
  });
}

// Card container (rounded, soft fill)
function card(slide, x, y, w, h, fillColor) {
  slide.addShape("roundRect", {
    x, y, w, h,
    fill: { color: fillColor || COL.surface_card },
    line: { color: COL.rule, width: 0.75 },
    rectRadius: 0.08,
  });
}

// ============================================================
// SLIDE 1 — Title (dark)
// ============================================================
{
  const s = pptx.addSlide();
  s.background = { color: COL.berry_dark };
  // Top-left brand mark
  s.addShape("rect", {
    x: 0.6, y: 0.6, w: 0.22, h: 0.22,
    fill: { color: COL.coral }, line: { color: COL.coral, width: 0 },
  });
  s.addText("CLAWNECTION", {
    x: 0.95, y: 0.55, w: 6, h: 0.35,
    fontSize: 12, fontFace: FONT_HEADER, bold: true,
    color: COL.off_white, charSpacing: 8,
  });

  // Centerpiece title
  s.addText("AI agents go on virtual\ndates so humans don't\nhave to.", {
    x: 0.6, y: 2.0, w: 12, h: 3.4,
    fontSize: 54, fontFace: FONT_HEADER, bold: true,
    color: COL.white, valign: "top",
    paraSpaceAfter: 0,
  });

  // Subtitle
  s.addText("An agentic dating platform — built on Cloudflare Workers, driven by Claude.", {
    x: 0.6, y: 5.2, w: 12, h: 0.5,
    fontSize: 18, fontFace: FONT_BODY,
    color: COL.berry_soft, italic: true,
  });

  // Bottom strip
  s.addShape("line", {
    x: 0.6, y: H - 1.1, w: W - 1.2, h: 0,
    line: { color: COL.berry, width: 1 },
  });
  s.addText("MIT 6.S986 Agentic Infrastructure · Spring 2026", {
    x: 0.6, y: H - 0.95, w: 7, h: 0.4,
    fontSize: 12, fontFace: FONT_BODY, color: COL.berry_soft,
  });
  s.addText("clawnection.com", {
    x: W - 4.6, y: H - 0.95, w: 4, h: 0.4,
    fontSize: 12, fontFace: FONT_HEADER, bold: true, color: COL.coral,
    align: "right",
  });
}

// ============================================================
// SLIDE 2 — The problem (two-column)
// ============================================================
{
  const s = pptx.addSlide({ masterName: "CONTENT_LIGHT" });
  kickerLabel(s, 1.0, 0.8, "THE PROBLEM");
  bigTitle(s, 1.0, 1.2, 11, "First dates are expensive. Most don't work.");

  // LEFT column — three cost items
  const leftX = 1.0, leftY = 3.1, leftW = 5.5;
  s.addText("THE COST OF EACH ONE", {
    x: leftX, y: leftY, w: leftW, h: 0.3,
    fontSize: 10, fontFace: FONT_HEADER, bold: true,
    color: COL.berry, charSpacing: 2,
  });
  const items = [
    ["~3 hours", "of an evening you can't get back"],
    ["~$60", "drinks, dinner, getting there"],
    ["Real emotional cost", "showing up, opening up, being judged"],
  ];
  items.forEach(([num, desc], i) => {
    const y = leftY + 0.55 + i * 1.0;
    s.addShape("ellipse", {
      x: leftX, y: y + 0.18, w: 0.18, h: 0.18,
      fill: { color: COL.coral }, line: { color: COL.coral, width: 0 },
    });
    s.addText(num, {
      x: leftX + 0.35, y, w: leftW - 0.4, h: 0.45,
      fontSize: 18, fontFace: FONT_HEADER, bold: true, color: COL.ink,
    });
    s.addText(desc, {
      x: leftX + 0.35, y: y + 0.4, w: leftW - 0.4, h: 0.4,
      fontSize: 12, fontFace: FONT_BODY, color: COL.ink_secondary,
    });
  });

  // RIGHT column — the question
  const rightX = 7.3, rightY = 2.8;
  card(s, rightX, rightY, 5.0, 3.5, COL.surface_card);
  s.addText("THE QUESTION", {
    x: rightX + 0.4, y: rightY + 0.3, w: 4.2, h: 0.3,
    fontSize: 10, fontFace: FONT_HEADER, bold: true,
    color: COL.berry, charSpacing: 2,
  });
  s.addText("What if your AI agent could do the first one for you?", {
    x: rightX + 0.4, y: rightY + 0.7, w: 4.2, h: 2.6,
    fontSize: 22, fontFace: FONT_HEADER, bold: true,
    color: COL.ink, valign: "top", italic: true,
  });
}

// ============================================================
// SLIDE 3 — What we built (4-step horizontal flow)
// ============================================================
{
  const s = pptx.addSlide({ masterName: "CONTENT_LIGHT" });
  kickerLabel(s, 1.0, 0.8, "WHAT WE BUILT");
  bigTitle(s, 1.0, 1.2, 11, "Two agents. Four turns. One honest verdict.");

  // 4 numbered steps across the slide
  const steps = [
    [1, "Screen", "Both agents check the invite for hard signals — dealbreakers, intent mismatch, age."],
    [2, "Converse", "If both accept, four-turn exchange composed by Claude in each persona's voice."],
    [3, "Verdict", "Each agent independently scores 7 compatibility dimensions + a counterfactual probe."],
    [4, "Recommend", "Mutual yes only when both agents clear the bar. Otherwise the humans never meet."],
  ];
  const startX = 1.4;
  const stepW = 2.6;
  steps.forEach(([n, label, desc], i) => {
    numberedStep(s, startX + i * stepW, 3.4, n, label, desc);
  });

  // Bottom strip — three "why agentic" mini-callouts
  const stripY = 6.0;
  const stripW = 3.7;
  const stripH = 0.7;
  const stripGap = 0.15;
  const stripStart = 1.0;
  const callouts = [
    "Per-side autonomy",
    "Runtime-agnostic agents",
    "Discriminating evaluation",
  ];
  callouts.forEach((label, i) => {
    const x = stripStart + i * (stripW + stripGap);
    s.addShape("roundRect", {
      x, y: stripY, w: stripW, h: stripH,
      fill: { color: COL.surface_card },
      line: { color: COL.rule, width: 0.5 },
      rectRadius: 0.08,
    });
    s.addText("WHY AGENTIC", {
      x: x + 0.25, y: stripY + 0.1, w: stripW - 0.5, h: 0.25,
      fontSize: 8, fontFace: FONT_HEADER, bold: true, color: COL.berry,
      charSpacing: 2,
    });
    s.addText(label, {
      x: x + 0.25, y: stripY + 0.32, w: stripW - 0.5, h: 0.35,
      fontSize: 13, fontFace: FONT_HEADER, bold: true, color: COL.ink,
    });
  });
}

// ============================================================
// SLIDE 4 — Architecture
// ============================================================
{
  const s = pptx.addSlide({ masterName: "CONTENT_LIGHT" });
  kickerLabel(s, 1.0, 0.8, "ARCHITECTURE");
  bigTitle(s, 1.0, 1.2, 11, "All on Cloudflare. One worker. Many agents.");

  // LEFT — diagram boxes
  const dx = 1.0, dy = 3.0, boxW = 3.0, boxH = 0.85, gap = 0.25;
  const boxes = [
    ["Browser", "Next.js client"],
    ["Cloudflare Worker", "fetch() · scheduled() · D1 binding"],
    ["External agents", "Claude Desktop · MCP · BYOA via /api/agent/*"],
  ];
  boxes.forEach(([title, sub], i) => {
    const y = dy + i * (boxH + gap + 0.25);
    s.addShape("roundRect", {
      x: dx, y, w: boxW, h: boxH,
      fill: { color: COL.surface_card },
      line: { color: COL.berry, width: 1 },
      rectRadius: 0.06,
    });
    s.addText(title, {
      x: dx + 0.2, y: y + 0.08, w: boxW - 0.4, h: 0.35,
      fontSize: 14, fontFace: FONT_HEADER, bold: true, color: COL.ink,
    });
    s.addText(sub, {
      x: dx + 0.2, y: y + 0.45, w: boxW - 0.4, h: 0.35,
      fontSize: 10, fontFace: FONT_BODY, color: COL.ink_secondary,
    });
    // Arrow down to next box (except last)
    if (i < boxes.length - 1) {
      const ax = dx + boxW / 2;
      const ay = y + boxH + 0.05;
      s.addShape("line", {
        x: ax, y: ay, w: 0, h: 0.3,
        line: { color: COL.berry, width: 1.5 },
      });
      // Small arrowhead via tiny triangle
      s.addShape("triangle", {
        x: ax - 0.08, y: ay + 0.27, w: 0.16, h: 0.12,
        fill: { color: COL.berry }, line: { color: COL.berry, width: 0 },
        rotate: 180,
      });
    }
  });

  // RIGHT — three big stat callouts
  const sx = 5.5;
  statCallout(s, sx, 2.8, 7, "40+", "active cloud agents on Cloudflare Workers", { numColor: COL.berry });
  statCallout(s, sx, 4.3, 7, "*/2 min", "scheduled() cron — sub-5-min full fleet cycle", { numColor: COL.berry });
  statCallout(s, sx, 5.7, 7, "10 D1 tables", "profiles · agents · dates · messages · verdicts · …", { numColor: COL.berry, numSize: 36 });
}

// ============================================================
// SLIDE 5 — Experiments (HW7 + HW8)
// ============================================================
{
  const s = pptx.addSlide({ masterName: "CONTENT_LIGHT" });
  kickerLabel(s, 1.0, 0.8, "WHAT WE TESTED");
  bigTitle(s, 1.0, 1.2, 11, "38 dates. 3 distinct experiments.");

  const cardY = 3.2, cardH = 3.2, cardW = 3.7;
  const cardGap = 0.25;
  const cardStartX = 1.0;
  const experiments = [
    {
      tag: "HW7 · E1",
      title: "Persona richness ablation",
      conditions: "rich / medium / thin slicing of the agent's view of its own persona",
      finding: "Slicing was recipient-asymmetric — the deciding side was always rich, so condition couldn't matter.",
    },
    {
      tag: "HW7 · E2 + E3",
      title: "Model swap + honesty preamble",
      conditions: "Haiku 4.5 vs Sonnet 4.6 · standard vs honesty-emphasized verdict prompt",
      finding: "~12× cost difference for equivalent verdicts. Honesty preamble changed reasoning behavior, not outcomes.",
    },
    {
      tag: "HW8 · scaled",
      title: "Path A flip + concurrency",
      conditions: "27 dates fired simultaneously, dealbreaker-holder as recipient",
      finding: "Original hypothesis confirmed (3/3 vs 0/3 catch). Cron tick latency went 2-3s → 21s p95 at burst.",
    },
  ];
  experiments.forEach((e, i) => {
    const x = cardStartX + i * (cardW + cardGap);
    card(s, x, cardY, cardW, cardH, COL.white);
    // Pill tag
    pillLabel(s, x + 0.3, cardY + 0.3, e.tag, { w: 1.5 });
    // Title
    s.addText(e.title, {
      x: x + 0.3, y: cardY + 0.7, w: cardW - 0.6, h: 0.6,
      fontSize: 16, fontFace: FONT_HEADER, bold: true, color: COL.ink,
      valign: "top",
    });
    // Conditions label
    s.addText("CONDITIONS", {
      x: x + 0.3, y: cardY + 1.45, w: cardW - 0.6, h: 0.25,
      fontSize: 8, fontFace: FONT_HEADER, bold: true, color: COL.ink_muted,
      charSpacing: 2,
    });
    s.addText(e.conditions, {
      x: x + 0.3, y: cardY + 1.7, w: cardW - 0.6, h: 0.7,
      fontSize: 11, fontFace: FONT_BODY, color: COL.ink_secondary,
      valign: "top",
    });
    // Divider
    s.addShape("line", {
      x: x + 0.3, y: cardY + 2.4, w: cardW - 0.6, h: 0,
      line: { color: COL.rule, width: 0.5 },
    });
    // Finding
    s.addText("KEY FINDING", {
      x: x + 0.3, y: cardY + 2.5, w: cardW - 0.6, h: 0.25,
      fontSize: 8, fontFace: FONT_HEADER, bold: true, color: COL.berry,
      charSpacing: 2,
    });
    s.addText(e.finding, {
      x: x + 0.3, y: cardY + 2.75, w: cardW - 0.6, h: cardH - 2.85,
      fontSize: 10, fontFace: FONT_BODY, color: COL.ink, italic: true,
      valign: "top",
    });
  });
}

// ============================================================
// SLIDE 6 — THE DISCOVERY (climax)
// ============================================================
{
  const s = pptx.addSlide();
  s.background = { color: COL.berry_dark };

  // Top kicker pill
  pillLabel(s, 0.9, 0.8, "THE DISCOVERY", { fill: COL.coral, w: 1.7 });

  // Big stat
  s.addText("20/20", {
    x: 0.7, y: 1.5, w: 6, h: 2.8,
    fontSize: 200, fontFace: FONT_HEADER, bold: true,
    color: COL.coral, valign: "middle",
  });

  // Headline
  s.addText("Every completed date ended in mutual yes.", {
    x: 6.8, y: 2.0, w: 6.0, h: 1.8,
    fontSize: 32, fontFace: FONT_HEADER, bold: true,
    color: COL.white, valign: "top",
  });

  // Sub
  s.addText("38 dates run across HW7 + HW8. 18 declined at invite. Of the 20 that completed and reached verdicts, every single one was a mutual yes.", {
    x: 6.8, y: 4.0, w: 6.0, h: 1.5,
    fontSize: 14, fontFace: FONT_BODY, color: COL.berry_soft,
    valign: "top",
  });

  // Conclusion
  s.addShape("line", {
    x: 6.8, y: 5.5, w: 5.5, h: 0,
    line: { color: COL.coral, width: 1 },
  });
  s.addText("We had built a sophisticated dealbreaker checker.", {
    x: 6.8, y: 5.7, w: 6.0, h: 1.0,
    fontSize: 18, fontFace: FONT_HEADER, bold: true, italic: true,
    color: COL.coral, valign: "top",
  });

  // Bottom note
  s.addText("Outcome 2 — 'had-the-date-no-thanks' — never happened.", {
    x: 0.6, y: H - 0.7, w: W - 1.2, h: 0.4,
    fontSize: 12, fontFace: FONT_BODY, color: COL.berry_soft,
    italic: true,
  });
}

// ============================================================
// SLIDE 7 — The fix (3 columns)
// ============================================================
{
  const s = pptx.addSlide({ masterName: "CONTENT_LIGHT" });
  kickerLabel(s, 1.0, 0.8, "THE FIX");
  bigTitle(s, 1.0, 1.2, 11, "Three coordinated changes.");

  const fixes = [
    {
      n: 1,
      title: "Soft-signal persona schema",
      detail: "Added 4 nullable fields: pet_peeves, current_life_context, wants_to_avoid, past_pattern_to_break. The middle band where most real first-date 'no' verdicts live.",
    },
    {
      n: 2,
      title: "Architectural separation",
      detail: "Invite-step view strips soft signals — hard filters at the gate. Verdict-step view sees everything. Without this, soft signals function as effective dealbreakers.",
    },
    {
      n: 3,
      title: "Multi-dimensional verdict prompt",
      detail: "Score 7 dimensions independently (chemistry, comm-style, life-stage, values, intent, lifestyle, logistics). Counterfactual probe. Default-NO unless ALL clear 7+.",
    },
  ];

  const colY = 3.2, colH = 3.5, colW = 3.7, colGap = 0.25;
  const colStartX = 1.0;
  fixes.forEach((f, i) => {
    const x = colStartX + i * (colW + colGap);
    card(s, x, colY, colW, colH, COL.white);
    // Big number on the left of the card
    s.addText(`0${f.n}`, {
      x: x + 0.25, y: colY + 0.25, w: 1.3, h: 0.9,
      fontSize: 48, fontFace: FONT_HEADER, bold: true, color: COL.coral,
      valign: "top",
    });
    s.addText(f.title, {
      x: x + 0.3, y: colY + 1.2, w: colW - 0.6, h: 0.7,
      fontSize: 16, fontFace: FONT_HEADER, bold: true, color: COL.ink,
      valign: "top",
    });
    s.addText(f.detail, {
      x: x + 0.3, y: colY + 1.95, w: colW - 0.6, h: colH - 2.1,
      fontSize: 11, fontFace: FONT_BODY, color: COL.ink_secondary,
      valign: "top",
    });
  });
}

// ============================================================
// SLIDE 8 — Outcome distribution restored (the punchline)
// ============================================================
{
  const s = pptx.addSlide({ masterName: "CONTENT_LIGHT" });
  kickerLabel(s, 1.0, 0.8, "RESULT");
  bigTitle(s, 1.0, 1.2, 11, "Realistic 4-outcome distribution restored.");

  // BEFORE / AFTER side-by-side tables
  const tableY = 3.0;
  const tableH = 2.6;
  const tableW = 5.6;
  const beforeX = 1.0;
  const afterX = 6.8;
  const rowH = 0.5;

  // BEFORE
  card(s, beforeX, tableY, tableW, tableH, COL.surface_card);
  s.addText("BEFORE THE FIX", {
    x: beforeX + 0.3, y: tableY + 0.2, w: tableW - 0.6, h: 0.3,
    fontSize: 9, fontFace: FONT_HEADER, bold: true, color: COL.ink_muted, charSpacing: 2,
  });
  s.addText("HW7 + HW8 · 38 dates", {
    x: beforeX + 0.3, y: tableY + 0.5, w: tableW - 0.6, h: 0.4,
    fontSize: 14, fontFace: FONT_HEADER, bold: true, color: COL.ink,
  });
  const beforeRows = [
    ["Decline at invite", "47%", COL.ink],
    ["Mutual NO", "0%", COL.ink_muted],
    ["Asymmetric", "0%", COL.ink_muted],
    ["Mutual YES", "53%", COL.coral],
  ];
  beforeRows.forEach(([label, pct, color], i) => {
    const ry = tableY + 1.05 + i * rowH;
    s.addText(label, {
      x: beforeX + 0.4, y: ry, w: tableW - 1.7, h: rowH,
      fontSize: 12, fontFace: FONT_BODY, color: color, valign: "middle",
    });
    s.addText(pct, {
      x: beforeX + tableW - 1.4, y: ry, w: 1.0, h: rowH,
      fontSize: 14, fontFace: FONT_HEADER, bold: true, color: color,
      align: "right", valign: "middle",
    });
  });

  // AFTER
  card(s, afterX, tableY, tableW, tableH, COL.surface_card);
  s.addText("AFTER THE FIX", {
    x: afterX + 0.3, y: tableY + 0.2, w: tableW - 0.6, h: 0.3,
    fontSize: 9, fontFace: FONT_HEADER, bold: true, color: COL.berry, charSpacing: 2,
  });
  s.addText("Verdict redesign · 9 dates", {
    x: afterX + 0.3, y: tableY + 0.5, w: tableW - 0.6, h: 0.4,
    fontSize: 14, fontFace: FONT_HEADER, bold: true, color: COL.ink,
  });
  const afterRows = [
    ["Decline at invite", "11%", COL.ink],
    ["Mutual NO", "56%", COL.coral],
    ["Asymmetric", "11%", COL.coral],
    ["Mutual YES", "22%", COL.ink],
  ];
  afterRows.forEach(([label, pct, color], i) => {
    const ry = tableY + 1.05 + i * rowH;
    s.addText(label, {
      x: afterX + 0.4, y: ry, w: tableW - 1.7, h: rowH,
      fontSize: 12, fontFace: FONT_BODY, color: color, valign: "middle",
      bold: color === COL.coral,
    });
    s.addText(pct, {
      x: afterX + tableW - 1.4, y: ry, w: 1.0, h: rowH,
      fontSize: 14, fontFace: FONT_HEADER, bold: true, color: color,
      align: "right", valign: "middle",
    });
  });

  // Bottom — sample agent reasoning quote
  const quoteY = tableY + tableH + 0.35;
  s.addShape("rect", {
    x: 1.0, y: quoteY, w: 0.08, h: 1.05,
    fill: { color: COL.coral }, line: { color: COL.coral, width: 0 },
  });
  s.addText("Sample verdict reasoning · D5 Vera↔Jude (mutual NO)", {
    x: 1.25, y: quoteY, w: 11, h: 0.3,
    fontSize: 9, fontFace: FONT_HEADER, bold: true, color: COL.berry, charSpacing: 2,
  });
  s.addText("\"This is not a misunderstanding to resolve over coffee — it's a structural incompatibility that both parties have now named clearly. Proceeding would be kind but not honest.\"", {
    x: 1.25, y: quoteY + 0.3, w: 11.0, h: 0.75,
    fontSize: 13, fontFace: FONT_BODY, color: COL.ink, italic: true,
    valign: "top",
  });
}

// ============================================================
// SLIDE 9 — What worked / failed / next
// ============================================================
{
  const s = pptx.addSlide({ masterName: "CONTENT_LIGHT" });
  kickerLabel(s, 1.0, 0.8, "WORKED · FAILED · NEXT");
  bigTitle(s, 1.0, 1.2, 11, "What we'd take to production. What we'd cut. What's next.");

  const colY = 3.0, colH = 3.7, colW = 3.7, colGap = 0.25;
  const colStartX = 1.0;
  const cols = [
    {
      tag: "WORKED",
      tagColor: COL.coral,
      items: [
        "Cron migration to Cloudflare native — went from ~50min throttle to reliable 2-min ticks",
        "Scale resilience — 27 concurrent dates degraded gracefully (slower, no failures)",
        "Verdict redesign produced real outcome diversity — 4 distinct outcomes vs 2",
      ],
    },
    {
      tag: "FAILED",
      tagColor: COL.berry,
      items: [
        "GitHub Actions cron throttled to ~once/hour — wasted half a session diagnosing",
        "Voice onboarding pending production Vapi — soft-disabled for the demo",
        "Original test fleet was too compatible — couldn't surface conflicts until we hand-crafted borderline pairs",
      ],
    },
    {
      tag: "NEXT",
      tagColor: COL.ink,
      items: [
        "Diverse persona seed population — current 20 bots are too uniform",
        "Variable conversation length — let agents end early when they've heard enough",
        "Adversarial reviewer agent — third LLM that interrogates the verdict before it ships",
      ],
    },
  ];
  cols.forEach((c, i) => {
    const x = colStartX + i * (colW + colGap);
    card(s, x, colY, colW, colH, COL.white);
    // Tag pill
    pillLabel(s, x + 0.3, colY + 0.3, c.tag, { fill: c.tagColor, w: 1.3 });
    // Items
    c.items.forEach((item, j) => {
      const iy = colY + 0.95 + j * 0.95;
      s.addShape("ellipse", {
        x: x + 0.3, y: iy + 0.12, w: 0.12, h: 0.12,
        fill: { color: c.tagColor }, line: { color: c.tagColor, width: 0 },
      });
      s.addText(item, {
        x: x + 0.55, y: iy, w: colW - 0.85, h: 0.85,
        fontSize: 11, fontFace: FONT_BODY, color: COL.ink_secondary,
        valign: "top",
      });
    });
  });
}

// ============================================================
// SLIDE 10 — Thanks + links (dark, mirrors title)
// ============================================================
{
  const s = pptx.addSlide();
  s.background = { color: COL.berry_dark };

  // Top-left brand mark
  s.addShape("rect", {
    x: 0.6, y: 0.6, w: 0.22, h: 0.22,
    fill: { color: COL.coral }, line: { color: COL.coral, width: 0 },
  });
  s.addText("CLAWNECTION", {
    x: 0.95, y: 0.55, w: 6, h: 0.35,
    fontSize: 12, fontFace: FONT_HEADER, bold: true,
    color: COL.off_white, charSpacing: 8,
  });

  // Center thanks
  s.addText("Thanks.", {
    x: 0.6, y: 2.6, w: W - 1.2, h: 1.5,
    fontSize: 96, fontFace: FONT_HEADER, bold: true,
    color: COL.white, align: "center", valign: "middle",
  });

  // Subtitle
  s.addText("Try it, fork it, break it.", {
    x: 0.6, y: 4.1, w: W - 1.2, h: 0.6,
    fontSize: 22, fontFace: FONT_BODY, italic: true,
    color: COL.berry_soft, align: "center",
  });

  // Links
  const linkY = 5.5;
  const linkW = 4.0;
  const linksStartX = (W - 3 * linkW - 2 * 0.3) / 2;
  const links = [
    ["LIVE", "clawnection.com"],
    ["DOCS", "clawnection.com/docs"],
    ["GITHUB", "github.com/deesemailfortesting-eng/clawnection-agentic"],
  ];
  links.forEach(([label, url], i) => {
    const x = linksStartX + i * (linkW + 0.3);
    s.addText(label, {
      x, y: linkY, w: linkW, h: 0.3,
      fontSize: 9, fontFace: FONT_HEADER, bold: true, color: COL.coral,
      align: "center", charSpacing: 3,
    });
    s.addText(url, {
      x, y: linkY + 0.32, w: linkW, h: 0.4,
      fontSize: 13, fontFace: FONT_BODY, color: COL.white,
      align: "center",
    });
  });

  // Footer
  s.addShape("line", {
    x: 0.6, y: H - 0.85, w: W - 1.2, h: 0,
    line: { color: COL.berry, width: 1 },
  });
  s.addText("MIT 6.S986 Agentic Infrastructure · Spring 2026 · Demetri & the Clawnection team", {
    x: 0.6, y: H - 0.7, w: W - 1.2, h: 0.4,
    fontSize: 11, fontFace: FONT_BODY, color: COL.berry_soft, align: "center",
  });
}

// ============================================================
// Write
// ============================================================

const outPath = join(homedir(), "Desktop", "clawnection-homework", "HW10_DECK.pptx");
await pptx.writeFile({ fileName: outPath });
console.log(`✓ wrote ${outPath}`);
