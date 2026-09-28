import {
  STORAGE_KEY,
  uid,
  localDate,
  localDateTime,
  escapeHtml as e,
  safeUrl,
  isDone,
  remaining,
  formatMinutes,
  dueLabel,
  parseBrief,
  makeSamples,
  validateBackup,
  calendarExport,
  markdownExport,
} from "./core.mjs";

const $ = (selector) => document.querySelector(selector);
let state,
  storageWarning = "",
  storageEnabled = true;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  state = saved
    ? validateBackup(JSON.parse(saved))
    : { version: 1, assignments: makeSamples() };
} catch {
  state = { version: 1, assignments: [] };
  storageEnabled = false;
  storageWarning =
    "本地存储不可用或旧数据无法读取。当前更改只保留在内存中，请及时备份；原存储未被覆盖。";
}
let view = "board",
  filter = "active",
  courseFilter = "",
  query = "",
  draft = null,
  detailId = null;
let focus = null,
  toastTimeout;
const assignments = () => state.assignments;
const getAssignment = (id) => assignments().find((a) => a.id === id);
const ordered = () =>
  [...assignments()].sort((a, b) =>
    (a.due || "9999").localeCompare(b.due || "9999"),
  );
const activeAssignments = () => ordered().filter((a) => !isDone(a));

function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("#toast").classList.remove("show"), 4000);
}
function save() {
  if (!storageEnabled) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    storageEnabled = false;
    storageWarning = "浏览器未能保存数据。请导出备份，避免刷新后丢失。";
    toast(storageWarning);
  }
}
function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const filename = (value) =>
  value.replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 70);
function confirmAction(title, message, action) {
  const dialog = $("#confirm-dialog");
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = message;
  dialog.returnValue = "";
  dialog.onclose = () => {
    if (dialog.returnValue === "confirm") action();
  };
  dialog.showModal();
}
function openImport() {
  $("#import-dialog").showModal();
}

function statusFor(a) {
  if (isDone(a)) return { text: "已完成", className: "done" };
  if (!a.due) return { text: "待定日期", className: "neutral" };
  const diff = new Date(a.due).getTime() - Date.now();
  if (diff < 0) return { text: "已逾期", className: "urgent" };
  if (localDate(new Date(a.due)) === localDate())
    return { text: "今天截止", className: "urgent" };
  if (diff < 48 * 3600000) return { text: "即将截止", className: "soon" };
  return { text: "进行中", className: "neutral" };
}

function render() {
  const labels = { board: "作业总览", week: "本周安排", about: "关于这个产品" };
  $("#view-label").textContent = labels[view];
  $("#today-label").textContent = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  $("#nav-count").textContent = activeAssignments().length;
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
  });
  $("#main").innerHTML =
    `${storageWarning ? `<p class="storage-warning" role="alert">${e(storageWarning)}</p>` : ""}${view === "board" ? boardHtml() : view === "week" ? weekHtml() : aboutHtml()}`;
  if (view === "board") renderCards();
}

