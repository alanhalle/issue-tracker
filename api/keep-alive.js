import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    await db.from('projects').select('id').limit(1)
    res.json({ ok: true, ts: new Date().toISOString() })
  } catch {
    res.json({ ok: false })
  }
}
