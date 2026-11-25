/**
 * @fileoverview iTEST local web UI. Plain browser JavaScript, no build step.
 * All text from reports and pages is inserted with textContent, never as
 * HTML, so content from the app under test cannot run script here.
 */

/** 8x8 pixel icons; '#' is a filled pixel. Each status has its own shape. */
const ICONS = {
  check: [
    '........',
    '.......#',
    '......##',
    '#....##.',
    '##..##..',
    '.####...',
    '..##....',
    '........',
  ],
  cross: [
    '##....##',
    '###..###',
    '.######.',
    '..####..',
    '..####..',
    '.######.',
    '###..###',
    '##....##',
  ],
  excl: [
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '........',
    '...##...',
    '...##...',
  ],
  warn: [
    '...##...',
    '..#..#..',
    '..#..#..',
    '.#.##.#.',
    '.#.##.#.',
    '#......#',
    '#..##..#',
    '########',
  ],
  info: [
    '...##...',
    '...##...',
    '........',
    '..###...',
    '...##...',
    '...##...',
    '...##...',
    '..####..',
  ],
  pause: [
    '.##..##.',
    '.##..##.',
    '.##..##.',
    '.##..##.',
    '.##..##.',
    '.##..##.',
    '.##..##.',
    '.##..##.',
  ],
  question: [
    '..####..',
    '.##..##.',
    '.....##.',
    '....##..',
    '...##...',
    '...##...',
    '........',
    '...##...',
  ],
  play: [
    '.#......',
    '.##.....',
    '.###....',
    '.####...',
    '.####...',
    '.###....',
    '.##.....',
    '.#......',
  ],
  hourglass: [
    '########',
    '.######.',
    '..####..',
    '...##...',
    '...##...',
    '..#..#..',
    '.#....#.',
    '########',
  ],
  stop: [
    '..####..',
    '.######.',
    '########',
    '#......#',
    '#......#',
    '########',
    '.######.',
    '..####..',
  ],
  dot: [
    '........',
    '..####..',
    '.######.',
    '.######.',
    '.######.',
    '.######.',
    '..####..',
    '........',
  ],
  bug: [
    '.#....#.',
    '..#..#..',
    '.######.',
    '##.##.##',
    '.######.',
    '##.##.##',
    '.######.',
    '.#....#.',
  ],
};

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

const SEVERITY_INFO = {
  critical: {icon: 'cross', text: 'Breaks a page or journey. Fix first.'},
  high: {icon: 'excl', text: 'Serious error, e.g. a crash or server error.'},
  medium: {icon: 'warn', text: 'A problem users may notice.'},
  low: {icon: 'info', text: 'Minor issue, or something to check.'},
};

const GOAL_INFO = {
  passed: {icon: 'check', label: 'Passed'},
  failed: {icon: 'cross', label: 'Failed'},
  'could-not-finish': {icon: 'pause', label: 'Could not finish'},
};

const STEP_INFO = {
  done: {icon: 'check', label: 'Done'},
  refused: {icon: 'stop', label: 'Refused'},
  failed: {icon: 'excl', label: 'Failed'},
  dropped: {icon: 'question', label: 'Dropped'},
};

const MAX_LOG_LINES = 500;
const SVG_NS = 'http://www.w3.org/2000/svg';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const ui = {
  running: false,
  openReport: null,
  filter: 'all',
  report: null,
};

const $ = id => document.getElementById(id);

/**
 * Creates an element. Children may be nodes or strings (added as text).
 * @param {string} tag
 * @param {Object<string, *>=} props className, text, attrs, or on<Event>.
 * @param {...(Node|string|null|undefined)} children
 * @return {!HTMLElement}
 */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === undefined || child === null) continue;
    node.append(child);
  }
  return node;
}

/**
 * Draws one of the pixel icons as an inline SVG.
 * @param {string} name
 * @return {!SVGElement}
 */
function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 8 8');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('fill', 'currentColor');
  (ICONS[name] || ICONS.dot).forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      if (pixel !== '#') return;
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '1');
      rect.setAttribute('height', '1');
      svg.append(rect);
    });
  });
  return svg;
}

/**
 * A coloured badge with an icon and a word, so colour is never the only cue.
 * @param {string} kind CSS suffix, e.g. 'high' or 'passed'.
 * @param {string} label
 * @param {string} iconName
 * @return {!HTMLElement}
 */
