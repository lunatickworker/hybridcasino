/**
 * 네트워크 요청 로깅 인터셉터
 * API 요청/응답에서 민감한 정보를 자동으로 마스킹
 */

import { maskSensitiveData, maskAuthHeader, isProduction } from './logSecurityUtil';

// ✅ 개발 환경에서 네트워크 로깅 비활성화 (너무 많은 로그 발생)
const ENABLE_NETWORK_LOGGING = false;

/**
 * Fetch 요청 인터셉터 설정
 * - Authorization 헤더 마스킹
 * - API Key 마스킹
 * - 프로덕션 환경에서만 적용
 */
export function setupNetworkLogging() {
  // ✅ 네트워크 로깅이 비활성화되면 원본 fetch 그대로 사용
  if (!ENABLE_NETWORK_LOGGING) {
    return;
  }

  // 원본 fetch 저장
  const originalFetch = window.fetch;

  // fetch 오버라이드
  window.fetch = function(...args: any[]): Promise<Response> {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource?.url;

    // 요청 로그
    const requestLog = {
      method: config?.method || 'GET',
      url: url,
      headers: config?.headers || {}
    };

    // 프로덕션 환경에서만 민감한 정보 마스킹
    if (isProduction()) {
      if (requestLog.headers['Authorization']) {
        requestLog.headers['Authorization'] = maskAuthHeader(requestLog.headers['Authorization']);
      }
      
      // 마스킹된 데이터
      const maskedHeaders = maskSensitiveData(requestLog.headers);
      
      // 요청 로그 출력
      if (config?.body) {
        console.log('📤 [Network Request]', {
          method: requestLog.method,
          url: requestLog.url,
          headers: maskedHeaders
        });
      }
    } else {
      console.log('📤 [Network Request]', requestLog);
    }

    // 원본 fetch 호출
    return originalFetch.apply(this, args).then((response: Response) => {
      // 응답 로그 (상태 코드만)
      console.log('📥 [Network Response]', {
        status: response.status,
        statusText: response.statusText,
        url: response.url
      });

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
