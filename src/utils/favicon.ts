/**
 * 도메인 또는 라우트 기반으로 Favicon을 동적으로 변경하는 유틸리티
 */

export type FaviconType = 'admin' | 'user' | 'indo' | 'sample1' | 'benz';

// Favicon 이모지 매핑 (실제 파일이 없는 경우 SVG로 변환하여 사용)
const FAVICON_EMOJIS = {
  admin: '🔧', // 관리자: 렌치
  user: '👤', // 사용자: 사람
  indo: '🎰', // Indo 카지노: 슬롯머신
  sample1: '🎮', // Sample1: 게임패드
  benz: 'BENZ', // Benz 카지노: BENZ 텍스트
};

// Favicon 색상 매핑
const FAVICON_COLORS = {
  admin: '#6366f1', // indigo
  user: '#10b981', // green
  indo: '#a855f7', // purple
  sample1: '#ec4899', // pink
  benz: '#d4af37', // gold
};

/**
 * 이모지를 SVG Data URL로 변환
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
 * Favicon 업데이트
 */
export function updateFavicon(type: FaviconType) {
  const emoji = FAVICON_EMOJIS[type];
  const color = FAVICON_COLORS[type];
  const dataUrl = emojiToDataUrl(emoji, color);

  // 기존 favicon 링크 찾기 또는 생성
  let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
  
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  link.href = dataUrl;
  
  // 타이틀도 변경
  updateTitle(type);
}

/**
 * 페이지 타이틀 업데이트
 */
function updateTitle(type: FaviconType) {
  const titles = {
    admin: '관리자 시스템 | GMS Admin',
    user: '사용자 포털 | GMS User',
    indo: 'INDO CASINO | 최고의 카지노 경험',
    sample1: 'Sample Casino | Gaming Platform',
    benz: 'BENZ | Premium Casino Platform',
  };
  
  document.title = titles[type];
}

/**
 * 도메인 기반 Favicon 타입 감지
 */
export function detectFaviconTypeByDomain(): FaviconType {
  const hostname = window.location.hostname.toLowerCase();
  
  // 도메인 매핑
  if (hostname.includes('admin')) {
    return 'admin';
  }
  if (hostname.includes('benz')) {
    return 'benz';
  }
  if (hostname.includes('user')) {
    return 'user';
  }
  if (hostname.includes('indo')) {
    return 'indo';
  }
  if (hostname.includes('sample')) {
    return 'sample1';
  }
  
  // 기본값: admin
  return 'admin';
}

/**
 * 해시 라우트 기반 Favicon 타입 감지
 */
export function detectFaviconTypeByRoute(): FaviconType {
  const hash = window.location.hash || '#/admin';
  const path = hash.substring(1); // # 제거
  
  if (path.startsWith('/benz')) {
    return 'benz';
  }
  if (path.startsWith('/indo')) {
    return 'indo';
  }
  if (path.startsWith('/sample1')) {
    return 'sample1';
  }
  if (path.startsWith('/user')) {
    return 'user';
  }
  if (path.startsWith('/admin')) {
    return 'admin';
  }
  
  // 기본값: admin
  return 'admin';
}

/**
 * 도메인 우선, 라우트 보조로 Favicon 타입 감지
 */
export function detectFaviconType(): FaviconType {
  // 1순위: 도메인 기반 감지
  const hostname = window.location.hostname.toLowerCase();
  
  // localhost가 아니고 특정 서브도메인이 있는 경우
  if (!hostname.includes('localhost') && hostname.split('.').length > 2) {
    return detectFaviconTypeByDomain();
  }
  
  // 2순위: 해시 라우트 기반 감지 (개발 환경 또는 단일 도메인)
  return detectFaviconTypeByRoute();
}

/**
 * Favicon 초기화 및 자동 업데이트 설정
 */
export function initFavicon() {
  // 초기 favicon 설정
  const initialType = detectFaviconType();
  updateFavicon(initialType);

  // 해시 변경 시 favicon 업데이트 (단일 도메인 환경)
  window.addEventListener('hashchange', () => {
    const newType = detectFaviconType();
    updateFavicon(newType);
  });
}