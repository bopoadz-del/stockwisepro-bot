import { motion } from 'framer-motion';
import { getScoreColor } from '@/lib/utils';

interface ScoreVisualizerProps {
  score: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  animate?: boolean;
}

export function ScoreVisualizer({
  score,
  size = 'md',
  showLabel = true,
  animate = true,
}: ScoreVisualizerProps) {
  const dimensions = {
    sm: { width: 48, stroke: 4, font: 'text-sm' },
    md: { width: 64, stroke: 5, font: 'text-base' },
    lg: { width: 96, stroke: 6, font: 'text-xl' },
    xl: { width: 144, stroke: 8, font: 'text-3xl' },
  };

  const { width, stroke, font } = dimensions[size];
  const radius = (width - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return '#22c55e';
    if (s >= 60) return '#f59e0b';
    if (s >= 40) return '#eab308';
    return '#ef4444';
  };

  const color = getColor(score);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={width} height={width} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={stroke}
        />
        {/* Progress circle */}
        <motion.circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={animate ? { strokeDashoffset: circumference } : { strokeDashoffset }}
          animate={{ strokeDashoffset }}
          transition={{
            duration: 1.5,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        />
      </svg>
      {showLabel && (
        <div className={`absolute inset-0 flex items-center justify-center ${font} font-bold ${getScoreColor(score)}`}>
          {score}
        </div>
      )}
    </div>
  );
}