function boardHtml() {
  const open = activeAssignments(),
    allTasks = assignments().flatMap((a) => a.tasks),
    done = allTasks.filter((t) => t.done).length;
  const dueSoon = open.filter(
    (a) => a.due && new Date(a.due) - Date.now() < 48 * 3600000,
  ).length;
  const next = open[0],
    task = next?.tasks.find((t) => !t.done);
  const progress = allTasks.length
    ? Math.round((done / allTasks.length) * 100)
    : 0;
  return `<section class="page-heading"><div><div class="eyebrow">A CLEARER DAY STARTS HERE</div><h1>给作业一个清晰的<span>下一步。</span></h1><p>要求、材料、截止时间，都有着落。</p></div><button class="button primary" data-action="import"><span class="plus" aria-hidden="true">＋</span> 导入作业</button></section>
    ${assignments().some((a) => a.demo) ? `<div class="demo-notice"><span><span class="demo-chip">示例工作台</span> 先用 3 份示例体验流程，日期以首次打开时间为基准。</span><button class="text-button" data-action="clear-samples">清除示例</button></div>` : ""}
    <section class="stats-grid" aria-label="作业统计"><div class="stat"><span>进行中的作业</span><strong>${String(open.length).padStart(2, "0")}<small>份</small></strong><div class="stat-bottom"><i class="mini-dot"></i> ${new Set(open.map((a) => a.course)).size} 门课程，集中管理</div></div><div class="stat"><span>48 小时内需关注</span><strong class="orange">${String(dueSoon).padStart(2, "0")}<small>份</small></strong><div class="stat-bottom">${dueSoon ? "含已逾期作业，优先留出时间" : "节奏不错，提前推进一点"}</div></div><div class="stat progress-stat"><div><span>行动清单进度</span><strong>${done}<small>/ ${allTasks.length} 步</small></strong><div class="stat-bottom">每一步，都算数。</div></div><div class="progress-ring" style="--progress:${progress}%"><span>${progress}<small>%</small></span></div></div></section>
    <div class="workspace-grid"><section class="assignment-section"><div class="section-heading"><h2>我的作业 <span class="count">${assignments().length}</span></h2><label class="search-box"><span aria-hidden="true">⌕</span><input id="search" aria-label="搜索作业" placeholder="搜索作业或课程" value="${e(query)}"></label></div>
    <div class="list-toolbar"><div class="segmented" role="group" aria-label="作业状态筛选">${[
      ["active", "进行中"],
      ["done", "已完成"],
      ["all", "全部"],
    ]
      .map(
        ([key, label]) =>
          `<button data-filter="${key}" aria-pressed="${filter === key}" class="${filter === key ? "selected" : ""}">${label}</button>`,
      )
      .join(
        "",
      )}</div><select id="course-filter" aria-label="筛选课程"><option value="">所有课程</option>${[...new Set(assignments().map((a) => a.course))].map((c) => `<option ${courseFilter === c ? "selected" : ""} value="${e(c)}">${e(c)}</option>`).join("")}</select></div>
    <div id="assignment-list" class="assignment-list"></div></section>
    <aside class="right-rail"><section class="next-card"><div class="eyebrow">ONE STEP AT A TIME <span aria-hidden="true">↗</span></div><h2>${task ? "从这一步开始" : "给今天留一点从容"}</h2>${task ? `<span class="course-label light">${e(next.course)}</span><h3>${e(task.title)}</h3><p>${e(next.title)}</p><div class="next-meta"><span>◷ 预计 ${formatMinutes(task.minutes)}</span><span>按截止时间推荐</span></div><button class="button lime" data-focus="${e(next.id)}" data-task="${e(task.id)}">专注 25 分钟 <span aria-hidden="true">↗</span></button><button class="next-link" data-open="${e(next.id)}">查看完整清单 →</button>` : `<p>当前没有待办。导入下一份作业，或者享受刚刚完成的轻松。</p><button class="button lime" data-action="import">添加新作业 ＋</button>`}</section>
    <section class="week-peek"><div class="section-heading"><h3>接下来 7 天</h3><button class="text-button" data-view="week" aria-label="查看本周安排">↗</button></div>${miniWeek()}<div class="small-divider"></div><p class="muted">先看截止时间，再决定今天投入多少。</p><button class="text-button" data-action="calendar">导出到日历 ↓</button></section>
    <p class="privacy-note">◇ 无需登录 · 内容不上传<br>清除浏览器数据会移除记录，请定期备份。</p></aside></div>`;
}

