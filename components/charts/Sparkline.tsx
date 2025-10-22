
import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { SparklineData } from '../../types';

interface SparklineProps {
  data: SparklineData[];
  color?: string;
}

const Sparkline: React.FC<SparklineProps> = ({ data, color }) => {
  if (!data || data.length === 0) {
    return <div className="h-12 w-24 bg-accent animate-pulse rounded-md" />;
  }
  
  const isPositive = data[data.length - 1].value >= data[0].value;
  const strokeColor = color || (isPositive ? '#22c55e' : '#ef4444');

  const domain = [Math.min(...data.map(d => d.value)), Math.max(...data.map(d => d.value))];

  return (
    <div className="w-24 h-12">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis domain={domain} hide={true} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Sparkline;
