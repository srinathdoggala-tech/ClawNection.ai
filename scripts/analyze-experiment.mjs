#!/usr/bin/env node
/**
 * Analyze E1 (persona-richness ablation) results.
 *
 * Reads experiment-runs.local.json (manifest from run-experiment.mjs),
 * fetches each date's full detail via /api/public/dates/[id], and
 * computes per-condition metrics:
 *   - completion rate     (% of dates that reached `completed` status)
 *   - mutual match rate   (% of completed dates where both agents said yes)
 *   - subject yes rate    (% of completed dates where the subject said yes)
 *   - counterpart yes rate
 *   - verdict agreement   (% of completed dates where both verdicts had same wouldMeetIrl)
 *   - avg subject reasoning length
 *   - avg turns to completion
 *   - decline-on-mismatch rate
 *     (% of dates where the SUBJECT declined OR voted no, when the recipient
 *      had a clear dealbreaker conflict with the subject)
 *
 * Outputs:
 *   - stdout summary table
 *   - experiment-results.local.md (1-page report, copy-paste ready)
 *
 * Usage:
 *   node scripts/analyze-experiment.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

try {
  const text = readFileSync(join(REPO_ROOT, ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE_URL =
  process.env.CLAWNECTION_BASE_URL ||
  "https://clawnection-agentic.deesemailfortesting.workers.dev";

const manifestPath = join(REPO_ROOT, "experiment-runs.local.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

async function fetchDate(id) {
  const r = await fetch(`${BASE_URL}/api/public/dates/${id}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${id}`);
  return r.json();
}

function pct(num, den) {
  if (den === 0) return "—";
  return `${((num / den) * 100).toFixed(0)}%`;
}

function mean(xs) {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

(async () => {
  console.log(`[analyze] reading ${manifest.dates.length} dates from manifest…`);

  const byCondition = {};
  for (const d of manifest.dates) {
    if (!byCondition[d.condition]) byCondition[d.condition] = [];
    byCondition[d.condition].push(d);
  }

  const results = {};
  for (const [condition, dates] of Object.entries(byCondition)) {
    const detailed = await Promise.all(
      dates.map(async (d) => {
        try {
          const det = await fetchDate(d.dateId);
          return { manifest: d, detail: det };
        } catch (err) {
          console.error(`  ✗ ${d.dateId}: ${err.message}`);
          return null;
        }
      }),
    );
    results[condition] = detailed.filter(Boolean);
  }

  // ---- Compute metrics per condition ----

  const conditions = ["rich", "medium", "thin"];
  const rows = [];

  for (const c of conditions) {
    const items = results[c] ?? [];
    const total = items.length;
    if (total === 0) {
      rows.push({ condition: c, total: 0, note: "no data" });
      continue;
    }

    const completed = items.filter((i) => i.detail.date.status === "completed");
    const declined = items.filter((i) => i.detail.date.status === "declined");
    const active = items.filter((i) => !["completed", "declined"].includes(i.detail.date.status));

    const subjectVerdicts = completed
      .map((i) => {
        const subjectAgentId = i.manifest.subjectAgentId;
        const isInitiator = i.detail.initiator.id === subjectAgentId;
        return isInitiator ? i.detail.verdicts.initiator : i.detail.verdicts.recipient;
      })
      .filter(Boolean);
    const counterpartVerdicts = completed
      .map((i) => {
        const subjectAgentId = i.manifest.subjectAgentId;
        const isInitiator = i.detail.initiator.id === subjectAgentId;
        return isInitiator ? i.detail.verdicts.recipient : i.detail.verdicts.initiator;
      })
      .filter(Boolean);

    const subjectYes = subjectVerdicts.filter((v) => v.wouldMeetIrl).length;
    const counterpartYes = counterpartVerdicts.filter((v) => v.wouldMeetIrl).length;
    const mutualMatches = completed.filter((i) => i.detail.mutualMatch === true).length;

    // Verdict agreement: both yes OR both no
    let verdictAgreements = 0;
    completed.forEach((i, idx) => {
      const sv = subjectVerdicts[idx];
      const cv = counterpartVerdicts[idx];
      if (sv && cv && sv.wouldMeetIrl === cv.wouldMeetIrl) verdictAgreements++;
    });

    // Decline-on-mismatch — if recipient persona has smoking dealbreaker
    // that the subject violates, OR vice-versa, did the subject decline/say no?
    let mismatchCases = 0;
    let mismatchDeclined = 0;
    items.forEach((i) => {
      const subjectAgentId = i.manifest.subjectAgentId;
      const isInitiator = i.detail.initiator.id === subjectAgentId;
      const subjectPersona = isInitiator ? i.detail.initiator.persona : i.detail.recipient.persona;
      const counterpartPersona = isInitiator ? i.detail.recipient.persona : i.detail.initiator.persona;

      const subjectViolatesCounterpart = (counterpartPersona.dealbreakers ?? []).some((db) => {
        // simple keyword match against subject's bio + lifestyle
        const hay = `${subjectPersona.bio ?? ""} ${JSON.stringify(subjectPersona.lifestyleHabits ?? {})}`.toLowerCase();
        return hay.includes(String(db).toLowerCase());
      });
      const counterpartViolatesSubject = (subjectPersona.dealbreakers ?? []).some((db) => {
        const hay = `${counterpartPersona.bio ?? ""} ${JSON.stringify(counterpartPersona.lifestyleHabits ?? {})}`.toLowerCase();
        return hay.includes(String(db).toLowerCase());
      });
      if (subjectViolatesCounterpart || counterpartViolatesSubject) {
        mismatchCases++;
        // Did the subject decline or say no?
        if (i.detail.date.status === "declined") {
          // We can't tell from status alone WHO declined — only the recipient declines.
          // If subject is recipient and date was declined, count it.
          if (!isInitiator) mismatchDeclined++;
        } else {
          const sv = isInitiator ? i.detail.verdicts.initiator : i.detail.verdicts.recipient;
          if (sv && !sv.wouldMeetIrl) mismatchDeclined++;
        }
      }
    });

    const avgReasoningLen = mean(
      subjectVerdicts.map((v) => (v.reasoning ?? "").length),
    );
    const avgTurns = mean(
      completed.map((i) => i.detail.date.turnCount),
    );

    rows.push({
      condition: c,
      total,
      completed: completed.length,
      declined: declined.length,
      active: active.length,
      completionRate: pct(completed.length, total),
      subjectYesRate: pct(subjectYes, subjectVerdicts.length),
      counterpartYesRate: pct(counterpartYes, counterpartVerdicts.length),
      mutualMatchRate: pct(mutualMatches, completed.length),
      verdictAgreementRate: pct(verdictAgreements, completed.length),
      mismatchCases,
      mismatchDeclineRate: pct(mismatchDeclined, mismatchCases),
      avgReasoningLen: Math.round(avgReasoningLen),
      avgTurns: avgTurns.toFixed(1),
    });
  }

  // ---- Print summary ----
  console.log("");
  console.log("=".repeat(72));
  console.log("E1 — Persona richness ablation");
  console.log("=".repeat(72));

  const cols = [
    "condition",
    "n",
    "completed",
    "subj yes",
    "cp yes",
    "mutual",
    "agree",
    "decline-on-mismatch",
    "avg reasoning",
    "avg turns",
  ];
  console.log(cols.map((c) => c.padEnd(10)).join(" "));
  console.log("-".repeat(72));
  for (const r of rows) {
    if (r.note) {
      console.log(`${r.condition.padEnd(10)} (${r.note})`);
      continue;
    }
    console.log(
      [
        r.condition.padEnd(10),
        String(r.total).padEnd(10),
        r.completionRate.padEnd(10),
        r.subjectYesRate.padEnd(10),
        r.counterpartYesRate.padEnd(10),
        r.mutualMatchRate.padEnd(10),
        r.verdictAgreementRate.padEnd(10),
        `${r.mismatchDeclineRate} (${r.mismatchCases})`.padEnd(20),
        `${r.avgReasoningLen}c`.padEnd(13),
        r.avgTurns.padEnd(10),
      ].join(" "),
    );
  }
  console.log("");

  // ---- Write a markdown report ----
  const md = [
    `# E1 — Persona richness ablation`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**Subject persona:** Dee (39M, Brighton MA, MPA at Harvard, renewable energy)`,
    `**Population:** the 20-agent test-bot fleet, hetero-female 20–47`,
    `**Model:** ${manifest.model}, max ${manifest.maxTurns} turns/date`,
    ``,
    `## What changed`,
    `- **rich:** subject's prompt includes the full persona JSON`,
    `- **medium:** name + age + location + bio + top 3 interests only`,
    `- **thin:** name + age + 1-line bio only`,
    ``,
    `## Results`,
    ``,
    `| condition | n | completed | subj yes | cp yes | mutual | agreement | decline-on-mismatch | avg reasoning | avg turns |`,
    `|---|---|---|---|---|---|---|---|---|---|`,
    ...rows.map((r) =>
      r.note
        ? `| ${r.condition} | (${r.note}) | | | | | | | | |`
        : `| ${r.condition} | ${r.total} | ${r.completionRate} | ${r.subjectYesRate} | ${r.counterpartYesRate} | ${r.mutualMatchRate} | ${r.verdictAgreementRate} | ${r.mismatchDeclineRate} (${r.mismatchCases}) | ${r.avgReasoningLen} chars | ${r.avgTurns} |`,
    ),
    ``,
    `## Notes`,
    ``,
    `- "decline-on-mismatch" counts cases where one persona's dealbreaker is plausibly violated by the other (smoking-on-bio match) and asks: did the subject correctly say no?`,
    `- "agreement" = both verdicts had the same wouldMeetIrl value (both yes or both no).`,
    `- "subj yes" / "cp yes" only count among completed dates with verdicts on file.`,
    ``,
  ].join("\n");

  const mdPath = join(REPO_ROOT, "experiment-results.local.md");
  writeFileSync(mdPath, md);
  console.log(`Wrote ${mdPath}`);
})().catch((err) => {
  console.error("[analyze FAIL]", err);
  process.exit(1);
});