function renderCards() {
  const items = ordered().filter(
    (a) =>
      (filter === "all" || (filter === "done" ? isDone(a) : !isDone(a))) &&
      (!courseFilter || a.course === courseFilter) &&
      `${a.title} ${a.course}`.toLowerCase().includes(query.toLowerCase()),
  );
  $("#assignment-list").innerHTML = items.length
    ? items
        .map((a, i) => {
          const done = a.tasks.filter((t) => t.done).length,
            percent = Math.round((done / a.tasks.length) * 100),
            status = statusFor(a),
            next = a.tasks.find((t) => !t.done);
          return `<article class="assignment-card" style="--order:${i}"><div class="card-top"><span class="course-label tone-${i % 3}">${e(a.course)}</span><span class="status ${status.className}"><i></i>${status.text}</span></div><h3><button data-open="${e(a.id)}">${e(a.title)}</button></h3><div class="assignment-meta"><span>◷ ${e(dueLabel(a.due))}</span><span>${a.demo ? "示例作业" : a.sourceUrl ? "已关联来源" : "来自粘贴文本"}</span></div><div class="card-progress"><div class="progress-track"><span style="width:${percent}%"></span></div><span>${done}/${a.tasks.length} 步</span></div><div class="card-bottom"><span class="next-preview">${next ? `<span>下一步</span> ${e(next.title)}` : "✓ 所有步骤已完成"}</span><button class="card-arrow" data-open="${e(a.id)}" aria-label="打开${e(a.title)}">↗</button></div></article>`;
        })
        .join("")
    : `<div class="empty-state"><span aria-hidden="true">↗</span><h3>${assignments().length ? "这里还没有匹配的作业" : "把第一份作业放进来"}</h3><p>${assignments().length ? "试试其他筛选条件，或开始一份新作业。" : "粘贴一段作业要求，下一步就会清楚起来。"}</p><button class="button primary" data-action="import">导入作业 ＋</button></div>`;
}

function weekDays() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
}
function miniWeek() {
  return `<div class="mini-week">${weekDays()
    .map((d, i) => {
      const has = activeAssignments().some(
        (a) => a.due?.slice(0, 10) === localDate(d),
      );
      return `<div class="${i === 0 ? "today" : ""}"><span>${["日", "一", "二", "三", "四", "五", "六"][d.getDay()]}</span><b>${d.getDate()}</b><i class="${has ? "has-due" : ""}"></i></div>`;
    })
    .join("")}</div>`;
}
function weekHtml() {
  const overdue = activeAssignments().filter(
    (a) => a.due && new Date(a.due) < new Date(),
  );
  const noDate = activeAssignments().filter((a) => !a.due);
  const agendaRow = (a) =>
    `<button class="agenda-item" data-open="${e(a.id)}"><span class="course-label">${e(a.course)}</span><strong>${e(a.title)}</strong><span>${e(dueLabel(a.due))} · 剩余约 ${formatMinutes(remaining(a))}</span><span aria-hidden="true">↗</span></button>`;
  return `<section class="page-heading"><div><div class="eyebrow">MAKE TIME, NOT JUST A LIST</div><h1>给这一周，<span>留好位置。</span></h1><p>按截止日期查看未来 7 天。用时是可调整的估计，不是自动排课。</p></div><button class="button primary" data-action="calendar">导出日历 ↓</button></section><p class="field-hint">当前时区：${e(Intl.DateTimeFormat().resolvedOptions().timeZone)} · 日历事件表示截止提醒。</p>
    ${overdue.length ? `<section class="overdue-section"><h2>先处理已逾期的作业</h2>${overdue.map(agendaRow).join("")}</section>` : ""}
    <div class="agenda">${weekDays()
      .map((d, i) => {
        const items = activeAssignments().filter(
          (a) =>
            a.due?.slice(0, 10) === localDate(d) &&
            new Date(a.due) >= new Date(),
        );
        return `<section class="agenda-day"><div class="day-label"><strong>${String(d.getDate()).padStart(2, "0")}</strong><span>${i === 0 ? "今天" : d.toLocaleDateString("zh-CN", { weekday: "long" })}<small>${d.getMonth() + 1} 月</small></span></div><div class="day-content">${items.length ? items.map(agendaRow).join("") : '<p class="day-free">没有作业截止 · 可以提前推进，也可以留白</p>'}</div></section>`;
      })
      .join(
        "",
      )}</div>${noDate.length ? `<section class="undated"><h2>待定截止时间</h2>${noDate.map(agendaRow).join("")}</section>` : ""}`;
}

