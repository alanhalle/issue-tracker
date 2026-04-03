import * as api from './api.js'

const STATUS_LABELS = { backlog: 'Backlog', open: 'Open', 'in-progress': 'In Progress', done: 'Done' }
const STATUS_FILTERS = ['all', 'backlog', 'open', 'in-progress', 'done']

let state = {
  projects: [],
  issues: [],
  assignees: [],
  selectedProjectId: null,
  selectedIssueId: null,
  statusFilter: 'all',
  assigneeFilter: 'all',
}

const sidebar = document.getElementById('sidebar')
const mainEl = document.getElementById('main')
const modalBackdrop = document.getElementById('modal-backdrop')
const modal = document.getElementById('modal')

// ── Helpers ──────────────────────────────────────────────────

function relDate(iso) {
  const d = new Date(iso), now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString()
}

function badge(status) {
  const cls = status === 'in-progress' ? 'in-progress' : status
  return `<span class="badge badge-${cls}">${STATUS_LABELS[status] || status}</span>`
}

function colorDot(color) {
  return `<span class="project-dot" style="background:${color || '#aaa'}"></span>`
}

function issueMatchesActiveFilters(issue) {
  if (!issue) return false
  if (state.statusFilter !== 'all' && issue.status !== state.statusFilter) return false
  if (state.assigneeFilter !== 'all' && issue.assigned_to !== state.assigneeFilter) return false
  return true
}

// ── Data loading ──────────────────────────────────────────────

async function load() {
  const [projects, issues, assignees] = await Promise.all([
    api.getProjects(),
    api.getIssues(),
    api.getAssignees(),
  ])
  state.projects = projects
  state.issues = issues
  state.assignees = assignees
  render()
}

async function reloadIssues() {
  state.issues = await api.getIssues({
    projectId: state.selectedProjectId,
  })
  renderMain()
}

// ── Render ────────────────────────────────────────────────────

function render() {
  renderSidebar()
  renderMain()
}

