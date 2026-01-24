export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

/**
 * CORS preflight 요청 처리
 * @param req - 요청 객체
 * @returns CORS preflight 응답 또는 null
 */
export function handleCORSPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }
  return null;
}

/**
 * 응답에 CORS 헤더 추가
 * @param body - 응답 body
 * @param status - HTTP 상태 코드
 * @returns CORS 헤더가 포함된 Response
 */
export function createCORSResponse(
  body: any,
  status: number = 200
): Response {
  return new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    }
  );
}
