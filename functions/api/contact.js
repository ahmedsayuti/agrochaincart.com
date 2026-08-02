// functions/api/contact.js
//
// Handles submissions from the AgroChain Cart contact form
// (fname, lname, email, org, role, subject, message, attachments)
// and emails them to the AgroChain Cart inbox via Cloudflare Email
// Service's REST API — no third-party email provider involved.
//
// Required Cloudflare Pages environment variables (Settings → Environment
// variables, set for both Production and Preview):
//   CF_ACCOUNT_ID        — your Cloudflare account ID (plain text var)
//   CF_EMAIL_API_TOKEN   — an API token with "Email Sending: Edit" permission
//                           (create under My Profile → API Tokens; store as
//                           an encrypted/secret variable, not plain text)
//
// One-time setup in the Cloudflare dashboard (Compute & AI → Email Service):
//   1. Onboard the sending domain (agrochaincart.com) and add the SPF/DKIM
//      DNS records it gives you.
//   2. Under Email Routing → Destination Addresses, add and verify
//      sayuti152@gmail.com (click the confirmation link Cloudflare emails
//      to that address once). Sends to a verified destination address are
//      free on any plan.

const DESTINATION_EMAIL = 'sayuti152@gmail.com';
const FROM_EMAIL = 'forms@agrochaincart.com'; // must be on the onboarded domain
const FROM_NAME = 'AgroChain Cart — Contact Form';

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;       // matches the 10 MB note in the UI
const MAX_TOTAL_EMAIL_BYTES = 4.5 * 1024 * 1024; // stay under Cloudflare's 5 MiB message cap

const ROLE_LABELS = {
  farmer: 'Farmer / Grower',
  consumer: 'Household / Consumer',
  restaurant: 'Restaurant / Chef',
  retailer: 'Retailer / Grocery',
  school: 'School / University',
  hospital: 'Hospital / Healthcare',
  government: 'Government Agency',
  investor: 'Investor / Partner',
  press: 'Press / Media',
  other: 'Other',
};

export async function onRequestPost(context) {
  const { request, env } = context;

  const accountId = env.CF_ACCOUNT_ID;
  const apiToken = env.CF_EMAIL_API_TOKEN;
  if (!accountId || !apiToken) {
    return jsonResponse({ ok: false, error: 'Server misconfigured: missing email credentials.' }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Could not read form data.' }, 400);
  }

  const fname = (form.get('fname') || '').toString().trim();
  const lname = (form.get('lname') || '').toString().trim();
  const email = (form.get('email') || '').toString().trim();
  const org = (form.get('org') || '').toString().trim();
  const role = (form.get('role') || '').toString().trim();
  const subject = (form.get('subject') || '').toString().trim();
  const message = (form.get('message') || '').toString().trim();

  // ── Server-side validation (mirrors the client-side checks) ──
  const errors = [];
  if (!fname) errors.push('First name is required.');
  if (!lname) errors.push('Last name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('A valid email address is required.');
  if (message.length < 20) errors.push('Message must be at least 20 characters.');
  if (errors.length) {
    return jsonResponse({ ok: false, error: errors.join(' ') }, 400);
  }

  // ── Collect + validate attachments ──
  const fileEntries = form.getAll('attachments').filter((v) => v instanceof File && v.size > 0);

  let totalBytes = 0;
  const attachments = [];
  for (const file of fileEntries) {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return jsonResponse({ ok: false, error: `"${file.name}" is not an allowed file type.` }, 400);
    }
    if (file.size > MAX_FILE_BYTES) {
      return jsonResponse({ ok: false, error: `"${file.name}" exceeds the 10 MB limit.` }, 400);
    }
    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_EMAIL_BYTES) {
      return jsonResponse({ ok: false, error: 'Attachments are too large combined (5 MB email limit). Please remove one and try again.' }, 400);
    }
    const buf = await file.arrayBuffer();
    attachments.push({
      filename: file.name,
      content: arrayBufferToBase64(buf),
      type: file.type || 'application/octet-stream',
    });
  }

  const roleLabel = ROLE_LABELS[role] || role || '—';
  const html = buildEmailHtml({ fname, lname, email, org, roleLabel, subject, message });
  const text = buildEmailText({ fname, lname, email, org, roleLabel, subject, message });

  const emailPayload = {
    to: DESTINATION_EMAIL,
    from: { address: FROM_EMAIL, name: FROM_NAME },
    reply_to: email, // hit "reply" in your inbox to answer the sender directly
    subject: `[Contact] ${subject || 'New message'} — ${fname} ${lname}`,
    html,
    text,
  };
  if (attachments.length) emailPayload.attachments = attachments;

  let cfResp;
  try {
    cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Could not reach the email service: ' + err.message }, 502);
  }

  if (!cfResp.ok) {
    const errText = await cfResp.text().catch(() => '');
    return jsonResponse({ ok: false, error: `Email service rejected the message (${cfResp.status}): ${errText.slice(0, 200)}` }, 502);
  }

  return jsonResponse({ ok: true });
}

export async function onRequestGet() {
  return jsonResponse({ ok: false, error: 'Method not allowed — use POST.' }, 405);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // avoid call-stack blowups on large files
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailHtml({ fname, lname, email, org, roleLabel, subject, message }) {
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br/>');
  return `
  <div style="font-family:'Plus Jakarta Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8faf4;padding:24px;">
    <div style="background:#1a3a2a;border-radius:12px 12px 0 0;padding:20px 24px;">
      <span style="font-family:Georgia,serif;font-weight:700;font-size:1.1rem;color:#74c69d;">AgroChain<span style="background:#2d6a4f;color:#fff;padding:2px 8px;border-radius:6px;margin-left:4px;">Cart</span></span>
    </div>
    <div style="background:#ffffff;border:1px solid #e8f0eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      <h2 style="color:#1a3a2a;font-size:1.15rem;margin:0 0 16px;">New contact form submission</h2>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem;color:#0f1f17;">
        <tr><td style="padding:6px 0;color:#4a5e52;width:120px;">Name</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(fname)} ${escapeHtml(lname)}</td></tr>
        <tr><td style="padding:6px 0;color:#4a5e52;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#2d6a4f;">${escapeHtml(email)}</a></td></tr>
        ${org ? `<tr><td style="padding:6px 0;color:#4a5e52;">Organization</td><td style="padding:6px 0;">${escapeHtml(org)}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#4a5e52;">Role</td><td style="padding:6px 0;">${escapeHtml(roleLabel)}</td></tr>
        ${subject ? `<tr><td style="padding:6px 0;color:#4a5e52;">Subject</td><td style="padding:6px 0;">${escapeHtml(subject)}</td></tr>` : ''}
      </table>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e8f0eb;">
        <p style="color:#4a5e52;font-size:0.8rem;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.03em;">Message</p>
        <p style="font-size:0.95rem;line-height:1.6;margin:0;">${safeMessage}</p>
      </div>
    </div>
    <p style="text-align:center;color:#6b8577;font-size:0.75rem;margin-top:16px;">Sent from the AgroChain Cart contact form · Reply-to is set to the sender's address.</p>
  </div>`;
}

function buildEmailText({ fname, lname, email, org, roleLabel, subject, message }) {
  return [
    'New contact form submission — AgroChain Cart',
    '',
    `Name: ${fname} ${lname}`,
    `Email: ${email}`,
    org ? `Organization: ${org}` : null,
    `Role: ${roleLabel}`,
    subject ? `Subject: ${subject}` : null,
    '',
    'Message:',
    message,
  ].filter(Boolean).join('\n');
}