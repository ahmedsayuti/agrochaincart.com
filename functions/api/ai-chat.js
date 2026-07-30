export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Check for the secret
  const keyStatus = env.DEEPSEEK_API_KEY
    ? `Key present, starts with: ${env.DEEPSEEK_API_KEY.slice(0, 5)}...`
    : `Key MISSING`;

  // 2. Try to call DeepSeek and capture every detail
  let deepseekResult;
  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY || 'missing'}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' }
        ],
        max_tokens: 10,
        temperature: 0.4
      })
    });

    const text = await resp.text();
    deepseekResult = {
      status: resp.status,
      ok: resp.ok,
      body: text.slice(0, 500)  // first 500 chars, enough to see error
    };
  } catch (fetchError) {
    deepseekResult = {
      fetchError: fetchError.message,
      stack: fetchError.stack
    };
  }

  // Return everything as JSON so you can read it in the browser Network tab
  return new Response(JSON.stringify({
    keyStatus,
    deepseekResult
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}