// Vercel Function: receives the TileTrust quote form and emails it via Resend.
// Env vars (set in the Vercel project "tiletrust-website"):
//   RESEND_API_KEY  - Resend API key (the same one the PoolRevive project uses)
//   ENQUIRY_FROM    - a sender address on a domain verified in Resend
//   ENQUIRY_TO      - where enquiries go (info@ and dan@tiletrustltd.co.uk both land in the TileTrust Ltd mailbox)
// If any are missing the function answers 503 and the page falls back to opening the visitor's email app.

const FIELDS = ['name', 'company', 'phone', 'email', 'sector', 'location', 'details'];
const LABELS = { name: 'Name', company: 'Company', phone: 'Phone', email: 'Email', sector: 'Project type', location: 'Location', details: 'Project details' };

const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if ((req.headers['content-type'] || '').includes('application/json')) return JSON.parse(raw || '{}');
  return Object.fromEntries(new URLSearchParams(raw));
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body;
  try { body = await readBody(req); } catch { return res.status(400).json({ ok: false }); }
  if (body.tt_hp) return res.status(200).json({ ok: true }); // honeypot: bots fill hidden fields
  const data = Object.fromEntries(FIELDS.map((f) => [f, String(body[f] ?? '').slice(0, 4000).trim()]));
  if (!data.name || !data.email || !body.consent) return res.status(422).json({ ok: false, error: 'missing_fields' });
  const { RESEND_API_KEY, ENQUIRY_FROM, ENQUIRY_TO } = process.env;
  if (!RESEND_API_KEY || !ENQUIRY_FROM || !ENQUIRY_TO) {
    console.error('[enquiry] RESEND_API_KEY, ENQUIRY_FROM or ENQUIRY_TO is not set in Vercel');
    return res.status(503).json({ ok: false, error: 'email_not_configured' });
  }
  const rows = FIELDS.map((f) => `<tr><th align="left" style="padding:4px 12px 4px 0">${LABELS[f]}</th><td>${esc(data[f]).replace(/\n/g, '<br>')}</td></tr>`).join('');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `TileTrust website <${ENQUIRY_FROM}>`,
      to: [ENQUIRY_TO],
      reply_to: data.email,
      subject: `TileTrust quote request: ${data.name}${data.sector ? `, ${data.sector}` : ''}`,
      html: `<p>New quote request from www.tiletrustltd.co.uk.</p><table>${rows}</table><p>Reply to this email to answer the customer directly.</p>`,
    }),
  }).catch((e) => { console.error('[enquiry] could not reach Resend:', e); return null; });
  if (!r || !r.ok) {
    if (r) console.error(`[enquiry] Resend refused (${r.status}):`, await r.text());
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
  return res.status(200).json({ ok: true });
};
