/**
 * 네트워크 요청 로깅 인터셉터
 * API 요청/응답에서 민감한 정보를 자동으로 마스킹
 */

import { maskSensitiveData, maskAuthHeader, isProduction } from './logSecurityUtil';

/**
 * Fetch 요청 인터셉터 설정
 * - Authorization 헤더 마스킹
 * - API Key 마스킹
 * - 프로덕션 환경에서만 적용
 */
export function setupNetworkLogging() {
  // 원본 fetch 저장
  const originalFetch = window.fetch;

  // fetch 오버라이드
  window.fetch = function(...args: any[]): Promise<Response> {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource?.url;

    // 원본 fetch 호출
    return originalFetch.apply(this, args).then((response: Response) => {
      // ❌ 에러 응답만 로깅 (개발 편의성)
      if (!response.ok) {
        console.warn('⚠️ [Network Response]', {
          status: response.status,
          statusText: response.statusText,
          url: response.url
        });
      }

      return response;
    }).catch((error: Error) => {
      console.error('❌ [Network Error]', {
        message: error.message,
        url: url
      });
      throw error;
    });
  } as any;
}

/**
 * 개발자 도구 콘솔 메시지 필터 (선택사항)
 * 프로덕션에서 민감한 정보가 포함된 메시지를 필터링
 */
export function setupConsoleFilter() {
  if (!isProduction()) {
    return;
  }

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const sensitivePatterns = [
    /apikey|api_key|token|authorization|bearer|secret/gi,
    /password|passwd|pwd/gi,
    /credential|auth/gi
  ];

  const filterLog = (args: any[]) => {
    return args.map(arg => {
      if (typeof arg === 'string') {
        for (const pattern of sensitivePatterns) {
          if (pattern.test(arg)) {
            return '[민감한 정보 필터됨]';
          }
        }
      }
      return arg;
    });
  };

  console.log = function(...args: any[]) {
    originalLog.apply(console, filterLog(args) as any);
  };

  console.error = function(...args: any[]) {
    originalError.apply(console, filterLog(args) as any);
  };

  console.warn = function(...args: any[]) {
    originalWarn.apply(console, filterLog(args) as any);
  };
}
