const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    await db.from('projects').select('id').limit(1)
    res.json({ ok: true, ts: new Date().toISOString() })
  } catch {
    res.json({ ok: false })
  }
}
