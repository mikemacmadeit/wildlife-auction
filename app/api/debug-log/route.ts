/**
 * POST /api/debug-log
 * Appends a JSON line to .cursor/debug.log for runtime debugging.
 * Only available in development.
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  try {
    const body = await request.json();
    const line = JSON.stringify({ ...body, _t: Date.now() }) + '\n';
    const dir = path.join(process.cwd(), '.cursor');
    const file = path.join(dir, 'debug.log');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(file, line);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
