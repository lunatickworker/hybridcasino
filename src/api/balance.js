export default async function handler(req, res) {
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

  // POST 요청만 허용
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Only POST is supported.' });
    return;
  }

  try {
    // body를 문자열로 변환 (이미 파싱되어 있으면 다시 JSON으로)
    const bodyString = typeof req.body === 'string' 
      ? req.body 
      : JSON.stringify(req.body);

    console.log('[Vercel Proxy] /balance request:', {
      method: req.method,
      body: bodyString
    });

    // Supabase Edge Function으로 프록시 (Authorization 헤더 추가)
    const response = await fetch(`${SUPABASE_URL}/functions/v1/server/balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: bodyString
    });

    const data = await response.json();
    
    console.log('[Vercel Proxy] /balance response:', {
      status: response.status,
      data
    });

    res.status(response.status).json(data);
  } catch (error) {
    console.error('[Vercel Proxy] /balance error:', error);
    res.status(500).json({ error: error.message });
  }
}
