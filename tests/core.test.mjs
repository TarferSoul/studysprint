import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDeadline,
  parseBrief,
  makeSamples,
  validateBackup,
  calendarExport,
  markdownExport,
  localDateTime,
  safeUrl,
  escapeHtml,
  isDone,
  remaining,
} from "../core.mjs";

const now = new Date(2026, 8, 28, 12, 0);

test("English assignment deadline including 12-hour time", () => {
  assert.equal(
    parseDeadline("Monday, Sep 28, 10:00 PM DDL", now).due,
    "2026-09-28T22:00",
  );
  assert.equal(
    parseDeadline("Sep 29, 2026 12:15 AM", now).due,
    "2026-09-29T00:15",
  );
});
test("Chinese and ISO local dates", () => {
  assert.equal(
    parseDeadline("截止 2026年9月28日 22:00", now).due,
    "2026-09-28T22:00",
  );
  assert.equal(parseDeadline("9月28日 下午 2:30", now).due, "2026-09-28T14:30");
  assert.equal(parseDeadline("2026-09-28T22:00", now).due, "2026-09-28T22:00");
});
test("missing or impossible deadlines remain unassigned", () => {
  for (const text of [
    "下周一之前",
    "2026-02-31 22:00",
    "13月28日 22:00",
    "2026-09-28 25:00",
  ])
    assert.equal(parseDeadline(text, now).due, "");
});
test("prototype and deployment requirements retain evidence", () => {
  const brief =
    "Product idea\nDevelop a Prototype + GitHub deployment link + document";
  const result = parseBrief(brief, {}, now);
  assert.equal(result.tasks.length, 4);
  assert.ok(
    result.tasks
      .filter((t) => !t.inferred)
      .every((t) => brief.includes(t.source)),
  );
  assert.equal(result.tasks.at(-1).inferred, true);
  assert.equal(result.due, "");
});
test("unrecognized numbered requirements are retained", () => {
  const parsed = parseBrief(
    "课程作业\n1. 找到五位受访者\n2. 记录观察结果",
    {},
    now,
  );
  assert.equal(parsed.tasks[0].title, "找到五位受访者");
  assert.equal(parsed.tasks[1].title, "记录观察结果");
});

test("an assignment heading is not mistaken for an action", () => {
  const result = parseBrief(
    "个人产品设计作业\n1. 制作 Prototype\n2. 提供 GitHub deployment link",
    {},
    now,
  );
  assert.ok(!result.tasks.some((t) => t.title === "个人产品设计作业"));
});
test("manual date overrides parsing", () => {
  assert.equal(
    parseBrief("作业截止：2026-09-28 22:00", { due: "2026-10-01T20:00" }, now)
      .due,
    "2026-10-01T20:00",
  );
});
test("backup roundtrip preserves notes and progress", () => {
  const assignments = makeSamples(now);
  assignments[0].notes = "我的笔记";
  assignments[0].tasks[1].done = true;
  const state = validateBackup(
    JSON.parse(JSON.stringify({ version: 1, assignments })),
  );
  assert.equal(state.assignments[0].notes, "我的笔记");
  assert.equal(state.assignments[0].tasks[1].done, true);
});
test("malformed backups and duplicate identities are rejected", () => {
  for (const bad of [
    null,
    {},
    { version: 9, assignments: [] },
    { version: 1, assignments: [{}] },
  ])
    assert.throws(() => validateBackup(bad));
  const samples = makeSamples(now);
  assert.throws(() =>
    validateBackup({ version: 1, assignments: [samples[0], samples[0]] }),
  );
  samples[0].tasks[0].minutes = -1;
  assert.throws(() => validateBackup({ version: 1, assignments: samples }));
});
test("URLs and untrusted markup cannot become active HTML", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,attack"), "");
  assert.equal(safeUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(
    escapeHtml('<img src=x onerror="attack()">'),
    "&lt;img src=x onerror=&quot;attack()&quot;&gt;",
  );
});
test("calendar exports deadlines in UTC, escapes and folds UTF-8 lines", () => {
  const a = makeSamples(now)[0];
  a.title = "中文长标题".repeat(30) + ",分号;换行\n结束";
  const ics = calendarExport([a], now);
  const unfolded = ics.replace(/\r\n /g, "");
  const utc = new Date(a.due)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  assert.ok(unfolded.includes(`DTSTART:${utc}`));
  assert.ok(unfolded.includes("\\,分号\\;换行\\n结束"));
  for (const line of ics.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
  a.tasks.forEach((t) => (t.done = true));
  assert.ok(!calendarExport([a]).includes("BEGIN:VEVENT"));
});
test("Markdown export contains original text, notes and evidence", () => {
  const a = makeSamples(now)[0];
  a.notes = "草稿内容";
  const md = markdownExport(a);
  assert.ok(md.includes("草稿内容"));
  assert.ok(md.includes("## 作业原文"));
  assert.ok(md.includes("> 来源："));
});
test("progress and remaining effort agree with checklist", () => {
  const a = makeSamples(now)[0];
  assert.equal(remaining(a), 220);
  assert.equal(isDone(a), false);
  a.tasks.forEach((t) => (t.done = true));
  assert.equal(isDone(a), true);
  assert.equal(remaining(a), 0);
  assert.equal(localDateTime(now), "2026-09-28T12:00");
});
