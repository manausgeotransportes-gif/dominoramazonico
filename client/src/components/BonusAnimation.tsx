import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BonusAnimationProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export function BonusAnimation({ isVisible, onComplete }: BonusAnimationProps) {
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (isVisible) {
      setKey((prev) => prev + 1);
    }
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
          {/* Fundo escuro */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black"
          />

          {/* Texto principal "50 PONTOS" */}
          <motion.div
            key={key}
            initial={{ scale: 0, opacity: 0, y: 100 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: -100 }}
            transition={{
              type: "spring",
              stiffness: 100,
              damping: 15,
              duration: 0.6,
            }}
            className="relative z-10"
          >
            <div className="text-center">
              {/* Texto principal */}
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 0.8,
                  repeat: 2,
                  repeatType: "loop",
                }}
                className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-500 drop-shadow-lg"
              >
                50
              </motion.div>

              {/* Subtítulo */}
              <motion.div
                animate={{
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1,
                  repeat: 2,
                  repeatType: "loop",
                }}
                className="text-4xl font-bold text-white mt-2 drop-shadow-lg"
              >
                PONTOS!
              </motion.div>

              {/* Emoji comemorativo */}
              <motion.div
                animate={{
                  y: [-20, 20, -20],
                  rotate: [0, 10, -10, 0],
                }}
                transition={{
                  duration: 1,
                  repeat: 2,
                  repeatType: "loop",
                }}
                className="text-6xl mt-4"
              >
                🎉
              </motion.div>
            </div>
          </motion.div>

          {/* Partículas de confete */}
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={`particle-${i}`}
              initial={{
                x: 0,
                y: 0,
                opacity: 1,
                scale: 1,
              }}
              animate={{
                x: Math.cos((i / 20) * Math.PI * 2) * 200,
                y: Math.sin((i / 20) * Math.PI * 2) * 200 - 100,
                opacity: 0,
                scale: 0,
              }}
              transition={{
                duration: 1.5,
                delay: 0.2,
                ease: "easeOut",
              }}
              className="absolute w-4 h-4 pointer-events-none"
            >
              <div className="w-full h-full bg-gradient-to-r from-yellow-300 to-yellow-500 rounded-full" />
            </motion.div>
          ))}

          {/* Brilho de fundo */}
          <motion.div
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.8, 0.2, 0],
            }}
            transition={{
              duration: 1.5,
              delay: 0.2,
            }}
            onAnimationComplete={onComplete}
            className="absolute w-96 h-96 bg-yellow-400 rounded-full blur-3xl"
          />
        </div>
      )}
    </AnimatePresence>
  );
}
