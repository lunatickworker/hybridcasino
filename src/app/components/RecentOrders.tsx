interface Order {
  id: string;
  customer: string;
  product: string;
  amount: string;
  status: 'completed' | 'pending' | 'cancelled';
}

const orders: Order[] = [
  { id: '#12345', customer: '김민수', product: '노트북', amount: '₩1,500,000', status: 'completed' },
  { id: '#12346', customer: '이영희', product: '스마트폰', amount: '₩900,000', status: 'pending' },
  { id: '#12347', customer: '박철수', product: '태블릿', amount: '₩600,000', status: 'completed' },
  { id: '#12348', customer: '정수진', product: '이어폰', amount: '₩150,000', status: 'pending' },
  { id: '#12349', customer: '최동욱', product: '키보드', amount: '₩200,000', status: 'cancelled' },
];

const statusColors = {
  completed: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-red-100 text-red-800',
};

const statusText = {
  completed: '완료',
  pending: '대기중',
  cancelled: '취소',
};

export function RecentOrders() {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">최근 주문</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-3 px-4 text-gray-600 font-medium">주문번호</th>
              <th className="text-left py-3 px-4 text-gray-600 font-medium">고객명</th>
              <th className="text-left py-3 px-4 text-gray-600 font-medium">제품</th>
              <th className="text-left py-3 px-4 text-gray-600 font-medium">금액</th>
              <th className="text-left py-3 px-4 text-gray-600 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-medium">{order.id}</td>
                <td className="py-3 px-4">{order.customer}</td>
                <td className="py-3 px-4">{order.product}</td>
                <td className="py-3 px-4">{order.amount}</td>
                <td className="py-3 px-4">
                  <span className={`px-3 py-1 rounded-full text-sm ${statusColors[order.status]}`}>
                    {statusText[order.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
