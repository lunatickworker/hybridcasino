import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface AnimatedNumberProps {
  value: number;
  duration?: number; // 애니메이션 지속 시간 (ms)
  className?: string;
  prefix?: string; // 접두사 (₩, $ 등)
  suffix?: string; // 접미사 (P, 원 등)
  formatNumber?: boolean; // 숫자 포맷팅 (1,000,000)
  decimals?: number; // 소수점 자리수
  showChangeIndicator?: boolean; // 증가/감소 표시
  onAnimationComplete?: () => void;
}

export function AnimatedNumber({
  value,
  duration = 1000,
  className,
  prefix = '',
  suffix = '',
  formatNumber = true,
  decimals = 0,
  showChangeIndicator = false,
  onAnimationComplete
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const [changeDirection, setChangeDirection] = useState<'up' | 'down' | null>(null);
  const prevValueRef = useRef(value);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef<number>();

  useEffect(() => {
    // 값이 변경되지 않았으면 애니메이션 스킵
    if (value === prevValueRef.current) return;

    const startValue = prevValueRef.current;
    const endValue = value;
    const difference = endValue - startValue;

    // 변화 방향 설정
    setChangeDirection(difference > 0 ? 'up' : 'down');
    setIsAnimating(true);

    // 애니메이션 시작
    const animate = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // easeOutCubic easing function
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      const easedProgress = easeOutCubic(progress);

      const currentValue = startValue + (difference * easedProgress);
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setIsAnimating(false);
        startTimeRef.current = undefined;
        prevValueRef.current = endValue;
        
        // 변화 표시를 1초 후 제거
        setTimeout(() => {
          setChangeDirection(null);
        }, 1000);

        onAnimationComplete?.();
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration, onAnimationComplete]);

  const formatValue = (val: number): string => {
    let formatted = val.toFixed(decimals);
    
    if (formatNumber) {
      const [integer, decimal] = formatted.split('.');
      const formattedInteger = parseInt(integer).toLocaleString('ko-KR');
      formatted = decimal !== undefined ? `${formattedInteger}.${decimal}` : formattedInteger;
    }
    
    return `${prefix}${formatted}${suffix}`;
  };

  return (
    <span
      className={cn(
        'inline-block transition-colors duration-300',
        showChangeIndicator && changeDirection === 'up' && 'text-green-400',
        showChangeIndicator && changeDirection === 'down' && 'text-red-400',
        className
      )}
    >
      {formatValue(displayValue)}
    </span>
  );
}

interface AnimatedCurrencyProps {
  value: number;
  duration?: number;
  className?: string;
  showChangeIndicator?: boolean;
  currencySymbol?: string; // ✅ 통화 기호를 prop으로 받음
}

export function AnimatedCurrency({ value, duration = 1000, className, showChangeIndicator = false, currencySymbol = '₩' }: AnimatedCurrencyProps) {
  return (
    <AnimatedNumber
      value={value}
      duration={duration}
      className={className}
      prefix={currencySymbol}
      formatNumber={true}
      decimals={0}
      showChangeIndicator={showChangeIndicator}
    />
  );
}

interface AnimatedPointsProps {
  value: number;
  duration?: number;
  className?: string;
  showChangeIndicator?: boolean;
}

export function AnimatedPoints({ value, duration = 1000, className, showChangeIndicator = false }: AnimatedPointsProps) {
  return (
    <AnimatedNumber
      value={value}
      duration={duration}
      className={className}
      suffix="P"
      formatNumber={true}
      decimals={0}
      showChangeIndicator={showChangeIndicator}
    />
  );
}
