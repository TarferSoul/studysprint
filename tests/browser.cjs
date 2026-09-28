const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_CHANNEL
      ? { channel: process.env.CHROME_CHANNEL }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Shanghai",
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = process.env.BASE_URL || "http://127.0.0.1:4173/";
  const output = process.env.QA_DIR || "test-results";
  await fs.mkdir(output, { recursive: true });
  let checks = 0;
  const check = (condition, message) => {
    assert.ok(condition, message);
    checks++;
  };
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("studysprint.v1")));
  try {
    await page.goto(base);
    check(
      (await page.locator(".assignment-card").count()) === 3,
      "three labeled sample assignments",
    );
    await page.screenshot({
      path: path.join(output, "desktop.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "导入作业", exact: true }).click();
    await page.getByRole("button", { name: "试试示例作业" }).click();
    await page.locator("#source-url").fill("https://example.edu/coursework");
    await page.getByRole("button", { name: "拆解并核对" }).click();
    check(
      await page.locator("#review-dialog").isVisible(),
      "review before saving",
    );
    check(
      (await page.locator("#review-due").inputValue()).endsWith("T22:00"),
      "parsed deadline",
    );
    await page.locator("#review-name").fill("可验证的产品原型");
    await page.locator("#review-course").fill("测试课程");
    await page
      .locator(".review-task-title")
      .first()
      .fill("对比三个产品并记录证据");
    await page.locator(".review-task-minutes").first().fill("35");
    await page.locator(".evidence summary").first().click();
    check(
      (await page.locator(".evidence p").first().textContent()).includes(
        "Product Hunt",
      ),
      "visible evidence",
    );
    await page.locator("#review-dialog").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: path.join(output, "review.png") });
    await page.getByRole("button", { name: "加入工作台" }).click();
    check((await state()).assignments.length === 4, "assignment persisted");
    await page
      .getByRole("button", { name: "可验证的产品原型", exact: true })
      .click();
    await page.locator("[data-toggle-task]").first().check();
    await page
      .locator("#assignment-notes")
      .fill("观察：每一步都需要原文依据。");
    const plan = await state();
    const created = plan.assignments.find(
      (a) => a.title === "可验证的产品原型",
    );
    check(
      created.tasks[0].done && created.tasks[0].minutes === 35,
      "edited steps and progress persisted",
    );
    await page.screenshot({ path: path.join(output, "detail.png") });
    const mdPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出清单" }).click();
    const md = await mdPromise;
    const mdText = await fs.readFile(await md.path(), "utf8");
    check(
      mdText.includes("观察：") &&
        mdText.includes("https://example.edu/coursework"),
      "Markdown contains notes and source",
    );
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await page.reload();
    await page
      .getByRole("button", { name: "可验证的产品原型", exact: true })
      .click();
    check(
      (await page.locator("#assignment-notes").inputValue()) ===
        "观察：每一步都需要原文依据。",
      "notes survive reload",
    );
    check(
      await page.locator("[data-toggle-task]").first().isChecked(),
      "checkbox survives reload",
    );
    await page.locator(".edit-meta summary").click();
    await page.locator("#edit-due").fill("");
    await page.getByRole("button", { name: "保存修改" }).click();
    check(
      (await state()).assignments.find((a) => a.id === created.id).due === "",
      "deadline can be removed",
    );
    await page
      .locator("#new-task")
      .fill('<img src=x onerror="window.__injected=true">');
    await page.locator("#add-task-form button").click();
    check(
      !(await page.evaluate(() => window.__injected)),
      "user text remains inert",
    );
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await page.locator("#search").fill("可验证");
    check(
      (await page.locator(".assignment-card").count()) === 1,
      "search works",
    );
    await page.locator("#search").fill("");
    await page.locator("#course-filter").selectOption("测试课程");
    check(
      (await page.locator(".assignment-card").count()) === 1,
      "course filter works",
    );
    await page.locator("#course-filter").selectOption("");
    await page.locator('[data-view="week"]').first().click();
    check(
      (await page.locator(".agenda-day").count()) === 7,
      "seven-day agenda",
    );
    check(
      await page.locator(".undated").isVisible(),
      "undated assignments remain visible",
    );
    const icsPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出日历", exact: false }).click();
    const ics = await icsPromise;
    const icsText = await fs.readFile(await ics.path(), "utf8");
    check(
      icsText.includes("BEGIN:VCALENDAR") && icsText.includes("DTSTART:"),
      "calendar downloads with events",
    );
    await page.locator('[data-view="board"]').first().click();
    await page.getByRole("button", { name: "专注 25 分钟" }).click();
    check(
      (await page.locator("#focus-clock").textContent()) === "25:00",
      "focus timer starts",
    );
    await page.locator("#toggle-focus").click();
    check(
      (await page.locator("#toggle-focus").textContent()) === "继续",
      "timer pauses",
    );
    await page.locator("#stop-focus").click();
    const backupPromise = page.waitForEvent("download");
    await page.locator("#export-backup").click();
    const backup = await backupPromise;
    const backupPath = await backup.path();
    const saved = JSON.parse(await fs.readFile(backupPath, "utf8"));
    check(saved.assignments.length === 4, "JSON backup includes all data");
    await page.getByRole("button", { name: "清除示例" }).click();
    await page.locator('#confirm-dialog button[value="confirm"]').click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("studysprint.v1")).assignments
          .length === 1,
    );
    check(
      (await state()).assignments.length === 1,
      "clear samples preserves personal work",
    );
    await page.locator("#backup-file").setInputFiles(backupPath);
    await page.locator('#confirm-dialog button[value="confirm"]').click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("studysprint.v1")).assignments
          .length === 4,
    );
    check((await state()).assignments.length === 4, "backup restores progress");
    await page
      .getByRole("button", { name: "可验证的产品原型", exact: true })
      .click();
    for (const cb of await page.locator("[data-toggle-task]").all()) {
      if (!(await cb.isChecked())) await cb.check();
    }
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await page.getByRole("button", { name: "已完成", exact: true }).click();
    check(
      (await page.locator(".assignment-card").count()) === 1,
      "completed filter",
    );
    await page
      .getByRole("button", { name: "可验证的产品原型", exact: true })
      .click();
    await page.getByRole("button", { name: "删除作业", exact: true }).click();
    await page.locator('#confirm-dialog button[value="confirm"]').click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("studysprint.v1")).assignments
          .length === 3,
    );
    check(
      (await state()).assignments.length === 3,
      "delete confirmed assignment",
    );
    await page.getByRole("button", { name: "进行中", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, "mobile.png"),
      fullPage: true,
    });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "mobile has no horizontal overflow",
    );
    await page.getByRole("button", { name: "导入作业", exact: true }).click();
    await page.getByRole("button", { name: "试试示例作业" }).click();
    await page.getByRole("button", { name: "拆解并核对" }).click();
    check(
      await page
        .locator("#review-dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      "mobile review fits dialog",
    );
    await page.screenshot({ path: path.join(output, "mobile-review.png") });
    await page.keyboard.press("Escape");
    await page.locator('[data-view="about"]').first().click();
    check(
      (await page.locator("#main").textContent()).includes("未调用大模型"),
      "prototype limitations visible",
    );
    check(errors.length === 0, `no JavaScript errors: ${errors.join("; ")}`);
    console.log(`PASS: ${checks} end-to-end checks at ${base}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
