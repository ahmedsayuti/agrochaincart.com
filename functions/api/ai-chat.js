export async function onRequestPost() {
  return new Response(JSON.stringify({ reply: 'Hello from POST' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}