function aboutHtml() {
  return `<section class="page-heading"><div><div class="eyebrow">THE IDEA BEHIND STUDYSPRINT</div><h1>少一点遗漏，<span>多一点掌控。</span></h1><p>一个面向大学生的学业规划产品原型。</p></div></section><div class="about-grid"><section><h2>真实问题</h2><p>作业散落在课程平台、群聊和文档中。知道“要交什么”和知道“现在该做什么”，之间常常还隔着一大段整理工作。</p><h2>从通知到行动</h2><ol class="workflow"><li><span>01</span><div><h3>放进要求</h3><p>粘贴中英文作业通知，保留原文和来源链接。</p></div></li><li><span>02</span><div><h3>核对计划</h3><p>检查截止日期，编辑步骤和估计用时，再保存。</p></div></li><li><span>03</span><div><h3>专注下一步</h3><p>勾选任务、写笔记、开启专注计时，或导出到日历。</p></div></li></ol><button class="button primary" data-action="import">试着拆解一份作业 →</button></section><section class="about-details"><span class="demo-chip">原型边界</span><h2>现在能做什么</h2><p>本地规则提取常见任务和日期，人工核对，清单管理、来源追溯、笔记、本地保存、Markdown 和日历导出、JSON 备份。</p><h2>AI 将用在哪里</h2><p>未来通过服务端接入语言模型，把复杂要求转成结构化任务，并返回原文证据。当前版本未调用大模型；任务和用时是启发式建议，不保证完整。</p><h2>设计借鉴</h2><p><a href="https://www.producthunt.com/products/perplexity-ai" target="_blank" rel="noopener noreferrer">Perplexity ↗</a>：让建议有可核对的来源。<br><a href="https://www.producthunt.com/products/granola" target="_blank" rel="noopener noreferrer">Granola ↗</a>：先保留用户输入，再辅助整理。<br><a href="https://www.producthunt.com/products/v0" target="_blank" rel="noopener noreferrer">v0 ↗</a>：缩短输入、预览、修改之间的距离。</p><p class="field-hint">不连接课程平台，不自动提交作业，不跨设备同步。数据留在当前浏览器中；备份文件由你保管。</p><a class="text-link" href="https://github.com/TarferSoul/studysprint" target="_blank" rel="noopener noreferrer">源码与项目说明 ↗</a></section></div>`;
}

function renderReview() {
  $("#review-content").innerHTML =
    `<p class="parse-note">本地规则生成 · ${e(draft.parseNote)}<br>步骤可能遗漏要求，用时为粗略估计。请对照原文调整。</p><label for="review-name">作业名称</label><input id="review-name" maxlength="160" required value="${e(draft.title)}"><div class="form-grid"><div><label for="review-course">课程</label><input id="review-course" required maxlength="60" value="${e(draft.course)}"></div><div><label for="review-due">截止时间</label><input id="review-due" type="datetime-local" value="${e(draft.due)}"></div></div><div class="section-heading review-heading"><h3>行动清单</h3><span class="muted">用时 / 分钟</span></div><div class="review-tasks">${draft.tasks.map((t, i) => `<div class="review-task" data-review-index="${i}"><div class="review-task-main"><span class="task-number">${String(i + 1).padStart(2, "0")}</span><input class="review-task-title" aria-label="步骤 ${i + 1} 名称" required maxlength="200" value="${e(t.title)}"><input class="review-task-minutes" aria-label="步骤 ${i + 1} 用时" type="number" min="5" max="600" step="5" required value="${t.minutes}"><button type="button" class="icon-button" data-remove-review="${i}" aria-label="移除步骤 ${i + 1}">×</button></div><details class="evidence"><summary>${t.inferred ? "建议步骤 · 无原文依据" : "查看对应原文"}</summary><p>${e(t.source || "这一步是通用检查建议，可以修改或删除。")}</p></details></div>`).join("")}</div><button type="button" id="add-review-task" class="text-button">＋ 添加一个步骤</button><details class="original-text"><summary>对照完整作业要求</summary><pre>${e(draft.brief)}</pre></details>`;
}
function syncDraft() {
  draft.title = $("#review-name").value.trim();
  draft.course = $("#review-course").value.trim();
  draft.due = $("#review-due").value;
  document.querySelectorAll("[data-review-index]").forEach((row) => {
    const t = draft.tasks[Number(row.dataset.reviewIndex)];
    t.title = row.querySelector(".review-task-title").value.trim();
    t.minutes = Number(row.querySelector(".review-task-minutes").value);
  });
}

