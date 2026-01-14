/**
 * 로그 보안 유틸리티
 * API Key, Authorization 등 민감한 정보를 마스킹
 */

/**
 * API Key 마스킹 (앞 3글자 + *** + 뒤 4글자)
 * @example maskApiKey("abc123def456") => "abc***456"
 */
export function maskApiKey(key: string | undefined): string {
  if (!key || typeof key !== 'string' || key.length < 7) {
    return '***';
  }
  return `${key.substring(0, 3)}***${key.substring(key.length - 4)}`;
}

/**
 * 토큰 마스킹 (뒤 4글자만 표시)
 * @example maskToken("eyJhbGc...token") => "***token"
 */
export function maskToken(token: string | undefined): string {
  if (!token || typeof token !== 'string' || token.length < 4) {
    return '***';
  }
  return `***${token.substring(token.length - 4)}`;
}

/**
 * Secret Key 마스킹
 * @example maskSecretKey("secret123key") => "***3key"
 */
export function maskSecretKey(key: string | undefined): string {
  if (!key || typeof key !== 'string' || key.length < 4) {
    return '***';
  }
  return `***${key.substring(key.length - 3)}`;
}

/**
 * Authorization 헤더 마스킹
 * @example maskAuthHeader("Bearer eyJhbGc...") => "Bearer ***hbGc"
 */
export function maskAuthHeader(header: string | undefined): string {
  if (!header || typeof header !== 'string') {
    return '***';
  }
  
  if (header.startsWith('Bearer ')) {
    const token = header.substring(7);
    return `Bearer ${maskToken(token)}`;
  }
  
  return maskApiKey(header);
}

/**
 * 객체의 민감한 필드 마스킹
 * @example maskSensitiveData({ token: "abc123", apiKey: "key123" }) => { token: "***23", apiKey: "key***23" }
 */
export function maskSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const masked = { ...obj };
  const sensitiveFields = ['token', 'apiKey', 'api_key', 'secretKey', 'secret_key', 'authorization', 'Authorization', 'password'];

  for (const field of sensitiveFields) {
    if (field in masked && typeof masked[field] === 'string') {
      if (field.toLowerCase().includes('authorization')) {
        masked[field] = maskAuthHeader(masked[field]);
      } else if (field.toLowerCase().includes('secret')) {
        masked[field] = maskSecretKey(masked[field]);
      } else if (field.toLowerCase().includes('token')) {
        masked[field] = maskToken(masked[field]);
      } else {
        masked[field] = maskApiKey(masked[field]);
      }
    }
  }

  return masked;
}

/**
 * URL의 민감한 쿼리 파라미터 마스킹
 * @example maskUrlParams("https://api.com?apiKey=abc123&token=xyz") => "https://api.com?apiKey=***23&token=***xyz"
 */
export function maskUrlParams(url: string): string {
  try {
    const urlObj = new URL(url);
    const sensitiveParams = ['apiKey', 'api_key', 'token', 'authorization', 'key', 'secret'];

    for (const param of sensitiveParams) {
      if (urlObj.searchParams.has(param)) {
        const value = urlObj.searchParams.get(param);
        if (value) {
          urlObj.searchParams.set(param, maskApiKey(value));
        }
      }
    }

    return urlObj.toString();
  } catch (e) {
    return url;
  }
}

/**
 * 프로덕션 환경 여부 확인
 */
export function isProduction(): boolean {
  return import.meta.env.MODE === 'production';
}

/**
 * 보안 로그 헬퍼 - 프로덕션에서는 민감한 정보 마스킹
 */
export function secureLog(message: string, data?: any): void {
  if (isProduction() && data) {
    console.log(message, maskSensitiveData(data));
  } else {
    console.log(message, data);
  }
}

/**
 * 보안 에러 로그 - 프로덕션에서는 민감한 정보 마스킹
 */
export function secureError(message: string, data?: any): void {
  if (isProduction() && data) {
    console.error(message, maskSensitiveData(data));
  } else {
    console.error(message, data);
  }
}
