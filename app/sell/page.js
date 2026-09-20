'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

// ค่า config สำหรับ Telegram (ดึงจาก Environment Variables)
const TELEGRAM_BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;
const LOW_STOCK_THRESHOLD = 5;

// ฟังก์ชันช่วยยิงข้อความเข้า Telegram
// ทำงานแบบ async/try-catch แยกจาก flow หลัก ถ้า error จะไม่กระทบระบบขาย
const sendTelegramMessage = async (text) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('ไม่ได้ตั้งค่า Telegram Bot Token หรือ Chat ID');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    // ไม่ throw ต่อ เพื่อไม่ให้กระทบระบบขายหลัก
    console.error('ส่ง Telegram notification ไม่สำเร็จ:', err);
  }
};

export default function SellPage() {
  // รายการสินค้าทั้งหมด สำหรับ dropdown
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ค่าที่เลือกในฟอร์มขาย
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');

  // สถานะระหว่างบันทึกการขาย + ข้อความแจ้งผล
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }

  // โหลดรายการสินค้าจาก Supabase
  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('โหลดสินค้าไม่สำเร็จ:', error.message);
    } else {
      setProducts(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // สินค้าที่กำลังเลือกอยู่ (ใช้หาราคาและ stock)
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // คำนวณยอดรวมอัตโนมัติ
  const qtyNumber = parseInt(quantity, 10) || 0;
  const totalPrice = selectedProduct ? selectedProduct.price * qtyNumber : 0;

  const resetForm = () => {
    setSelectedProductId('');
    setQuantity('');
  };

  const handleSell = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (!selectedProduct) {
      setMessage({ type: 'error', text: 'กรุณาเลือกสินค้า' });
      return;
    }
    if (qtyNumber <= 0) {
      setMessage({ type: 'error', text: 'กรุณากรอกจำนวนให้ถูกต้อง' });
      return;
    }
    // ตรวจสอบ stock เพียงพอหรือไม่
    if (qtyNumber > selectedProduct.stock) {
      setMessage({
        type: 'error',
        text: `สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit})`,
      });
      return;
    }

    setSubmitting(true);

    const soldAtIso = new Date().toISOString();

    // 1) บันทึกรายการขายลงตาราง sales
    const { error: saleError } = await supabase.from('sales').insert([
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity: qtyNumber,
        total_price: totalPrice,
        sold_at: soldAtIso,
      },
    ]);

    if (saleError) {
      setSubmitting(false);
      setMessage({ type: 'error', text: 'บันทึกการขายไม่สำเร็จ: ' + saleError.message });
      return;
    }

    // 2) อัปเดต stock ของสินค้าให้ลดลง
    const newStock = selectedProduct.stock - qtyNumber;
    const { error: updateError } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('id', selectedProduct.id);

    setSubmitting(false);

    if (updateError) {
      setMessage({
        type: 'error',
        text: 'บันทึกการขายแล้ว แต่ปรับสต๊อกไม่สำเร็จ: ' + updateError.message,
      });
      return;
    }

    setMessage({ type: 'success', text: 'ขายสินค้าสำเร็จ!' });
    resetForm();
    fetchProducts(); // โหลด stock ล่าสุดมาแสดง

    // --- ส่วนที่เพิ่ม: แจ้งเตือนเข้า Telegram หลังตัดสต๊อกสำเร็จ ---
    // ทำงานแบบ "ยิงแล้วไม่รอ / ไม่บล็อก UI" และไม่ทำให้ระบบขายพังถ้า Telegram มีปัญหา
    const timeText = new Date(soldAtIso).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // งานที่ 1: แจ้งเตือน Order เข้าใหม่
    const orderMessage =
      `🛍️ <b>มีรายการขายใหม่!</b>\n` +
      `- สินค้า: ${selectedProduct.name}\n` +
      `- จำนวน: ${qtyNumber} ชิ้น\n` +
      `- ราคารวม: ${totalPrice.toFixed(2)} บาท\n` +
      `- สต๊อกคงเหลือปัจจุบัน: ${newStock} ชิ้น\n` +
      `- เวลา: ${timeText}`;

    sendTelegramMessage(orderMessage);

    // งานที่ 2: แจ้งเตือน Stock เหลือน้อย (ถ้าเข้าเงื่อนไข)
    if (newStock <= LOW_STOCK_THRESHOLD) {
      const lowStockMessage =
        `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
        `- สินค้า: ${selectedProduct.name}\n` +
        `- คงเหลือเพียง: ${newStock} ชิ้น\n` +
        `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`;

      sendTelegramMessage(lowStockMessage);
    }
    // --- จบส่วนที่เพิ่ม ---
  };

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {loading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <form onSubmit={handleSell}>
          {/* Dropdown เลือกสินค้า */}
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            required
          >
            <option value="">-- เลือกสินค้า --</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} - {p.price} บาท (คงเหลือ {p.stock} {p.unit})
              </option>
            ))}
          </select>

          {/* จำนวนที่จะขาย */}
          <input
            type="number"
            min="1"
            placeholder="จำนวน"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />

          {/* แสดงยอดรวมอัตโนมัติ */}
          <div style={{ fontWeight: 600 }}>
            ยอดรวม: {totalPrice.toFixed(2)} บาท
          </div>

          <button type="submit" disabled={submitting}>
            {submitting ? 'กำลังบันทึก...' : 'ขาย'}
          </button>

          {message && (
            <div
              style={{
                color: message.type === 'success' ? 'green' : 'red',
                fontWeight: 500,
              }}
            >
              {message.text}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
