import { useEffect } from "react";
import { motion } from "motion/react";
import { Loader2, Gamepad2 } from "lucide-react";

interface Sample1GameLoadingPopupProps {
  message: string;
  show: boolean;
}

export function Sample1GameLoadingPopup({ message, show }: Sample1GameLoadingPopupProps) {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: 'transparent',
        pointerEvents: 'none'
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3 }}
        className="relative"
        style={{
          pointerEvents: 'auto'
        }}
      >
        {/* Sample1 심플한 스타일 로딩 박스 */}
        <div className="rounded-2xl p-10 shadow-2xl backdrop-blur-sm bg-gradient-to-br from-white/95 to-gray-50/95 border border-gray-200">
          <div className="flex flex-col items-center gap-5">
            {/* 회전하는 게임패드 아이콘 */}
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="relative"
            >
              <Gamepad2 className="w-16 h-16 text-blue-600" />
            </motion.div>

            {/* 로딩 스피너 */}
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />

            {/* 메시지 */}
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-gray-900">
                {message}
              </h2>
              <p className="text-gray-600">
                잠시만 기다려주세요...
              </p>
            </div>

            {/* 프로그레스 바 애니메이션 */}
            <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                animate={{
                  x: ["-100%", "100%"]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="h-full w-1/2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
