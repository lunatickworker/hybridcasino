import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: LucideIcon;
}

export function StatsCard({ title, value, change, isPositive, icon: Icon }: StatsCardProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
          <p className={`text-sm mt-2 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '↑' : '↓'} {change}
          </p>
        </div>
        <div className="bg-blue-100 p-4 rounded-full">
          <Icon className="w-8 h-8 text-blue-600" />
        </div>
      </div>
    </div>
  );
}
