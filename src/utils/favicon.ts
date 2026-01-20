/**
 * 동적 라우팅 기반 Favicon 및 메타데이터 유틸리티
 * Vercel 배포 최적화됨
 */

export type FaviconType = 'admin' | 'user' | 'indo' | 'sample1' | 'benz';

/**
 * 페이지 메타데이터 (emoji 기반 SVG 동적 생성)
 * 각 라우트별 제목, 이모지, 색상 정보 통합
 */
export interface PageMeta {
  title: string;
  emoji: string;
  color: string;
}

/**
 * 라우트별 페이지 메타데이터 매핑
 * Vercel 배포 최적화: 런타임 SVG 생성으로 static 파일 불필요
 * 개발: localhost#/benz/casino → BENZ 파비콘
 * 배포: benz.example.com → BENZ 파비콘 (도메인 + 라우트 감지)
 */
export const pageMeta: Record<FaviconType, PageMeta> = {
  admin: {
    title: '관리자 시스템 | GMS Admin',
    emoji: '🔧',
    color: '#6366f1'
  },
  user: {
    title: '사용자 포털 | GMS User',
    emoji: '👤',
    color: '#10b981'
  },
  indo: {
    title: 'INDO CASINO | 최고의 카지노 경험',
    emoji: '🎰',
    color: '#a855f7'
  },
  sample1: {
    title: 'Sample Casino | Gaming Platform',
    emoji: '🎮',
    color: '#ec4899'
  },
  benz: {
    title: 'BENZ | Premium Casino',
    emoji: 'BENZ',
    color: '#d4af37'
  }
};

/**
 * 이모지를 SVG Data URL로 변환 (Vercel 배포 최적화)
 * 런타임에 SVG 생성하므로 static 파일 불필요
 */
function emojiToDataUrl(emoji: string, bgColor: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="20" fill="${bgColor}"/>
      <text x="50" y="50" font-size="60" text-anchor="middle" dominant-baseline="central">${emoji}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Favicon 업데이트 (pageMeta 기반)
 * @param type - 파비콘 타입
 */
export function updateFavicon(type: FaviconType) {
  const meta = pageMeta[type];
  const dataUrl = emojiToDataUrl(meta.emoji, meta.color);

  // 기존 favicon 링크 찾기 또는 생성
  let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
  
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  link.href = dataUrl;
  
  // 타이틀 업데이트
  document.title = meta.title;
  
  console.log(`✅ [Favicon] 업데이트: ${type} (${meta.title})`);
}

/**
 * 도메인 기반 Favicon 타입 감지 (우선순위: 낮음, Vercel 배포용)
 * benz.example.com → benz
 * user.example.com → user
 */
export function detectFaviconTypeByDomain(): FaviconType {
  const hostname = window.location.hostname.toLowerCase();
  
  console.log(`🔍 [Favicon] 도메인 감지:`, hostname);
  
  // 도메인 매핑 (서브도메인 기반)
  if (hostname.includes('benz')) {
    return 'benz';
  }
  if (hostname.includes('indo')) {
    return 'indo';
  }
  if (hostname.includes('user')) {
    return 'user';
  }
  if (hostname.includes('sample')) {
    return 'sample1';
  }
  if (hostname.includes('admin')) {
    return 'admin';
  }
  
  // 기본값: admin
  return 'admin';
}

/**
 * 해시 라우트 기반 Favicon 타입 감지 (우선순위: 높음)
 * 현재 경로: #/benz/casino → benz
 */
export function detectFaviconTypeByRoute(path?: string): FaviconType {
  const currentPath = path || window.location.hash.substring(1) || '#/benz';
  
  console.log(`🔍 [Favicon] 라우트 감지:`, currentPath);
  
  if (currentPath.startsWith('/benz')) {
    return 'benz';
  }
  if (currentPath.startsWith('/indo')) {
    return 'indo';
  }
  if (currentPath.startsWith('/sample1')) {
    return 'sample1';
  }
  if (currentPath.startsWith('/user')) {
    return 'user';
  }
  if (currentPath.startsWith('/admin')) {
    return 'admin';
  }
  
  // 기본값: admin
  return 'admin';
}

/**
 * Favicon 타입 자동 감지 (도메인 + 라우트 병합)
 * 우선순위:
 * 1. 해시 라우트 기반 감지 (현재 경로)
 * 2. 도메인 기반 감지 (서브도메인)
 * 3. 기본값: admin
 * 
 * Vercel 배포 최적화:
 * - 개발: localhost#/benz/casino → 라우트 기반 감지
 * - 배포: benz.example.com/page → 도메인 + 라우트 기반 감지
 */
export function detectFaviconType(currentPath?: string): FaviconType {
  const hostname = window.location.hostname.toLowerCase();
  
  // 1순위: 현재 해시 라우트 기반 감지 (가장 정확함)
  const routeType = detectFaviconTypeByRoute(currentPath);
  
  // localhost 또는 개발 환경: 라우트 기반 우선
  if (hostname.includes('localhost') || hostname === '127.0.0.1') {
    console.log(`✅ [Favicon] 개발 환경: 라우트 기반 감지 → ${routeType}`);
    return routeType;
  }
  
  // 2순위: 도메인 기반 감지 (프로덕션/Vercel)
  const domainType = detectFaviconTypeByDomain();
  
  // 도메인과 라우트가 일치하는지 확인
  if (domainType === routeType) {
    console.log(`✅ [Favicon] 프로덕션: 도메인/라우트 일치 → ${domainType}`);
    return domainType;
  }
  
  // 도메인이 명확하면 도메인 우선 (예: benz.example.com)
  if (domainType !== 'admin') {
    console.log(`✅ [Favicon] 프로덕션: 도메인 기반 감지 → ${domainType}`);
    return domainType;
  }
  
  // 기본: 라우트 기반 감지
  console.log(`✅ [Favicon] 기본: 라우트 기반 감지 → ${routeType}`);
  return routeType;
}

/**
 * Favicon 초기화 및 자동 업데이트 설정
 * - 초기 로드 시: 도메인 + 라우트 기반 자동 감지
 * - 라우트 변경 시: 자동 업데이트
 * 
 * 추가 지원: App.tsx에서 직접 호출 가능
 * ```
 * import { updateFaviconByRoute } from './utils/favicon';
 * 
 * const handleRouteChange = (path: string) => {
 *   setCurrentRoute(path);
 *   updateFaviconByRoute(path);
 * };
 * ```
 */
export function initFavicon() {
  // 초기 favicon 설정
  const initialType = detectFaviconType();
  updateFavicon(initialType);

  // 해시 변경 감지하여 favicon 자동 업데이트
  window.addEventListener('hashchange', () => {
    const newType = detectFaviconType();
    updateFavicon(newType);
  });
  
  console.log('🔧 [Favicon] 초기화 완료 - hashchange 리스너 등록됨');
}

/**
 * 라우트 변경 시 Favicon 업데이트 (직접 호출용)
 * @param path - 변경된 경로 (예: '/benz/casino')
 * 
 * 사용 예시:
 * ```tsx
 * import { updateFaviconByRoute } from '@/utils/favicon';
 * 
 * const handleRouteChange = (path: string) => {
 *   onRouteChange(path);
 *   updateFaviconByRoute(path); // 파비콘 동시 업데이트
 * };
 * ```
 */
export function updateFaviconByRoute(path: string) {
  const type = detectFaviconTypeByRoute(path);
  updateFavicon(type);
}