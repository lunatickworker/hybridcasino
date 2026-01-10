/**
 * Rate Limiter
 * seamless_wallet_integration.md 섹션 5.2
 * 
 * OroPlay API 호출 제한: 1초당 1회
 * 큐 대기 방식으로 순차적 처리
 */

export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private lastCall: number = 0;
  private minInterval: number;
  private processing: boolean = false;
  
  /**
   * @param callsPerSecond 초당 허용 호출 횟수 (기본: 1)
   */
  constructor(callsPerSecond: number = 1) {
    this.minInterval = 1000 / callsPerSecond;
  }
  
  /**
   * API 호출을 큐에 추가하고 결과를 반환
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    console.log('          🎫 [RATE-LIMITER] 큐에 추가, 현재 큐 길이:', this.queue.length);
    
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          console.log('          ⚡ [RATE-LIMITER] 함수 실행 시작');
          const result = await fn();
          console.log('          ✅ [RATE-LIMITER] 함수 실행 완료');
          resolve(result);
        } catch (error) {
          console.error('          ❌ [RATE-LIMITER] 함수 실행 에러:', error);
          reject(error);
        }
      });
      
      // 큐 처리 시작
      if (!this.processing) {
        console.log('          🚀 [RATE-LIMITER] 큐 처리 시작');
        this.process();
      }
    });
  }
  
  /**
   * 큐를 순차적으로 처리
   */
  private async process() {
    if (this.queue.length === 0) {
      console.log('          🏁 [RATE-LIMITER] 큐 비어있음, 처리 종료');
      this.processing = false;
      return;
    }
    
    this.processing = true;
    
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    
    // Rate Limit 체크
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      console.log(`          ⏳ [RATE-LIMITER] ${waitTime}ms 대기 중...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // 큐에서 다음 함수 실행
    const fn = this.queue.shift();
    if (fn) {
      console.log('          🔄 [RATE-LIMITER] 큐에서 함수 실행');
      this.lastCall = Date.now();
      
      try {
        await fn();
      } catch (error) {
        console.error('          ❌ [RATE-LIMITER] 큐 함수 실행 중 오류:', error);
      }
      
      // 다음 항목 처리 (await 추가!)
      console.log('          ➡️ [RATE-LIMITER] 다음 항목 처리, 남은 큐:', this.queue.length);
      await this.process(); // ✅ await 추가
    } else {
      this.processing = false;
    }
  }
  
  /**
   * 큐 상태 조회
   */
  getQueueLength(): number {
    return this.queue.length;
  }
  
  /**
   * 큐 초기화
   */
  clear(): void {
    this.queue = [];
    this.processing = false;
  }
}

// ============================================
// OroPlay API 전용 Rate Limiter (싱글톤)
// ============================================

export const oroplayRateLimiter = new RateLimiter(1); // 1초당 1회

/**
 * Rate Limit이 적용된 OroPlay API 호출 래퍼
 * 
 * @example
 * const result = await callWithRateLimit(async () => {
 *   return await oroplayApi.getBettingHistory(token, startDate);
 * });
 */
export async function callWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  return await oroplayRateLimiter.enqueue(fn);
}
