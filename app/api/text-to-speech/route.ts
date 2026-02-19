import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { text, voiceId } = await request.json();
    if (!text) {
      return NextResponse.json({ error: 'Text required' }, { status: 400 });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      // Fallback: return empty (client will use SpeechSynthesis)
      return NextResponse.json({ fallback: true });
    }

    const body: Record<string, string> = { prompt: text };
    if (voiceId) body.lang = voiceId;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell-ai/melotts`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      return NextResponse.json({ fallback: true });
    }

    const data = await response.json() as { result?: { audio?: string } };
    const audioBase64 = data?.result?.audio;
    if (!audioBase64) {
      return NextResponse.json({ fallback: true });
    }
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    return new Response(audioBuffer, {
      headers: { 'Content-Type': 'audio/wav' },
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ fallback: true });
  }
}
