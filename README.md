# StudySprint

A coursework planner for university students. Turn an assignment brief into an editable checklist with source evidence, a deadline, effort estimates, and a clear next action.

| GitHub Repository Link                    | Deployment Link                           |
| ----------------------------------------- | ----------------------------------------- |
| https://github.com/TarferSoul/studysprint | https://tarfersoul.github.io/studysprint/ |

## Try the prototype

1. Open the [live demo](https://tarfersoul.github.io/studysprint/). Three clearly labeled sample assignments let you explore without signing in.
2. Click **导入作业**, then **试试示例作业**, or paste your own Chinese/English assignment brief. A source URL and course name are optional.
3. Click **拆解并核对**. Review the deadline, inspect evidence under each step, and edit task names and estimated minutes. You can add/remove steps before saving.
4. Open the new assignment, complete a step, and write a note. Refresh to verify local persistence.
5. Export a Markdown plan or an ICS calendar. Use **备份数据** / **恢复备份** to move your workspace between browsers.

## What works

- Local rule-based extraction of common coursework requirements and explicit Chinese/English date-time formats.
- A review step before saving, with original text attached to extracted tasks. Suggested steps are labeled separately.
- Editable assignment metadata, task names, durations, checklists, notes, search, and course/status filters.
- A seven-day deadline agenda, overdue/undated sections, and a next action sorted by assignment deadline.
- A 25-minute focus timer with pause/resume. Finishing a timer does not automatically complete a task.
- Browser-local persistence, validated JSON backups, Markdown export, and RFC 5545-style ICS events with UTC timestamps and UTF-8 line folding.
- Responsive Chinese interface, keyboard-operable native dialogs, visible focus states, reduced-motion support, and no runtime third-party requests.

## Product idea and design references

StudySprint is designed for students whose assignments are scattered across learning platforms, group messages, and documents. Its core problem is the gap between knowing an assignment exists and knowing what to do next. The longer-term product is an AI-assisted workspace that connects requirements, source material, planning, and drafts. This prototype tests the import-review-act workflow using local rules.

- [Perplexity on Product Hunt](https://www.producthunt.com/products/perplexity-ai): keep source evidence close to a generated suggestion.
- [Granola on Product Hunt](https://www.producthunt.com/products/granola): preserve the user's original input and let them review the structure.
- [v0 on Product Hunt](https://www.producthunt.com/products/v0): keep the input-preview-edit loop short.

## Prototype boundaries

This version **does not call a language model**. Parsing uses regular expressions, keywords, and rough effort defaults. It may miss requirements, merge distinct requirements, or suggest steps that need revision. The review screen always asks the user to check the result against the original brief. Dates without a year use the current device year; incomplete/unrecognized dates remain unset. All times are interpreted in the device's local timezone, without automatically converting a timezone mentioned in the brief.

There is no course-platform integration, document/PDF upload, cloud synchronization, shared editing, background notification, writing coach, or automatic homework submission. Calendar export creates deadline events, not a daily study schedule or guaranteed reminder alarm. Imported calendars do not automatically update. The focus timer is session-only and ends on refresh.

Assignments and notes are stored in `localStorage` on the current browser and origin. No server receives the content. Other pages on the same origin share browser storage access. Clearing browser data removes records, so download backups regularly. The sample dates are relative to first load and the samples are not the user's real assignments. Restoring a backup replaces the current workspace after confirmation. Browser storage failures are reported and content can still be exported from memory.

## Local development

The deployed app uses plain HTML, CSS, and JavaScript modules. There is no build step and no runtime package dependency. Serve it over HTTP rather than opening `index.html` as a file:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173/ in a modern browser.

Node.js 22 or later runs the core tests without installing packages:

```sh
npm test
```

For the browser checks, keep the local server running in another terminal:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Alternatively, `CHROME_CHANNEL=chrome npm run test:browser` uses an installed Google Chrome. `BASE_URL` can point the same checks at a deployment; the checks only change their isolated browser's local storage and downloaded files. Screenshots go to `test-results/` (ignored by Git).

## Repository structure

- `index.html`: application shell and import/review dialogs.
- `styles.css`: desktop/mobile layout and visual design.
- `core.mjs`: parsing, validation, sample data, and exports.
- `app.js`: interaction flow and browser persistence.
- `tests/`: core unit tests and browser workflow checks.

## Deployment

GitHub Pages serves the `main` branch at the repository root. `.nojekyll` keeps the app as static files. No secrets, API keys, or server configuration are required. The author's [personal homepage](https://tarfersoul.github.io/) links to the demo.

## Next validation

Test five real assignment briefs with students, measuring time to create a correct checklist, manual corrections, missed requirements, and deadline errors. No user study has been conducted for this prototype. A later version could add server-side structured model output with evidence spans and timezone-aware date handling, followed by calendar synchronization.
