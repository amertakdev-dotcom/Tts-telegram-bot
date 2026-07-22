// ===============================
// lib/worksheetTemplate.js — builds the exercises+solutions worksheet HTML
//
// This is the SINGLE source of truth for the worksheet's look. Both the
// PNG preview sent in chat and the downloadable PDF are rendered from the
// exact same HTML/CSS (see lib/pdfRenderer.js), which is what guarantees
// they match each other 100% instead of drifting apart.
//
// Visual style mirrors the reference worksheet: blue/purple gradient
// header card, one rounded white card per problem (numbered badge + points
// pill), a green "ប្រមាណវត្ថុ៖" givens box, a labelled step-by-step
// solution with light formula boxes, a green answer box, and a
// "Prepared with ... / ទំព័រ X ក្នុង Y" footer per page.
// ===============================

const PROBLEMS_PER_PAGE = 2;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function renderGivens(givens) {
  if (!Array.isArray(givens) || givens.length === 0) return "";
  return `
    <div class="givens-box">
      <span class="givens-label">ប្រមាណវត្ថុ៖</span>
      ${givens.map((g) => `<span class="pill">${escapeHtml(g)}</span>`).join("")}
    </div>`;
}

function renderSteps(steps) {
  if (!Array.isArray(steps)) return "";
  return steps
    .map(
      (s) => `
      <div class="step">
        <div class="step-label">${escapeHtml(s.label)}</div>
        ${s.note ? `<div class="step-note">${escapeHtml(s.note)}</div>` : ""}
        ${(Array.isArray(s.lines) ? s.lines : [])
          .map((line) => `<div class="formula-box">${escapeHtml(line)}</div>`)
          .join("")}
      </div>`
    )
    .join("");
}

function renderProblem(problem) {
  return `
    <div class="problem-card">
      <div class="problem-head">
        <div class="problem-number">${escapeHtml(problem.number)}</div>
        <div class="problem-title">លំហាត់ទី ${escapeHtml(problem.number)}</div>
        ${problem.points ? `<div class="points-pill">${escapeHtml(problem.points)}</div>` : ""}
      </div>
      ${problem.statement ? `<p class="problem-statement">${escapeHtml(problem.statement)}</p>` : ""}
      ${renderGivens(problem.givens)}
      <div class="solution-heading">💡 ដំណោះស្រាយលម្អិត (Solution)</div>
      ${renderSteps(problem.steps)}
      ${problem.answer ? `<div class="answer-box">${escapeHtml(problem.answer)}</div>` : ""}
    </div>`;
}

function renderHeader(meta) {
  return `
    <div class="header">
      <div class="header-text">
        <h1>${escapeHtml(meta.title)}</h1>
        <div class="header-sub-row">
          ${meta.subtitle ? `<span class="sub">${escapeHtml(meta.subtitle)}</span>` : ""}
          ${meta.badge ? `<span class="badge">${escapeHtml(meta.badge)}</span>` : ""}
        </div>
      </div>
      <div class="header-icon">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="15" stroke="white" stroke-opacity="0.5" stroke-width="1.5"/>
          <circle cx="27" cy="10" r="3" fill="white"/>
          <line x1="18" y1="18" x2="27" y2="10" stroke="white" stroke-width="1.5"/>
        </svg>
      </div>
    </div>`;
}

