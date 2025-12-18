import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const SUPABASE_URL = 'https://hduofjzsitoaujyjvuix.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkdW9manpzaXRvYXVqeWp2dWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQzMzg1NDcsImV4cCI6MjA0OTkxNDU0N30.hS2d-yf2h61FBMdFPW7HZ-WFZcLMXUOWnZU__s-ksRA';

  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Supabase Edge Function으로 프록시 (Authorization 헤더 추가)
    const response = await fetch(`${SUPABASE_URL}/functions/v1/server/changebalance`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        ...Object.fromEntries(
          Object.entries(req.headers).filter(([key]) => 
            key.toLowerCase() !== 'host' && 
            key.toLowerCase() !== 'authorization'
          )
        )
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
}
