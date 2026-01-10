import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: '1월', sales: 4000 },
  { name: '2월', sales: 3000 },
  { name: '3월', sales: 5000 },
  { name: '4월', sales: 4500 },
  { name: '5월', sales: 6000 },
  { name: '6월', sales: 5500 },
  { name: '7월', sales: 7000 },
];

export function SalesChart() {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">월별 매출</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