function renderDetail() {
  const a = getAssignment(detailId);
  if (!a) return;
  const done = a.tasks.filter((t) => t.done).length;
  $("#detail-content").innerHTML =
    `<div class="dialog-heading"><div><span class="course-label">${e(a.course)}</span><h2 id="detail-title">${e(a.title)}</h2></div><button class="icon-button" data-close="detail-dialog" aria-label="关闭作业详情">×</button></div><div class="detail-summary"><span>${e(dueLabel(a.due))}</span><span>已完成 ${done}/${a.tasks.length} 步</span><span>剩余约 ${formatMinutes(remaining(a))}</span></div><div class="progress-track large"><span style="width:${(done / a.tasks.length) * 100}%"></span></div>
    <details class="edit-meta"><summary>编辑名称、课程和截止时间</summary><form id="meta-form"><label for="edit-title">作业名称</label><input id="edit-title" required maxlength="160" value="${e(a.title)}"><div class="form-grid"><div><label for="edit-course">课程</label><input id="edit-course" required maxlength="60" value="${e(a.course)}"></div><div><label for="edit-due">截止时间</label><input id="edit-due" type="datetime-local" value="${e(a.due)}"></div></div><label for="edit-source">来源链接</label><input id="edit-source" type="url" maxlength="2000" value="${e(a.sourceUrl)}"><button class="button small quiet" type="submit">保存修改</button></form></details>
    <div class="section-heading"><h3>行动清单</h3><span class="muted">点击任务文字可编辑</span></div><div class="detail-tasks">${a.tasks.map((t) => `<div class="detail-task ${t.done ? "checked" : ""}"><div class="task-main"><input type="checkbox" data-toggle-task="${e(t.id)}" ${t.done ? "checked" : ""} aria-label="完成 ${e(t.title)}"><input class="editable-task" data-edit-task="${e(t.id)}" maxlength="200" aria-label="任务名称 ${e(t.title)}" value="${e(t.title)}"><label class="minutes-label"><input type="number" data-edit-minutes="${e(t.id)}" aria-label="${e(t.title)} 用时" min="5" max="600" step="5" value="${t.minutes}"><span>min</span></label><button class="icon-button delete-task" data-delete-task="${e(t.id)}" aria-label="删除 ${e(t.title)}">×</button></div><details class="evidence"><summary>${t.inferred ? "建议或自定义步骤" : "查看原文依据"}</summary><p>${e(t.source || "此步骤由你或本地规则补充，没有对应原文。")}</p></details></div>`).join("")}</div><form id="add-task-form" class="add-task-form"><input id="new-task" placeholder="补充一个行动步骤…" aria-label="新步骤名称" required maxlength="200"><button class="button quiet small" type="submit">＋ 添加</button></form>
    <label class="notes-label" for="assignment-notes">我的工作笔记 <span id="notes-state" class="optional">自动保存在此浏览器</span></label><textarea id="assignment-notes" rows="4" maxlength="20000" placeholder="记下思路、草稿或参考材料…">${e(a.notes)}</textarea><details class="original-text"><summary>查看完整作业要求与来源</summary>${a.sourceUrl ? `<a href="${e(a.sourceUrl)}" target="_blank" rel="noopener noreferrer">打开原始链接 ↗</a>` : ""}<pre>${e(a.brief)}</pre></details><div class="detail-bottom"><button class="text-button destructive" data-delete-assignment="${e(a.id)}">删除作业</button><div><button class="button quiet small" data-export-plan="${e(a.id)}">导出清单 ↓</button><button class="button primary small" data-close="detail-dialog">完成</button></div></div>`;
}

