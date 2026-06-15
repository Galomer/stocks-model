import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const session_id: string | undefined = body.session_id
  const disclaimer_version: string = body.disclaimer_version ?? 'v1'

  if (!session_id || !/^[0-9a-f-]{36}$/.test(session_id)) {
    return NextResponse.json({ error: 'invalid session_id' }, { status: 400 })
  }

  const ip_address =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    null

  const user_agent = req.headers.get('user-agent') ?? null

  const { error } = await supabase.from('disclaimer_acceptances').insert({
    session_id,
    disclaimer_version,
    ip_address,
    user_agent,
  })

  if (error) {
    console.error('[disclaimer] insert error', error.message)
    return NextResponse.json({ error: 'db error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
