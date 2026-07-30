// functions/api/ai-chat.js

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

/**
 * Helper to build a JSON Response with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',      // allow frontend from any origin
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

/**
 * Handle preflight OPTIONS requests (browsers send these for POST with JSON body)
 */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

/**
 * Main POST handler – called when the user sends a message
 */
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 1. Parse the incoming JSON body safely
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    const message = (body?.message || '').toString().trim();
    if (!message) {
      return jsonResponse({ error: 'Message is required' }, 400);
    }
    if (message.length > 2000) {
      return jsonResponse({ error: 'Message too long' }, 400);
    }

    // 2. Verify the API key is available (server-side secret)
    if (!env.DEEPSEEK_API_KEY) {
      console.error('Missing DEEPSEEK_API_KEY secret');
      return jsonResponse({ error: 'AI service not configured' }, 500);
    }

    // 3. Call DeepSeek API
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
      return jsonResponse({ error: 'AI service error' }, 502);
    }

    const data = await dsResponse.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return jsonResponse({ error: 'Empty response from AI' }, 502);
    }

    // 4. Send successful reply
    return jsonResponse({ reply });

  } catch (err) {
    console.error('Function error:', err);
    return jsonResponse({ error: 'Server error' }, 500);
  }
}

/**
 * GET handler – returns an error because this endpoint only accepts POST
 */
export async function onRequestGet() {
  return jsonResponse({ error: 'Use POST' }, 405);
}