function startFocus(aid, tid) {
  const a = getAssignment(aid),
    task = a?.tasks.find((t) => t.id === tid);
  if (!task) return;
  const start = () => {
    focus = {
      aid,
      tid,
      title: task.title,
      remaining: 25 * 60,
      end: Date.now() + 25 * 60 * 1000,
      running: true,
    };
    renderFocus();
    toast("专注已开始。先做这一件事。");
  };
  if (focus)
    confirmAction(
      "开始新的专注？",
      "当前计时将结束，新任务会从 25 分钟开始。",
      start,
    );
  else start();
}
function renderFocus() {
  let dock = $("#focus-dock");
  if (!focus) {
    dock?.remove();
    return;
  }
  if (!dock) {
    dock = document.createElement("section");
    dock.id = "focus-dock";
    dock.className = "focus-dock";
    dock.setAttribute("aria-label", "专注计时");
    document.body.append(dock);
  }
  dock.innerHTML = `<div><span class="eyebrow">FOCUS SESSION</span><strong>${e(focus.title)}</strong></div><span id="focus-clock" class="focus-clock"></span><button class="button small lime" id="toggle-focus">${focus.running ? "暂停" : "继续"}</button><button class="icon-button" id="stop-focus" aria-label="结束专注">×</button>`;
  updateFocusClock();
}
function updateFocusClock() {
  if (!focus) return;
  if (focus.running)
    focus.remaining = Math.max(0, Math.ceil((focus.end - Date.now()) / 1000));
  if ($("#focus-clock"))
    $("#focus-clock").textContent =
      `${String(Math.floor(focus.remaining / 60)).padStart(2, "0")}:${String(focus.remaining % 60).padStart(2, "0")}`;
  if (focus.running && focus.remaining === 0) {
    focus.running = false;
    $("#toggle-focus").textContent = "再来一轮";
    toast("这一轮专注完成了，休息一下。任务完成后记得勾选清单。");
  }
}
setInterval(updateFocusClock, 1000);