function renderSidebar() {
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
      </svg>
      Issues
    </div>
    <div class="project-list">
      <div class="project-item ${state.selectedProjectId === null ? 'active' : ''}" data-id="">
        ${colorDot('#888')} All Projects
      </div>
      ${state.projects.map(p => `
        <div class="project-item ${state.selectedProjectId === p.id ? 'active' : ''}" data-id="${p.id}">
          ${colorDot(p.color)} ${p.name}
        </div>
      `).join('')}
    </div>
    <button class="sidebar-new-btn" id="new-issue-btn">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg>
      New Issue
    </button>
  `

  sidebar.querySelectorAll('.project-item').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedProjectId = el.dataset.id || null
      state.selectedIssueId = null
      reloadIssues()
      renderSidebar()
    })
  })

  document.getElementById('new-issue-btn').addEventListener('click', showNewIssueModal)
}

function renderMain() {
  const filtered = state.issues.filter(issue => issueMatchesActiveFilters(issue))

  const toolbar = `
    <div class="toolbar">
      ${STATUS_FILTERS.map(f => `
        <div class="filter-tab ${state.statusFilter === f ? 'active' : ''}" data-filter="${f}">
          ${f === 'all' ? 'All' : STATUS_LABELS[f]}
        </div>
      `).join('')}
      <div class="toolbar-spacer"></div>
      <select class="assignee-filter" id="assignee-filter">
        <option value="all">All assignees</option>
        ${state.assignees.map(a => `<option value="${a}" ${state.assigneeFilter === a ? 'selected' : ''}>${a}</option>`).join('')}
      </select>
    </div>
  `

  const issueListHtml = filtered.length === 0
    ? `<div class="empty-state"><div>No issues found</div><p>Create a new issue or adjust your filters.</p></div>`
    : `<div class="issue-list-inner">
        ${filtered.map(issue => `
          <div class="issue-row ${state.selectedIssueId === issue.id ? 'selected' : ''}" data-id="${issue.id}">
            ${badge(issue.status)}
            <div class="issue-row-title">${escHtml(issue.title)}</div>
            ${issue.project ? `<span class="issue-row-meta" style="color:${issue.project.color}">${escHtml(issue.project.name)}</span>` : ''}
            <div class="issue-row-meta">${relDate(issue.created_at)}</div>
            <div class="issue-row-assignee">${issue.assigned_to ? escHtml(issue.assigned_to) : ''}</div>
          </div>
        `).join('')}
      </div>`

  const issueList = `
    <div class="issue-list">
      <div class="issue-count">${filtered.length} issue${filtered.length !== 1 ? 's' : ''}</div>
      ${issueListHtml}
    </div>
  `

  if (state.selectedIssueId) {
    mainEl.innerHTML = `
      ${toolbar}
      <div class="detail-wrap">
        ${issueList}
        <div id="detail-panel" class="detail-panel"><div class="loading">Loading…</div></div>
      </div>
    `
  } else {
    mainEl.innerHTML = `${toolbar}${issueList}`
  }

  // Toolbar filter tabs
  mainEl.querySelectorAll('.filter-tab').forEach(el => {
    el.addEventListener('click', () => {
      state.statusFilter = el.dataset.filter
      state.selectedIssueId = null
      renderMain()
    })
  })

  // Assignee filter
  const af = document.getElementById('assignee-filter')
  if (af) af.addEventListener('change', e => { state.assigneeFilter = e.target.value; renderMain() })

  // Issue rows
  mainEl.querySelectorAll('.issue-row').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedIssueId = el.dataset.id
      renderMain()
      loadDetail(el.dataset.id)
    })
  })

  // Load detail if selected
  if (state.selectedIssueId) loadDetail(state.selectedIssueId)
}

async function loadDetail(id) {
  const panel = document.getElementById('detail-panel')
  if (!panel) return
  const issue = await api.getIssue(id)
  if (!panel.isConnected) return
  renderDetail(panel, issue)
}

function renderDetail(panel, issue) {
  const comments = (issue.comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-title">${escHtml(issue.title)}</div>
      <button class="detail-close" id="detail-close">×</button>
    </div>
    <div class="detail-meta">
      <div class="detail-meta-row">
        <span class="detail-meta-label">Status</span>
        <div class="detail-meta-value">
          <select id="status-select">
            ${Object.entries(STATUS_LABELS).map(([v, l]) =>
              `<option value="${v}" ${issue.status === v ? 'selected' : ''}>${l}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="detail-meta-row">
        <span class="detail-meta-label">Assignee</span>
        <div class="detail-meta-value">
          <input id="assignee-input" value="${escHtml(issue.assigned_to || '')}" placeholder="unassigned" list="assignee-list" style="width:120px" />
          <datalist id="assignee-list">
            ${state.assignees.map(a => `<option value="${escHtml(a)}">`).join('')}
          </datalist>
        </div>
      </div>
      <div class="detail-meta-row">
        <span class="detail-meta-label">Project</span>
        <div class="detail-meta-value">
          <select id="project-select">
            ${state.projects.map(p => `<option value="${p.id}" ${issue.project_id === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="detail-meta-row">
        <span class="detail-meta-label">Created</span>
        <span style="font-size:13px">${relDate(issue.created_at)}</span>
      </div>
    </div>
    ${issue.notes
      ? `<div class="detail-notes">${escHtml(issue.notes)}</div>`
      : `<div class="detail-notes detail-notes-empty">No description.</div>`
    }
    <div class="detail-comments">
      <h4>Comments</h4>
      ${comments.map(c => `
        <div class="comment">
          <div class="comment-header">
            <span class="comment-author">${escHtml(c.author)}</span>
            <span class="comment-date">${relDate(c.created_at)}</span>
          </div>
          <div class="comment-body">${escHtml(c.body)}</div>
        </div>
      `).join('')}
      <div class="add-comment">
        <textarea id="comment-body" placeholder="Leave a comment…"></textarea>
        <div class="add-comment-row">
          <input id="comment-author" value="${escHtml(localStorage.getItem('issues_default_author') || 'alan')}" list="assignee-list2" placeholder="Your name" />
          <datalist id="assignee-list2">
            ${state.assignees.map(a => `<option value="${escHtml(a)}">`).join('')}
          </datalist>
          <button class="btn-primary" id="submit-comment">Comment</button>
        </div>
      </div>
    </div>
  `

  document.getElementById('detail-close').addEventListener('click', () => {
    state.selectedIssueId = null
    renderMain()
  })

  const statusSelect = document.getElementById('status-select')
  statusSelect.addEventListener('change', async e => {
    await api.updateIssue(issue.id, { status: e.target.value })
    const updatedIssue = { ...issue, status: e.target.value }
    state.issues = state.issues.map(i => i.id === issue.id ? updatedIssue : i)
    if (!issueMatchesActiveFilters(updatedIssue)) state.selectedIssueId = null
    renderMain()
    if (state.selectedIssueId === issue.id) loadDetail(issue.id)
  })

  const assigneeInput = document.getElementById('assignee-input')
  assigneeInput.addEventListener('change', async e => {
    const val = e.target.value.trim()
    await api.updateIssue(issue.id, { assigned_to: val || null })
    const updatedIssue = { ...issue, assigned_to: val }
    state.issues = state.issues.map(i => i.id === issue.id ? updatedIssue : i)
    if (val && !state.assignees.includes(val)) state.assignees.push(val)
    if (!issueMatchesActiveFilters(updatedIssue)) state.selectedIssueId = null
    renderMain()
    if (state.selectedIssueId === issue.id) loadDetail(issue.id)
  })

  const projectSelect = document.getElementById('project-select')
  projectSelect.addEventListener('change', async e => {
    const newProjectId = e.target.value
    await api.updateIssue(issue.id, { project_id: newProjectId })
    await reloadIssues()
  })

  document.getElementById('submit-comment').addEventListener('click', async () => {
    const body = document.getElementById('comment-body').value.trim()
    const author = document.getElementById('comment-author').value.trim() || 'alan'
    if (!body) return
    localStorage.setItem('issues_default_author', author)
    await api.addComment(issue.id, author, body)
    if (!state.assignees.includes(author)) state.assignees.push(author)
    loadDetail(issue.id)
  })
}

// ── New Issue Modal ───────────────────────────────────────────

function showNewIssueModal() {
  const scratchProject = state.projects.find(p => p.slug === 'scratch')
  const defaultProjectId = state.selectedProjectId || (scratchProject ? scratchProject.id : state.projects[0]?.id)

  modal.innerHTML = `
    <div class="modal-title">New Issue</div>
    <div class="form-group">
      <label>Title *</label>
      <input id="ni-title" placeholder="Issue title" autofocus />
    </div>
    <div class="form-group">
      <label>Project *</label>
      <select id="ni-project">
        ${state.projects.map(p => `
          <option value="${p.id}" ${p.id === defaultProjectId ? 'selected' : ''}>${p.name}</option>
        `).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="ni-status">
        ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Assigned to</label>
      <input id="ni-assignee" list="ni-assignee-list" placeholder="alan, claude, cn…" />
      <datalist id="ni-assignee-list">
        ${state.assignees.map(a => `<option value="${escHtml(a)}">`).join('')}
      </datalist>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="ni-notes" placeholder="Optional description…"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-cancel" id="ni-cancel">Cancel</button>
      <button class="btn-primary" id="ni-submit">Create Issue</button>
    </div>
  `

  modalBackdrop.classList.remove('hidden')
  modal.classList.remove('hidden')
  document.getElementById('ni-title').focus()

  document.getElementById('ni-cancel').addEventListener('click', closeModal)
  modalBackdrop.addEventListener('click', closeModal)

  document.getElementById('ni-submit').addEventListener('click', async () => {
    const title = document.getElementById('ni-title').value.trim()
    const projectId = document.getElementById('ni-project').value
    const status = document.getElementById('ni-status').value
    const assignedTo = document.getElementById('ni-assignee').value.trim()
    const notes = document.getElementById('ni-notes').value.trim()
    if (!title || !projectId) return

    const issue = await api.createIssue({ projectId, title, assignedTo, notes, status })
    if (assignedTo && !state.assignees.includes(assignedTo)) state.assignees.push(assignedTo)
    closeModal()
    await reloadIssues()
    state.selectedIssueId = issue.id
    renderMain()
  })
}

function closeModal() {
  modalBackdrop.classList.add('hidden')
  modal.classList.add('hidden')
}

// ── Util ──────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Boot ──────────────────────────────────────────────────────

mainEl.innerHTML = '<div class="loading">Loading…</div>'
load()
