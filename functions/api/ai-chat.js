// functions/api/ai-chat.js

const SYSTEM_PROMPT = `You are AgroCart's assistant. You help farmers, institutions,
and carriers with questions about FMPP/LFPP grants, organic certification,
regional pricing, cold-chain logistics, and freight bookings on the AgroCart platform.
Keep answers concise and specific to AgroCart's features.

Reference facts:
- FMPP/LFPP grants offer up to $500k for food hubs, distributors, and aggregators.
- Institutional contracts on AgroCart qualify for automatic 15% offset.
- Organic certification: 3-year transition, USDA Cost Share reimburses up to $500/year.
- AgroCart's freight network averages 98.2% on-time delivery.
- Reefer trucks earn a 12% cold-chain premium automatically.`;

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid message' }), { status: 400 });
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
        max_tokens: 500
      })
    });

    if (!dsResponse.ok) {
      const errText = await dsResponse.text();
      console.error('DeepSeek error:', errText);
      return new Response(JSON.stringify({ error: 'AI service error' }), { status: 502 });
    }

    const data = await dsResponse.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";

    return new Response(JSON.stringify({ reply }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Function error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}

// Optional: handle unsupported methods cleanly
export async function onRequestGet() {
  return new Response('Method not allowed', { status: 405 });
}