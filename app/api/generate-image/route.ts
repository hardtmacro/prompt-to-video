import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      // Fallback: generate procedural SVG
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect width="512" height="512" fill="#1a1a2e"/>
        <circle cx="256" cy="200" r="120" fill="#e94560" opacity="0.6"/>
        <circle cx="180" cy="300" r="80" fill="#0f3460" opacity="0.5"/>
        <circle cx="350" cy="280" r="100" fill="#533483" opacity="0.4"/>
        <text x="256" y="460" text-anchor="middle" fill="white" font-size="16" opacity="0.7">${prompt.slice(0, 40)}</text>
      </svg>`;
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      return NextResponse.json({ url: dataUrl });
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, num_steps: 4 }),
      }
    );

    if (!response.ok) {
      throw new Error(`Workers AI error: ${response.status}`);
    }

    const data = await response.json() as { result?: { image?: string } };
    const imageBase64 = data?.result?.image;
    if (!imageBase64) {
      throw new Error('No image in response');
    }
    return NextResponse.json({ url: `data:image/jpeg;base64,${imageBase64}` });
  } catch (error) {
    console.error('Image generation error:', error);
    return NextResponse.json({ error: 'Image generation failed' }, { status: 500 });
  }
}
