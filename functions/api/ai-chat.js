// functions/api/ai-chat.js
// Cloudflare Pages Function — handles POST /api/ai-chat
// Keeps the DeepSeek API key server-side (set via Cloudflare dashboard
// or `wrangler pages secret put DEEPSEEK_API_KEY`).

const SYSTEM_PROMPT = `You are AgroBot, the assistant embedded in the AgroCart platform
(a USDA-aligned farm-to-table marketplace connecting farmers, buyers, institutions,
and freight carriers). Answer questions about FMPP/LFPP grants, organic certification,
regional pricing, cold-chain logistics, and freight bookings on AgroCart. Keep answers
concise (2-4 sentences), specific, and grounded in the facts below. If a question falls
outside AgroCart's scope, say so briefly and redirect to what you can help with.

Reference facts:
- FMPP offers grants up to $500k for direct marketing; LFPP offers up to $500k for food
  hubs, distributors, and aggregators. Apply at grants.usda.gov, deadline March 15.
  AgroCart platform activity counts toward eligibility documentation.
- Organic certification requires a 3-year transition. USDA Cost Share reimburses up to
  $500/year. AgroCart partners with 12 USDA-accredited certifiers. Timeline is typically
  6-9 months from application to certificate.
- Current price averages: tomatoes $4.80/lb, blueberries $7.10/pint, honey $15.20/jar,
  leafy greens up 8% due to winter demand. AgroCart pricing runs 12-18% above wholesale
  average, with that margin going directly to farmers.
- Cold-chain best practice: maintain 2-4°C, use ethylene-absorbing packaging for mixed
  loads, minimize stops. AgroCart's network averages 98.2% on-time delivery with
  GPS-monitored refrigerated transport.
- Institutional contracts on AgroCart qualify for an automatic 15% offset; contracts of
  6+ months get priority grant review. 452 institutions are currently enrolled.
- The Freight & Logistics hub lets any trucking company list truck availability for free,
  zero commission. Reefer trucks earn a 12% cold-chain premium automatically. Carriers
  track bookings from the My Fleet tab.`;

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const message = (body?.message || '').toString().trim();
    if (!message) {
      return json({ error: 'Message is required' }, 400);
    }
    if (message.length > 2000) {
      return json({ error: 'Message too long' }, 400);
    }

    if (!env.DEEPSEEK_API_KEY) {
      // Fails safe: frontend falls back to its local knowledge base if this errors.
      return json({ error: 'AI service not configured' }, 500);
    }

    const dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        max_tokens: 400,
        temperature: 0.4
      })
    });

    if (!dsResponse.ok) {
      const errText = await dsResponse.text();
      console.error('DeepSeek API error:', dsResponse.status, errText);
      return json({ error: 'AI service error' }, 502);
    }

    const data = await dsResponse.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return json({ error: 'Empty response from AI service' }, 502);
    }

    return json({ reply });

  } catch (err) {
    console.error('ai-chat function error:', err);
    return json({ error: 'Server error' }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: 'Method not allowed' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}