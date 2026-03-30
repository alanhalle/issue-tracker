import { createClient } from '@supabase/supabase-js'

const db = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export async function getProjects() {
  const { data } = await db.from('projects').select('*').order('name')
  return data || []
}

export async function getIssues({ projectId, status, assignedTo } = {}) {
  let q = db
    .from('issues')
    .select('*, project:projects(name, slug, color)')
    .order('created_at', { ascending: false })
  if (projectId) q = q.eq('project_id', projectId)
  if (status) q = q.eq('status', status)
  if (assignedTo) q = q.eq('assigned_to', assignedTo)
  const { data } = await q
  return data || []
}

export async function getIssue(id) {
  const { data } = await db
    .from('issues')
    .select('*, project:projects(name, slug, color), comments(*)')
    .eq('id', id)
    .single()
  return data
}

export async function createIssue({ projectId, title, assignedTo, notes, status = 'backlog' }) {
  const { data } = await db
    .from('issues')
    .insert({ project_id: projectId, title, assigned_to: assignedTo || null, notes: notes || null, status })
    .select()
    .single()
  return data
}

export async function updateIssue(id, updates) {
  const patch = { updated_at: new Date().toISOString() }
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.assigned_to !== undefined) patch.assigned_to = updates.assigned_to
  if (updates.notes !== undefined) patch.notes = updates.notes
  const { data } = await db.from('issues').update(patch).eq('id', id).select().single()
  return data
}

export async function addComment(issueId, author, body) {
  const { data } = await db
    .from('comments')
    .insert({ issue_id: issueId, author, body })
    .select()
    .single()
  return data
}

export async function getAssignees() {
  const { data } = await db.from('issues').select('assigned_to').not('assigned_to', 'is', null)
  const names = [...new Set((data || []).map(r => r.assigned_to).filter(Boolean))]
  for (const seed of ['alan', 'claude', 'cn']) {
    if (!names.includes(seed)) names.unshift(seed)
  }
  return names
}
