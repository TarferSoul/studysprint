export const STORAGE_KEY = "studysprint.v1";
export const uid = () => globalThis.crypto.randomUUID();
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const localDateTime = (date) =>
  `${localDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
export const isDone = (assignment) =>
  assignment.tasks.length > 0 && assignment.tasks.every((t) => t.done);
export const remaining = (assignment) =>
  assignment.tasks
    .filter((t) => !t.done)
    .reduce((total, task) => total + task.minutes, 0);
export const formatMinutes = (n) =>
  n >= 60 ? `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ""}` : `${n}m`;
export const dueLabel = (due) =>
  due
    ? new Date(due).toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "待定截止时间";

function validDate(y, m, d, h, min) {
  const value = new Date(y, m - 1, d, h, min);
  return value.getFullYear() === y &&
    value.getMonth() === m - 1 &&
    value.getDate() === d &&
    h >= 0 &&
    h <= 23 &&
    min >= 0 &&
    min <= 59
    ? localDateTime(value)
    : "";
}

export function parseDeadline(text, now = new Date()) {
  const numeric = text.match(
    /(?:(20\d{2})\s*[-/年]\s*)?(\d{1,2})\s*[-/月]\s*(\d{1,2})(?:日)?\s*(?:[T,，]|周[一二三四五六日天]|星期[一二三四五六日天])?\s*(?:(上午|下午|晚上)\s*)?(\d{1,2})[:：](\d{2})\s*(AM|PM)?/i,
  );
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const english = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?,?\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i,
  );
  let year, month, day, hour, minute, period;
  if (numeric) {
    [, year, month, day, period, hour, minute] = numeric;
    period = numeric[7] || period;
  } else if (english) {
    [, month, day, year, hour, minute, period] = english;
    month = months.indexOf(month.slice(0, 3).toLowerCase()) + 1;
  } else return { due: "", note: "未识别到完整日期和时间，请手动填写。" };
  hour = Number(hour);
  minute = Number(minute || 0);
  if (/pm|下午|晚上/i.test(period || "") && hour < 12) hour += 12;
  if (/am|上午/i.test(period || "") && hour === 12) hour = 0;
  const due = validDate(
    Number(year || now.getFullYear()),
    Number(month),
    Number(day),
    hour,
    minute,
  );
  return {
    due,
    note: due
      ? `请核对截止时间${year ? "" : `；原文未标年份，暂用 ${now.getFullYear()} 年`}。未换算原文时区，请按设备时区确认。`
      : "原文日期无效，请手动填写。",
  };
}

const patterns = [
  {
    regex:
      /product hunt|分析.{0,12}产品|产品.{0,12}(研究|分析)|study.{0,18}products|analy[sz]e.{0,18}products/i,
    title: "完成产品研究与比较",
    minutes: 60,
  },
  {
    regex: /prototype|原型|demo|交互/i,
    title: "制作并测试可交互原型",
    minutes: 120,
  },
  {
    regex: /deploy|github|部署/i,
    title: "部署项目并检查公开链接",
    minutes: 40,
  },
  {
    regex: /document|文档|report|报告/i,
    title: "整理说明文档与结果",
    minutes: 60,
  },
  {
    regex: /presentation|slides|ppt|汇报|演示稿/i,
    title: "准备汇报与演示材料",
    minutes: 45,
  },
  { regex: /experiment|实验|训练/i, title: "完成实验并记录结果", minutes: 90 },
  { regex: /read|阅读|文献/i, title: "阅读材料并整理关键笔记", minutes: 45 },
];

export function parseBrief(brief, options = {}, now = new Date()) {
  const lines = brief
    .split(/\n|[;；]|(?<=[。!?！？])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const tasks = [];
  for (const rule of patterns) {
    const source = lines.find((s) => rule.regex.test(s));
    if (source)
      tasks.push({
        id: uid(),
        title: rule.title,
        minutes: rule.minutes,
        done: false,
        source,
        inferred: false,
      });
  }
  // Preserve explicit requirements even when no specialized rule recognizes them.
  for (const line of lines) {
    const looksLikeHeading =
      line === lines[0] &&
      lines.length > 1 &&
      !/^(?:[-*•]|\d+[.、)）]|请|需|完成|提交|制作|设计|实现|阅读|分析|整理|准备|撰写|develop|create|write|prepare|build|submit|compare)/i.test(
        line,
      );
    if (
      looksLikeHeading ||
      tasks.some((t) => t.source === line) ||
      /^.{0,12}(?:deadline|ddl|截止)\s*[:：]/i.test(line)
    )
      continue;
    if (
      /^(?:[-*•]|\d+[.、)）])\s*\S|提交|完成|准备|撰写|设计|实现|对比|整理|分析|制作|develop|create|write|prepare|build|submit|compare/i.test(
        line,
      )
    ) {
      tasks.push({
        id: uid(),
        title: line.replace(/^(?:[-*•]|\d+[.、)）])\s*/, "").slice(0, 160),
        minutes: 45,
        done: false,
        source: line,
        inferred: false,
      });
    }
  }
  if (!tasks.length)
    tasks.push({
      id: uid(),
      title: "阅读作业要求并补充执行步骤",
      minutes: 20,
      done: false,
      source: brief,
      inferred: true,
    });
  const limited = tasks.slice(0, 11);
  limited.push({
    id: uid(),
    title: "对照原文检查交付物与提交方式",
    minutes: 15,
    done: false,
    source: "",
    inferred: true,
  });
  const parsed = parseDeadline(brief, now);
  return {
    id: uid(),
    title:
      lines[0]?.replace(/^(?:[-*•]|\d+[.、)）])\s*/, "").slice(0, 80) ||
      "新作业",
    course: options.course?.trim() || "未分类课程",
    due: options.due || parsed.due,
    sourceUrl: safeUrl(options.sourceUrl),
    brief,
    notes: "",
    tasks: limited,
    createdAt: now.toISOString(),
    demo: false,
    parseNote: options.due ? "使用你填写的截止时间，请再次核对。" : parsed.note,
  };
}

export function makeSamples(now = new Date()) {
  const date = (offset, hour = 22) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return localDateTime(d);
  };
  const sample = (title, course, offset, tasks, sourceUrl) => ({
    id: uid(),
    title,
    course,
    due: date(offset),
    sourceUrl,
    brief: tasks.map((t) => t[0]).join("\n"),
    notes: "",
    demo: true,
    createdAt: now.toISOString(),
    tasks: tasks.map(([title, minutes, done]) => ({
      id: uid(),
      title,
      minutes,
      done: !!done,
      source: title,
      inferred: false,
    })),
  });
  return [
    sample(
      "从产品想法到可交互原型",
      "产品设计",
      1,
      [
        ["研究 3 个 Product Hunt 产品", 60, true],
        ["制作 StudySprint 可交互原型", 120, false],
        ["部署到 GitHub Pages", 40, false],
        ["整理产品说明文档", 60, false],
      ],
      "https://www.producthunt.com/",
    ),
    sample(
      "感知机学习规则实验",
      "人工神经网络",
      3,
      [
        ["阅读实验要求与学习规则", 30, true],
        ["运行实验并对比结果", 90, false],
        ["整理中文实验报告", 60, false],
      ],
      "",
    ),
    sample(
      "小组项目选题与分工",
      "人工智能创新设计",
      5,
      [
        ["确定问题与目标用户", 35, true],
        ["画出关键用户流程", 45, false],
        ["整理分工和验证计划", 30, false],
      ],
      "",
    ),
  ];
}

export function validateBackup(input) {
  if (
    !input ||
    input.version !== 1 ||
    !Array.isArray(input.assignments) ||
    input.assignments.length > 100
  )
    throw new Error("备份格式无效，最多支持 100 份作业。");
  const str = (v, max) => typeof v === "string" && v.length <= max;
  const ids = new Set();
  const assignments = input.assignments.map((a) => {
    if (
      !a ||
      !str(a.id, 100) ||
      !a.id ||
      ids.has(a.id) ||
      !str(a.title, 160) ||
      !a.title.trim() ||
      !str(a.course, 60) ||
      !str(a.brief, 12000) ||
      !str(a.notes, 20000) ||
      !str(a.sourceUrl, 2000) ||
      !str(a.due, 30) ||
      (a.due &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a.due) ||
          !Number.isFinite(new Date(a.due).getTime()))) ||
      !Array.isArray(a.tasks) ||
      !a.tasks.length ||
      a.tasks.length > 50
    )
      throw new Error("备份中的作业数据不完整。");
    ids.add(a.id);
    const taskIds = new Set();
    const tasks = a.tasks.map((t) => {
      if (
        !t ||
        !str(t.id, 100) ||
        !t.id ||
        taskIds.has(t.id) ||
        !str(t.title, 200) ||
        !t.title.trim() ||
        !str(t.source, 12000) ||
        !Number.isInteger(t.minutes) ||
        t.minutes < 5 ||
        t.minutes > 600 ||
        typeof t.done !== "boolean"
      )
        throw new Error("备份中的任务数据无效。");
      taskIds.add(t.id);
      return {
        id: t.id,
        title: t.title,
        minutes: t.minutes,
        source: t.source,
        done: t.done,
        inferred: !!t.inferred,
      };
    });
    return {
      id: a.id,
      title: a.title,
      course: a.course,
      due: a.due,
      brief: a.brief,
      notes: a.notes,
      sourceUrl: safeUrl(a.sourceUrl),
      demo: !!a.demo,
      createdAt: str(a.createdAt, 50) ? a.createdAt : "",
      tasks,
    };
  });
  return { version: 1, assignments };
}

function escapeIcs(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function foldLine(line) {
  let output = "",
    current = "",
    bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) {
      output += current + "\r\n";
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  return output + current;
}
export function calendarExport(assignments, now = new Date()) {
  const stamp = (date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudySprint//Coursework Planner//ZH",
    "CALSCALE:GREGORIAN",
  ];
  for (const a of assignments.filter((a) => a.due && !isDone(a))) {
    const start = new Date(a.due);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(a.id)}@studysprint`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(new Date(start.getTime() + 15 * 60000))}`,
      `SUMMARY:${escapeIcs(a.title + " 截止")}`,
      `DESCRIPTION:${escapeIcs(a.tasks.map((t) => `${t.done ? "[x]" : "[ ]"} ${t.title}`).join("\n"))}`,
      ...(a.sourceUrl ? [`URL:${a.sourceUrl}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function markdownExport(a) {
  return `# ${a.title}\n\n课程：${a.course}\n截止：${a.due ? dueLabel(a.due) : "待定"}（${Intl.DateTimeFormat().resolvedOptions().timeZone}）\n来源：${a.sourceUrl || "粘贴的作业要求"}\n\n## 行动清单\n\n${a.tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.title}（估计 ${t.minutes} 分钟）${t.inferred ? " · 建议步骤" : ""}${t.source ? `\n  > 来源：${t.source.replace(/\n/g, "\n  > ")}` : ""}`).join("\n")}\n\n## 我的笔记\n\n${a.notes || "暂无笔记"}\n\n## 作业原文\n\n${a.brief}\n`;
}
