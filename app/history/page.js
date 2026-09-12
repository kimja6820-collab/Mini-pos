'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function HistoryPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  // โหลดประวัติการขายทั้งหมด เรียงจากล่าสุดไปเก่าสุด
  const fetchSales = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('sold_at', { ascending: false });

    if (error) {
      console.error('โหลดประวัติการขายไม่สำเร็จ:', error.message);
    } else {
      setSales(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSales();
  }, []);

  // คำนวณยอดขายรวมทั้งหมดจากข้อมูลที่โหลดมา
  const totalRevenue = sales.reduce(
    (sum, sale) => sum + (sale.total_price || 0),
    0
  );

  // จัดรูปแบบวันเวลาให้อ่านง่าย
  const formatDateTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <div>
      <h1>ประวัติการขาย</h1>

      {loading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <>
          {/* ยอดขายรวมทั้งหมด */}
          <div
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              marginBottom: 16,
              padding: '12px 16px',
              backgroundColor: '#fff',
              borderRadius: 8,
            }}
          >
            ยอดขายรวมทั้งหมด: {totalRevenue.toFixed(2)} บาท
          </div>

          {/* ตารางประวัติการขาย */}
          <table>
            <thead>
              <tr>
                <th>วันเวลาที่ขาย</th>
                <th>ชื่อสินค้า</th>
                <th>จำนวน</th>
                <th>ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>{formatDateTime(sale.sold_at)}</td>
                  <td>{sale.product_name}</td>
                  <td>{sale.quantity}</td>
                  <td>{Number(sale.total_price).toFixed(2)} บาท</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center' }}>
                    ยังไม่มีประวัติการขาย
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
