import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineChartProps {
  data: number[];
  color?: string;
  height?: number;
  isPositive?: boolean;
}

export function SparklineChart({
  data,
  color,
  height = 40,
  isPositive = true,
}: SparklineChartProps) {
  const chartColor = color || (isPositive ? '#22c55e' : '#ef4444');
  
  const chartData = data.map((value, index) => ({
    value,
    index,
  }));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={chartColor}
            strokeWidth={2}
            dot={false}
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
