import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedBalanceProps {
  value: number;
  className?: string;
  inactive?: boolean;
}

export function AnimatedBalance({ value, className, inactive }: AnimatedBalanceProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setIsAnimating(true);
      
      // 슬롯 스핀 애니메이션 효과
      const steps = 10;
      const increment = (value - prevValueRef.current) / steps;
      let currentStep = 0;

      const timer = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setDisplayValue(value);
          setIsAnimating(false);
          clearInterval(timer);
        } else {
          setDisplayValue(prevValueRef.current + increment * currentStep);
        }
      }, 30);

      prevValueRef.current = value;

      return () => clearInterval(timer);
    }
  }, [value]);

  return (
    <span 
      className={cn(
        'font-mono text-slate-200 transition-all duration-100',
        isAnimating && 'animate-pulse text-amber-400',
        inactive && 'opacity-40',
        className
      )}
    >
      ₩{Math.round(displayValue).toLocaleString()}
    </span>
  );
}
