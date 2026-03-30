import { createClient } from '@supabase/supabase-js'

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

const TOOLS = [
  {
    name: 'list_projects',
    description: 'Returns all projects',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_issues',
    description: 'Returns issues, optionally filtered by project, status, or assignee',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Filter by project slug' },
        status: {
          type: 'string',
          enum: ['backlog', 'open', 'in-progress', 'done'],
          description: 'Filter by status',
        },
        assigned_to: { type: 'string', description: 'Filter by assignee name' },
      },
      required: [],
    },
  },
  {
    name: 'get_issue',
    description: 'Returns a single issue with its comments',
    inputSchema: {
      type: 'object',
      properties: { issue_id: { type: 'string', description: 'UUID of the issue' } },
      required: ['issue_id'],
    },
  },
  {
    name: 'create_issue',
    description: 'Creates a new issue',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: { type: 'string', description: 'Slug of the project' },
        title: { type: 'string', description: 'Issue title' },
        assigned_to: { type: 'string', description: 'Assignee name' },
        notes: { type: 'string', description: 'Optional longer description' },
      },
      required: ['project_slug', 'title'],
    },
  },
  {
    name: 'update_issue',
    description: 'Updates status, assignee, or notes on an issue',
    inputSchema: {
      type: 'object',
      properties: {
        issue_id: { type: 'string', description: 'UUID of the issue' },
        status: { type: 'string', enum: ['backlog', 'open', 'in-progress', 'done'] },
        assigned_to: { type: 'string' },
        notes: { type: 'string' },
        project_slug: { type: 'string', description: 'Move issue to this project slug' },
      },
      required: ['issue_id'],
    },
  },
  {
    name: 'add_comment',
    description: 'Appends a comment to an issue',
    inputSchema: {
      type: 'object',
      properties: {
        issue_id: { type: 'string', description: 'UUID of the issue' },
        author: { type: 'string', description: 'Author name (alan, claude, cn, etc.)' },
        body: { type: 'string', description: 'Comment text' },
      },
      required: ['issue_id', 'author', 'body'],
    },
  },
  {
    name: 'close_issue',
    description: 'Sets an issue status to done',
    inputSchema: {
      type: 'object',
      properties: { issue_id: { type: 'string', description: 'UUID of the issue' } },
      required: ['issue_id'],
    },
  },
]

async function callTool(name, args) {
  const db = supabase()

  try {
    if (name === 'list_projects') {
      const { data } = await db.from('projects').select('*').order('name')
      return data || []
    }

    if (name === 'list_issues') {
      let q = db
        .from('issues')
        .select('*, project:projects(name, slug, color)')
        .order('created_at', { ascending: false })
      if (args.project_slug) {
        const { data: proj } = await db
          .from('projects')
          .select('id')
          .eq('slug', args.project_slug)
          .single()
        if (proj) q = q.eq('project_id', proj.id)
      }
      if (args.status) q = q.eq('status', args.status)
      if (args.assigned_to) q = q.eq('assigned_to', args.assigned_to)
      const { data } = await q
      return data || []
    }

    if (name === 'get_issue') {
      const { data: issue } = await db
        .from('issues')
        .select('*, project:projects(name, slug, color), comments(*)')
        .eq('id', args.issue_id)
        .single()
      return issue || null
    }

    if (name === 'create_issue') {
      const { data: proj } = await db
        .from('projects')
        .select('id')
        .eq('slug', args.project_slug)
        .single()
      if (!proj) return { error: `Project not found: ${args.project_slug}` }
      const { data } = await db
        .from('issues')
        .insert({ project_id: proj.id, title: args.title, assigned_to: args.assigned_to || null, notes: args.notes || null })
        .select()
        .single()
      return data
    }

    if (name === 'update_issue') {
      const updates = {}
      if (args.status !== undefined) updates.status = args.status
      if (args.assigned_to !== undefined) updates.assigned_to = args.assigned_to
      if (args.notes !== undefined) updates.notes = args.notes
      if (args.project_slug !== undefined) {
        const { data: proj } = await db.from('projects').select('id').eq('slug', args.project_slug).single()
        if (!proj) return { error: `Project not found: ${args.project_slug}` }
        updates.project_id = proj.id
      }
      updates.updated_at = new Date().toISOString()
      const { data } = await db.from('issues').update(updates).eq('id', args.issue_id).select().single()
      return data
    }

    if (name === 'add_comment') {
      const { data } = await db
        .from('comments')
        .insert({ issue_id: args.issue_id, author: args.author, body: args.body })
        .select()
        .single()
      return data
    }

    if (name === 'close_issue') {
      const { data } = await db
        .from('issues')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', args.issue_id)
        .select()
        .single()
      return data
    }

    return { error: `Unknown tool: ${name}` }
  } catch (e) {
    return { error: e.message }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { jsonrpc, id, method, params } = req.body || {}

  if (method === 'notifications/initialized') return res.status(202).end()

  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'issue-tracker', version: '1.0.0' },
      },
    })
  }

  if (method === 'tools/list') {
    return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {}
    const result = await callTool(name, args)
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      },
    })
  }

  return res.json({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: 'Method not found' },
  })
}
