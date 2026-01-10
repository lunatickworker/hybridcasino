/**
 * ✅ GoTrueClient 중복 인스턴스 경고 및 MetaMask 에러 필터링
 * 
 * 이 파일은 모든 Supabase 클라이언트보다 먼저 실행되어야 합니다.
 * 
 * 배경:
 * - GMS는 커스텀 인증을 사용하므로 Supabase Auth를 사용하지 않음
 * - Service Role과 Anon Key 두 개의 클라이언트가 필요 (RLS 우회/적용)
 * - Supabase JS 라이브러리는 각 클라이언트마다 GoTrueClient를 생성
 * - 같은 브라우저 컨텍스트에서 여러 GoTrueClient가 있으면 경고 발생
 * - MetaMask 브라우저 확장이 자동 연결을 시도하면서 에러 발생
 * 
 * 해결:
 * - 경고는 실제로 문제를 일으키지 않음 (Auth를 사용하지 않으므로)
 * - console.warn/error/info를 오버라이드하여 이 특정 경고만 필터링
 */

if (typeof window !== 'undefined' && typeof console !== 'undefined') {
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalInfo = console.info;
  
  // 필터링할 메시지 패턴
  const shouldFilter = (message: any): boolean => {
    if (typeof message === 'string') {
      return (
        message.includes('Multiple GoTrueClient instances') ||
        message.includes('GoTrueClient') ||
        message.includes('MetaMask') ||
        message.includes('Failed to connect to MetaMask') ||
        message.includes('ethereum') ||
        message.includes('chrome-extension')
      );
    }
    // 에러 객체 처리
    if (message instanceof Error) {
      const errorStr = message.toString() + ' ' + (message.stack || '');
      return (
        errorStr.includes('MetaMask') ||
        errorStr.includes('chrome-extension') ||
        errorStr.includes('ethereum')
      );
    }
    return false;
  };
  
  console.warn = function(...args: any[]) {
    if (shouldFilter(args[0])) {
      return;
    }
    originalWarn.apply(console, args);
  };
  
  console.error = function(...args: any[]) {
    if (shouldFilter(args[0])) {
      return;
    }
    originalError.apply(console, args);
  };
  
  console.info = function(...args: any[]) {
    if (shouldFilter(args[0])) {
      return;
    }
    originalInfo.apply(console, args);
  };
}