document.addEventListener("click", (event) => {
  const b = event.target.closest("button");
  if (!b) return;
  if (b.dataset.close) {
    $("#" + b.dataset.close).close();
    return;
  }
  if (b.dataset.view) {
    view = b.dataset.view;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (b.dataset.action === "import") openImport();
  if (b.dataset.filter) {
    filter = b.dataset.filter;
    render();
  }
  if (b.dataset.open) {
    detailId = b.dataset.open;
    renderDetail();
    $("#detail-dialog").showModal();
  }
  if (b.dataset.action === "calendar") {
    if (!activeAssignments().some((a) => a.due))
      return toast("先为一份未完成作业设置截止时间。");
    download(
      calendarExport(assignments()),
      "studysprint-deadlines.ics",
      "text/calendar;charset=utf-8",
    );
    toast("已导出未完成作业的截止提醒。");
  }
  if (b.dataset.action === "clear-samples")
    confirmAction(
      "清除示例作业？",
      "将移除带“示例作业”标记的记录。你自行导入的作业会保留。",
      () => {
        state.assignments = assignments().filter((a) => !a.demo);
        if (focus && !getAssignment(focus.aid)) {
          focus = null;
          renderFocus();
        }
        save();
        render();
        toast("示例已清除，可以导入自己的作业了。");
      },
    );
  if (b.dataset.removeReview !== undefined) {
    syncDraft();
    if (draft.tasks.length === 1) return toast("请至少保留一个步骤。");
    draft.tasks.splice(Number(b.dataset.removeReview), 1);
    renderReview();
  }
  if (b.id === "add-review-task") {
    syncDraft();
    if (draft.tasks.length >= 50) return toast("最多支持 50 个步骤。");
    draft.tasks.push({
      id: uid(),
      title: "",
      minutes: 30,
      source: "",
      inferred: true,
      done: false,
    });
    renderReview();
    $(".review-task:last-child .review-task-title").focus();
  }
  if (b.dataset.exportPlan) {
    const a = getAssignment(b.dataset.exportPlan);
    download(
      markdownExport(a),
      `${filename(a.title)}.md`,
      "text/markdown;charset=utf-8",
    );
    toast("已导出任务、来源与笔记。");
  }
  if (b.dataset.deleteAssignment)
    confirmAction(
      "删除这份作业？",
      "任务、笔记和原始要求将从此工作台移除。可以先导出备份。",
      () => {
        state.assignments = assignments().filter(
          (a) => a.id !== b.dataset.deleteAssignment,
        );
        if (focus?.aid === b.dataset.deleteAssignment) {
          focus = null;
          renderFocus();
        }
        save();
        $("#detail-dialog").close();
        render();
        toast("作业已删除。");
      },
    );
  if (b.dataset.deleteTask) {
    const a = getAssignment(detailId);
    if (a.tasks.length === 1) return toast("请至少保留一个步骤。");
    confirmAction("删除这个步骤？", "此步骤及其完成状态会被移除。", () => {
      a.tasks = a.tasks.filter((t) => t.id !== b.dataset.deleteTask);
      save();
      renderDetail();
      render();
    });
  }
  if (b.dataset.focus) startFocus(b.dataset.focus, b.dataset.task);
  if (b.id === "toggle-focus" && focus) {
    updateFocusClock();
    if (focus.running) focus.running = false;
    else {
      focus.remaining = focus.remaining || 25 * 60;
      focus.end = Date.now() + focus.remaining * 1000;
      focus.running = true;
    }
    renderFocus();
  }
  if (b.id === "stop-focus") {
    focus = null;
    renderFocus();
    toast("专注计时已结束。");
  }
});

$("#import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const brief = $("#brief").value.trim();
  if (brief.length < 10) return toast("请粘贴至少 10 个字符的作业要求。");
  if (assignments().length >= 100)
    return toast("最多支持 100 份作业，请先备份并清理旧作业。");
  if ($("#source-url").value && !safeUrl($("#source-url").value))
    return toast("来源链接需要以 http:// 或 https:// 开头。");
  draft = parseBrief(brief, {
    course: $("#course-input").value,
    due: $("#due-input").value,
    sourceUrl: $("#source-url").value,
  });
  renderReview();
  $("#import-dialog").close();
  $("#review-dialog").showModal();
});
$("#review-form").addEventListener("submit", (event) => {
  event.preventDefault();
  syncDraft();
  if (!draft.title || !draft.course || draft.tasks.some((t) => !t.title))
    return toast("请填写作业名称、课程和每个步骤。");
  delete draft.parseNote;
  state.assignments.push(draft);
  save();
  $("#review-dialog").close();
  $("#import-form").reset();
  filter = "active";
  courseFilter = "";
  query = "";
  view = "board";
  render();
  toast("作业已加入工作台。开始第一步吧。");
});
$("#back-to-brief").addEventListener("click", () => {
  $("#review-dialog").close();
  $("#import-dialog").showModal();
});
$("#fill-sample").addEventListener("click", () => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(22, 0, 0, 0);
  $("#brief").value =
    `个人产品设计作业\n截止时间：${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 22:00\n1. 分析 3 个 Product Hunt 产品，说明目标用户、痛点与可借鉴的设计。\n2. Develop the personal product idea into an interactive Prototype.\n3. 提供 GitHub deployment link，并检查手机访问效果。\n4. 撰写 document，介绍问题、用户、功能与限制。`;
  $("#course-input").value = "产品设计";
  $("#source-url").value = "";
  $("#due-input").value = "";
});