function renderPage(problems, pageNumber, totalPages, meta) {
  return `
    <section class="page">
      ${pageNumber === 1 ? renderHeader(meta) : ""}
      ${problems.map(renderProblem).join("")}
      <footer class="page-footer">
        <span>Prepared with ${escapeHtml(meta.aiName)}</span>
        <span>ទំព័រ ${pageNumber} ក្នុង ${totalPages}</span>
      </footer>
    </section>`;
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap');

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans Khmer', 'Noto Sans', sans-serif;
    color: #1f2937;
    background: #f4f6fb;
  }

  .page {
    width: 794px;
    min-height: 1123px;
    margin: 0 auto;
    background: #f4f6fb;
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }

  .header {
    background: linear-gradient(135deg, #4f7cff 0%, #7b5cff 100%);
    border-radius: 18px;
    padding: 22px 26px;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 22px;
    box-shadow: 0 8px 20px rgba(79, 124, 255, 0.25);
  }
  .header h1 { margin: 0 0 8px; font-size: 24px; font-weight: 700; }
  .header-sub-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .header .sub { font-size: 14px; opacity: 0.9; }
  .header .badge {
    font-size: 12px;
    background: rgba(255,255,255,0.18);
    border: 1px solid rgba(255,255,255,0.4);
    border-radius: 999px;
    padding: 4px 12px;
  }
  .header-icon { flex-shrink: 0; opacity: 0.85; }

  .problem-card {
    background: #ffffff;
    border: 1px solid #e5e9f2;
    border-radius: 16px;
    padding: 20px 22px;
    margin-bottom: 18px;
    box-shadow: 0 2px 6px rgba(16, 24, 40, 0.04);
    page-break-inside: avoid;
  }
  .problem-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .problem-number {
    width: 26px; height: 26px; border-radius: 50%;
    background: #4f7cff; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; flex-shrink: 0;
  }
  .problem-title { font-weight: 700; font-size: 15px; color: #1f2937; }
  .points-pill {
    margin-left: auto;
    font-size: 12px; font-weight: 600; color: #2563eb;
    background: #eaf1ff; border-radius: 999px; padding: 4px 12px;
  }
  .problem-statement { font-size: 14px; line-height: 1.7; margin: 0 0 12px; color: #374151; }

  .givens-box {
    background: #f0fdf4;
    border-left: 4px solid #22c55e;
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 14px;
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .givens-label { font-weight: 700; color: #15803d; font-size: 13px; margin-right: 4px; }
  .pill {
    background: #ffffff; border: 1px solid #bbf7d0; color: #166534;
    border-radius: 999px; padding: 3px 10px; font-size: 12.5px;
  }

  .solution-heading {
    font-weight: 700; color: #2563eb; font-size: 14px;
    padding-bottom: 8px; margin-bottom: 12px;
    border-bottom: 1px solid #e5e9f2;
    display: flex; align-items: center; gap: 6px;
  }

  .step { margin-bottom: 12px; }
  .step-label { font-weight: 700; font-size: 13.5px; color: #1f2937; margin-bottom: 4px; }
  .step-note { font-size: 12.5px; color: #6b7280; margin-bottom: 6px; }
  .formula-box {
    background: #f8fafc; border: 1px solid #e5e9f2; border-radius: 8px;
    padding: 9px 14px; margin-bottom: 6px;
    font-size: 13.5px; color: #1d4ed8;
    font-family: 'DejaVu Sans Mono', 'Noto Sans', monospace;
  }

  .answer-box {
    background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px;
    padding: 12px 16px; margin-top: 6px;
    font-weight: 700; color: #15803d; font-size: 13.5px;
  }

  .page-footer {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid #e5e9f2;
    display: flex; justify-content: space-between;
    font-size: 11.5px; color: #9ca3af;
  }
`;

// data = { title, subtitle, badge, problems: [{ number, points, statement,
//          givens: [], steps: [{label, note?, lines: []}], answer }] }
function buildWorksheetHtml(data, opts = {}) {
  const aiName = opts.aiName || "Amertak AI";
  const problems = Array.isArray(data.problems) ? data.problems : [];
  const pages = chunk(problems, PROBLEMS_PER_PAGE);
  const totalPages = pages.length || 1;
  const meta = { title: data.title || "លំហាត់ និងដំណោះស្រាយ", subtitle: data.subtitle, badge: data.badge, aiName };

  const pagesHtml = (pages.length ? pages : [[]])
    .map((pageProblems, idx) => renderPage(pageProblems, idx + 1, totalPages, meta))
    .join("");

  return `<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8" />
<style>${CSS}</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

module.exports = { buildWorksheetHtml, PROBLEMS_PER_PAGE };