function badge(kind, label, iconName) {
  return el('span', {className: `badge b-${kind}`}, icon(iconName), label);
}

/**
 * Calls the local API and returns the parsed JSON.
 * @param {string} path
 * @param {RequestInit=} options
 * @return {!Promise<*>}
 */
async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (HTTP ${response.status})`);
  }
  return body;
}

/** @param {string} iso @return {string} */
function formatDate(iso) {
  return dateFormat.format(new Date(iso));
}

/** Adds a message to the notice bar under the header. @param {string} message */
function showNotice(message) {
  const notice = $('notice');
  notice.append(el('p', {}, badge('high', 'Note', 'excl'), ' ', message));
  notice.hidden = false;
}

// ---------------------------------------------------------------- health

async function loadHealth() {
  const list = $('health');
  try {
    const checks = await api('/api/doctor');
    list.replaceChildren(
      ...checks.map(check => {
        const name = check.name.replace(/\s*\(.*\)/, '');
        return el(
          'li',
          {
            className: `chip ${check.ok ? 'chip-ok' : 'chip-fail'}`,
            title: check.message,
          },
          icon(check.ok ? 'check' : 'cross'),
          `${name} ${check.ok ? 'OK' : 'OFF'}`,
        );
      }),
    );
    const problems = checks.filter(check => !check.ok);
    const aiProblem = problems.find(check => check.name.startsWith('Ollama'));
    if (aiProblem) {
      showNotice(
        'The local AI is off, so AI goals will show COULD NOT FINISH. ' +
          `Automatic checks still run. (${aiProblem.message})`,
      );
    }
    const other = problems.filter(check => check !== aiProblem);
    if (other.length) {
      showNotice(
        other.map(check => `${check.name}: ${check.message}`).join(' '),
      );
    }
  } catch (error) {
    list.replaceChildren(
      el('li', {className: 'chip chip-fail', text: 'Check failed'}),
    );
    showNotice(error.message);
  }
}

// ---------------------------------------------------------------- legend

function renderLegend() {
  const items = [
    ...SEVERITIES.map(s => [
      badge(s, s, SEVERITY_INFO[s].icon),
      SEVERITY_INFO[s].text,
    ]),
    [
      badge('confirm', 'To confirm', 'question'),
      'Found by the AI. A person must check it.',
    ],
    [badge('passed', 'Passed', 'check'), 'The test goal worked as described.'],
    [
      badge('failed', 'Failed', 'cross'),
      'The app did not do what the goal said.',
    ],
    [
      badge('could-not-finish', 'Could not finish', 'pause'),
      'The agent stopped (no AI, out of steps). Not an app bug.',
    ],
    [
      badge('refused', 'Refused', 'stop'),
      'The safety guard blocked an AI action.',
    ],
  ];
  $('legend').replaceChildren(
    ...items.map(([b, text]) =>
      el('div', {className: 'legend-item'}, b, el('span', {text})),
    ),
  );
}

// ---------------------------------------------------------------- projects

/** @type {!Array<!HTMLButtonElement>} */
let runButtons = [];

async function loadProjects() {
  const list = $('projects');
  try {
    const projects = await api('/api/projects');
    if (!projects.length) {
      list.replaceChildren(
        el('li', {
          className: 'empty',
          text: 'No projects yet. Add projects/<name>/project.json.',
        }),
      );
      return;
    }
    runButtons = [];
    list.replaceChildren(...projects.map(renderProject));
    setRunning(ui.running);
  } catch (error) {
    list.replaceChildren(
      el('li', {className: 'project-error', text: error.message}),
    );
  }
}

/** @param {!Object} project @return {!HTMLElement} */
function renderProject(project) {
  const info = el(
    'div',
    {},
    el('div', {className: 'project-name', text: project.name}),
  );
  if (project.error) {
    info.append(el('div', {className: 'project-error', text: project.error}));
    return el(
      'li',
      {className: 'project'},
      info,
      badge('error', 'Invalid', 'cross'),
    );
  }
  info.append(
    el('div', {
      className: 'project-meta',
      text: `${project.environment.toUpperCase()} · ${project.baseUrl}`,
    }),
    el('div', {
      className: 'project-meta',
      text: `${project.pages} page(s) · ${project.goals} AI goal(s)`,
    }),
  );
  const button = el(
    'button',
    {
      type: 'button',
      className: 'btn',
      'aria-label': `Run ${project.name}`,
      onclick: () => startRun(project.name),
    },
    icon('play'),
    'Run',
  );
  runButtons.push(button);
  return el('li', {className: 'project'}, info, button);
}

/** @param {string} project */
async function startRun(project) {
  setRunning(true);
  try {
    await api('/api/runs', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        project,
        headed: $('opt-headed').checked,
        skipAi: $('opt-skip-ai').checked,
      }),
    });
  } catch (error) {
    setRunning(false);
    showNotice(error.message);
  }
}

/** @param {boolean} running */
function setRunning(running) {
  ui.running = running;
  for (const button of runButtons) button.disabled = running;
}

// ---------------------------------------------------------------- live run

/** @param {?Object} state */
function renderRunState(state) {
  const box = $('run-status');
  if (!state) {
    box.replaceChildren(
      badge('neutral', 'Idle', 'dot'),
      el('span', {text: 'No run yet. Pick a project and press RUN.'}),
    );
    setRunning(false);
    return;
  }
  if (state.phase === 'running') {
    box.replaceChildren(
      badge('running', 'Running', 'hourglass'),
      el(
        'span',
        {text: `Testing ${state.project}`},
        el('span', {className: 'blink', text: ' _'}),
      ),
    );
    setRunning(true);
    return;
  }
  setRunning(false);
  if (state.phase === 'error') {
    box.replaceChildren(
      badge('error', 'Agent error', 'cross'),
      el('span', {text: state.error || 'Unknown error'}),
    );
    return;
  }
  const s = state.summary;
  const problems = s.serious > 0 || s.goals.failed > 0;
  box.replaceChildren(
    problems
      ? badge('failed', 'Problems found', 'bug')
      : badge('passed', 'All clear', 'check'),
    el('span', {
      text:
        `${state.project}: ${s.findings} finding(s), ${s.serious} high or critical` +
        (s.goals.total
          ? ` · goals ${s.goals.passed} passed, ${s.goals.failed} failed, ` +
            `${s.goals.couldNotFinish} could not finish`
          : ''),
    }),
    el(
      'button',
      {
        type: 'button',
        className: 'btn btn-small btn-blue',
        onclick: () => openReport(state.project, state.reportId),
      },
      'Open report',
    ),
  );
}

/** @param {!Array<!Object>} entries */
function replaceLogs(entries) {
  const log = $('log');
  log.replaceChildren();
  if (!entries.length) {
    log.append(
      el('li', {className: 'log-empty', text: 'The run log will appear here.'}),
    );
  }
  entries.forEach(appendLog);
}

/** @param {!Object} entry */
function appendLog(entry) {
  const log = $('log');
  log.querySelector('.log-empty')?.remove();
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.append(
    el(
      'li',
      {className: entry.level},
      el('span', {
        className: 't',
        text: `${timeFormat.format(new Date(entry.time))} `,
      }),
      `${entry.level.padEnd(5)} ${entry.message}`,
    ),
  );
  while (log.childElementCount > MAX_LOG_LINES) log.firstElementChild.remove();
  if (nearBottom) log.scrollTop = log.scrollHeight;
}

function connectEvents() {
  const events = new EventSource('/api/runs/events');
  events.addEventListener('snapshot', event => {
    const {state, logs} = JSON.parse(event.data);
    renderRunState(state || null);
    replaceLogs(logs);
  });
  events.addEventListener('state', event => {
    const state = JSON.parse(event.data);
    if (state.phase === 'running') replaceLogs([]);
    renderRunState(state);
    if (state.phase === 'finished') {
      loadReports().then(() => openReport(state.project, state.reportId));
    }
  });
  events.addEventListener('log', event => appendLog(JSON.parse(event.data)));
}

// ---------------------------------------------------------------- reports

async function loadReports() {
  const list = $('reports');
  try {
    const reports = await api('/api/reports');
    if (!reports.length) {
      list.replaceChildren(
        el('p', {
          className: 'empty',
          text: 'No reports yet. Run a project to make one.',
        }),
      );
      return;
    }
    list.replaceChildren(...reports.map(renderReportRow));
  } catch (error) {
    list.replaceChildren(
      el('p', {className: 'project-error', text: error.message}),
    );
  }
}

/** @param {!Object} item @return {!HTMLElement} */
function renderReportRow(item) {
  const isOpen =
    ui.openReport &&
    ui.openReport.id === item.id &&
    ui.openReport.project === item.project;
  return el(
    'div',
    {className: `report-row${isOpen ? ' is-open' : ''}`},
    el(
      'div',
      {},
      el('span', {className: 'report-project', text: item.project}),
      el('span', {className: 'report-when', text: formatDate(item.startedAt)}),
    ),
    summaryBadges(item.summary),
    el(
      'button',
      {
        type: 'button',
        className: 'btn btn-small btn-blue',
        'aria-label': `Open ${item.project} report from ${formatDate(item.startedAt)}`,
        onclick: () => openReport(item.project, item.id),
      },
      'Open',
    ),
  );
}

/** @param {!Object} summary @return {!HTMLElement} */
function summaryBadges(summary) {
  const badges = el('div', {className: 'badges'});
  if (summary.status === 'could-not-finish') {
    badges.append(badge('could-not-finish', 'Run stopped', 'pause'));
  }
  for (const severity of SEVERITIES) {
    const count = summary.bySeverity[severity];
    if (count)
      badges.append(
        badge(severity, `${count} ${severity}`, SEVERITY_INFO[severity].icon),
      );
  }
  if (!summary.findings) badges.append(badge('passed', 'No findings', 'check'));
  const goals = summary.goals;
  if (goals.passed)
    badges.append(badge('passed', `${goals.passed} goal passed`, 'check'));
  if (goals.failed)
    badges.append(badge('failed', `${goals.failed} goal failed`, 'cross'));
  if (goals.couldNotFinish) {
    badges.append(
      badge(
        'could-not-finish',
        `${goals.couldNotFinish} goal stopped`,
        'pause',
      ),
    );
  }
  return badges;
}

/** @param {string} project @param {string} id */
async function openReport(project, id) {
  if (!project || !id) return;
  try {
    const report = await api(
      `/api/reports/${encodeURIComponent(project)}/${encodeURIComponent(id)}`,
    );
    ui.openReport = {project, id};
    ui.report = report;
    ui.filter = 'all';
    renderReport();
    loadReports();
    const view = $('report-view');
    view.hidden = false;
    view.scrollIntoView({behavior: 'smooth', block: 'start'});
  } catch (error) {
    showNotice(error.message);
  }
}

function renderReport() {
  const report = ui.report;
  const {project, id} = ui.openReport;
  $('report-title').textContent = `Report: ${report.project}`;

  const facts = el(
    'dl',
    {className: 'facts'},
    ...fact('Started', formatDate(report.startedAt)),
    ...fact('Environment', `${report.environment} (${report.baseUrl})`),
    ...fact(
      'Run',
      report.status === 'completed' ? 'Completed' : 'Could not finish',
    ),
    ...fact('AI', report.ai),
  );
  if (report.failure) facts.append(...fact('Why it stopped', report.failure));

  const counts = {critical: 0, high: 0, medium: 0, low: 0};
  for (const finding of report.findings) counts[finding.severity] += 1;
  const tiles = el(
    'div',
    {className: 'tiles'},
    ...SEVERITIES.map(severity =>
      el(
        'div',
        {className: 'tile'},
        badge(severity, severity, SEVERITY_INFO[severity].icon),
        el('span', {className: 'tile-number', text: String(counts[severity])}),
        el('span', {className: 'tile-label', text: 'findings'}),
      ),
    ),
  );

  $('report-body').replaceChildren(
    facts,
    tiles,
    el('h3', {text: 'Test goals'}),
    renderGoals(report.goals),
    el('h3', {text: 'Findings'}),
    renderFilters(),
    renderFindings(report.findings, project, id),
    el('h3', {text: 'Pages visited'}),
    el(
      'ul',
      {},
      ...report.pages.map(page =>
        el('li', {
          text: `${page.url} · HTTP ${page.status ?? 'none'} · ${page.durationMs} ms`,
        }),
      ),
    ),
  );
}

/** @param {string} term @param {string} value @return {!Array<!HTMLElement>} */
function fact(term, value) {
  return [el('dt', {text: term}), el('dd', {text: value})];
}

/** @param {!Array<!Object>} goals @return {!HTMLElement} */
function renderGoals(goals) {
  if (!goals.length)
    return el('p', {className: 'empty', text: 'No AI test goals in this run.'});
  return el(
    'div',
    {className: 'cards'},
    ...goals.map(goal => {
      const info = GOAL_INFO[goal.status];
      return el(
        'article',
        {className: 'card'},
        el(
          'div',
          {className: 'card-head'},
          badge(goal.status, info.label, info.icon),
          el('span', {className: 'card-title', text: goal.id}),
        ),
        el('p', {text: goal.goal}),
        el('p', {className: 'label', text: 'Result'}),
        el('p', {text: goal.summary}),
        goal.steps.length
          ? el('p', {className: 'label', text: 'What the agent did'})
          : null,
        goal.steps.length
          ? el(
              'ol',
              {className: 'steps'},
              ...goal.steps.map(step => {
                const stepInfo = STEP_INFO[step.outcome];
                return el(
                  'li',
                  {},
                  el('span', {className: 'step-no', text: String(step.number)}),
                  badge(step.outcome, stepInfo.label, stepInfo.icon),
                  el(
                    'span',
                    {className: 'step-text'},
                    step.description,
                    el('br'),
                    el('span', {className: 'step-detail', text: step.detail}),
                  ),
                );
              }),
            )
          : null,
      );
    }),
  );
}

/** @return {!HTMLElement} */
function renderFilters() {
  const options = [
    ['all', 'All'],
    ...SEVERITIES.map(s => [s, s]),
    ['confirm', 'AI: to confirm'],
  ];
  return el(
    'div',
    {className: 'filters', role: 'group', 'aria-label': 'Filter findings'},
    ...options.map(([value, label]) =>
      el('button', {
        type: 'button',
        className: 'btn btn-small btn-grey',
        'aria-pressed': String(ui.filter === value),
        text: label,
        onclick: () => {
          ui.filter = value;
          renderReport();
        },
      }),
    ),
  );
}

/**
 * @param {!Array<!Object>} findings
 * @param {string} project
 * @param {string} id
 * @return {!HTMLElement}
 */
function renderFindings(findings, project, id) {
  const shown = findings.filter(f =>
    ui.filter === 'all'
      ? true
      : ui.filter === 'confirm'
        ? f.confirmation === 'to-confirm'
        : f.severity === ui.filter,
  );
  if (!shown.length)
    return el('p', {
      className: 'empty',
      text: 'Nothing to show for this filter.',
    });
  return el(
    'div',
    {className: 'cards'},
    ...shown.map(f => renderFinding(f, project, id)),
  );
}

/**
 * @param {!Object} f
 * @param {string} project
 * @param {string} id
 * @return {!HTMLElement}
 */
function renderFinding(f, project, id) {
  const card = el(
    'article',
    {className: 'card'},
    el(
      'div',
      {className: 'card-head'},
      badge(f.severity, f.severity, SEVERITY_INFO[f.severity].icon),
      el('span', {className: 'badge b-source', text: f.source}),
      f.confirmation === 'to-confirm'
        ? badge('confirm', 'To confirm', 'question')
        : null,
      f.occurrences > 1
        ? el('span', {
            className: 'badge b-source',
            text: `Seen ${f.occurrences}x`,
          })
        : null,
    ),
    el('div', {className: 'card-title', text: f.title}),
    el('p', {className: 'step-detail', text: `Page: ${f.pageUrl}`}),
    el('pre', {text: f.detail}),
  );
  if (f.stepsToReproduce?.length) {
    card.append(
      el('p', {className: 'label', text: 'Steps to reproduce'}),
      el(
        'ol',
        {className: 'repro'},
        ...f.stepsToReproduce.map(step => el('li', {text: step})),
      ),
    );
  }
  if (f.evidence) {
    card.append(
      el('p', {className: 'label', text: 'Evidence'}),
      el('pre', {text: f.evidence}),
    );
  }
  if (f.screenshot) {
    const file = f.screenshot.replace(/^screenshots\//, '');
    const src =
      `/api/reports/${encodeURIComponent(project)}/${encodeURIComponent(id)}` +
      `/screenshots/${encodeURIComponent(file)}`;
    card.append(
      el('p', {className: 'label', text: 'Screenshot'}),
      el(
        'a',
        {href: src, target: '_blank', rel: 'noopener'},
        el('img', {
          className: 'shot',
          src,
          alt: `Screenshot for: ${f.title}`,
          loading: 'lazy',
        }),
      ),
    );
  }
  return card;
}

// ---------------------------------------------------------------- start

function init() {
  renderLegend();
  renderRunState(null);
  replaceLogs([]);
  $('close-report').addEventListener('click', () => {
    $('report-view').hidden = true;
    ui.openReport = null;
    loadReports();
  });
  connectEvents();
  loadProjects();
  loadReports();
  loadHealth();
}

init();