document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "search") {
    query = el.value;
    renderCards();
  }
  if (el.id === "assignment-notes") {
    getAssignment(detailId).notes = el.value;
    save();
    $("#notes-state").textContent = storageEnabled
      ? "已保存在此浏览器"
      : "仅保留在内存，请备份";
  }
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.id === "course-filter") {
    courseFilter = el.value;
    renderCards();
  }
  if (el.dataset.toggleTask) {
    const a = getAssignment(detailId);
    a.tasks.find((t) => t.id === el.dataset.toggleTask).done = el.checked;
    save();
    renderDetail();
    render();
    $(`[data-toggle-task="${CSS.escape(el.dataset.toggleTask)}"]`)?.focus();
    if (isDone(a)) toast("这份作业的行动清单完成了！请自行确认课程提交情况。");
  }
  if (el.dataset.editTask) {
    const task = getAssignment(detailId).tasks.find(
      (t) => t.id === el.dataset.editTask,
    );
    if (!el.value.trim()) {
      el.value = task.title;
      return toast("任务名称不能为空。");
    }
    task.title = el.value.trim();
    save();
    render();
  }
  if (el.dataset.editMinutes) {
    const task = getAssignment(detailId).tasks.find(
      (t) => t.id === el.dataset.editMinutes,
    );
    if (!el.checkValidity()) {
      el.value = task.minutes;
      return toast("用时应为 5–600 分钟，以 5 分钟递增。");
    }
    task.minutes = Number(el.value);
    save();
    renderDetail();
    render();
  }
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "meta-form") {
    event.preventDefault();
    const a = getAssignment(detailId);
    if (!$("#edit-title").value.trim() || !$("#edit-course").value.trim())
      return toast("名称和课程不能为空。");
    if ($("#edit-source").value && !safeUrl($("#edit-source").value))
      return toast("请输入 http:// 或 https:// 来源链接。");
    Object.assign(a, {
      title: $("#edit-title").value.trim(),
      course: $("#edit-course").value.trim(),
      due: $("#edit-due").value,
      sourceUrl: safeUrl($("#edit-source").value),
    });
    save();
    renderDetail();
    render();
    toast("作业信息已更新。");
  }
  if (event.target.id === "add-task-form") {
    event.preventDefault();
    const a = getAssignment(detailId),
      title = $("#new-task").value.trim();
    if (!title) return;
    if (a.tasks.length >= 50) return toast("最多支持 50 个步骤。");
    a.tasks.push({
      id: uid(),
      title,
      minutes: 30,
      done: false,
      source: "",
      inferred: true,
    });
    save();
    renderDetail();
    render();
    $("#new-task").focus();
  }
});

$("#export-backup").addEventListener("click", () =>
  download(
    JSON.stringify(state, null, 2),
    `studysprint-backup-${localDate()}.json`,
    "application/json",
  ),
);
$("#restore-backup").addEventListener("click", () => $("#backup-file").click());
$("#backup-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return toast("备份文件不能超过 5 MB。");
  try {
    const data = validateBackup(JSON.parse(await file.text()));
    confirmAction(
      "恢复备份？",
      `将用文件中的 ${data.assignments.length} 份作业替换当前 ${assignments().length} 份作业。建议先备份当前数据。`,
      () => {
        state = data;
        focus = null;
        renderFocus();
        filter = "active";
        courseFilter = "";
        query = "";
        save();
        render();
        toast("备份已恢复。");
      },
    );
  } catch (error) {
    toast(`无法恢复：${error.message}`);
  }
});

save();
render();
