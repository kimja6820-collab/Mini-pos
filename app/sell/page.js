'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

// เกณฑ์แจ้งเตือนสต๊อกใกล้หมด
const LOW_STOCK_THRESHOLD = 5;

export default function SellPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

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

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const qtyNumber = parseInt(quantity, 10) || 0;
  const totalPrice = selectedProduct ? selectedProduct.price * qtyNumber : 0;

  const resetForm = () => {
    setSelectedProductId('');
    setQuantity('');
  };

  // === เพิ่มใหม่: ฟังก์ชันกลางสำหรับส่งข้อความเข้า Telegram ===
  // ทำงานแบบ try-catch ในตัวเอง เพื่อไม่ให้ error กระทบ flow การขายหลัก
  const sendTelegramMessage = async (text) => {
    const botToken = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn('ยังไม่ได้ตั้งค่า Telegram Bot Token / Chat ID');
      return;
    }

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        console.error('ส่ง Telegram แจ้งเตือนไม่สำเร็จ:', errData);
      }
    } catch (err) {
      // ไม่ throw ต่อ เพื่อไม่ให้กระทบระบบขายหลัก
      console.error('เกิดข้อผิดพลาดขณะยิง Telegram API:', err);
    }
  };

  // === เพิ่มใหม่: ประกอบข้อความแจ้งเตือน Order ใหม่ ===
  const buildNewOrderMessage = (productName, qty, total, stockAfter) => {
    const now = new Date().toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return (
      `🛍️ <b>มีรายการขายใหม่!</b>\n` +
      `- สินค้า: ${productName}\n` +
      `- จำนวน: ${qty} ชิ้น\n` +
      `- ราคารวม: ${total.toFixed(2)} บาท\n` +
      `- สต๊อกคงเหลือปัจจุบัน: ${stockAfter} ชิ้น\n` +
      `- เวลา: ${now}`
    );
  };

  // === เพิ่มใหม่: ประกอบข้อความแจ้งเตือนสต๊อกใกล้หมด ===
  const buildLowStockMessage = (productName, stockAfter) => {
    return (
      `🚨 <b>[เตือนภัย] สต๊อกสินค้าใกล้หมด!</b>\n` +
      `- สินค้า: ${productName}\n` +
      `- คงเหลือเพียง: ${stockAfter} ชิ้น\n` +
      `⚠️ กรุณาเติมสต๊อกสินค้าด่วน!`
    );
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
    if (qtyNumber > selectedProduct.stock) {
      setMessage({
        type: 'error',
        text: `สินค้าคงเหลือไม่พอ (คงเหลือ ${selectedProduct.stock} ${selectedProduct.unit})`,
      });
      return;
    }

    setSubmitting(true);

    const { error: saleError } = await supabase.from('sales').insert([
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity: qtyNumber,
        total_price: totalPrice,
        sold_at: new Date().toISOString(),
      },
    ]);

    if (saleError) {
      setSubmitting(false);
      setMessage({ type: 'error', text: 'บันทึกการขายไม่สำเร็จ: ' + saleError.message });
      return;
    }

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

    // === เพิ่มใหม่: ยิงแจ้งเตือน Telegram หลังตัดสต๊อกสำเร็จ ===
    // ไม่ await แบบบล็อก UI และห่อด้วย try-catch ผ่าน sendTelegramMessage อยู่แล้ว
    // ดังนั้นต่อให้ Telegram ล่ม การขายก็เสร็จสมบูรณ์ไปแล้วก่อนหน้านี้
    (async () => {
      // งานที่ 1: แจ้งเตือน Order ใหม่ (ส่งทุกครั้งที่ขายสำเร็จ)
      await sendTelegramMessage(
        buildNewOrderMessage(
          selectedProduct.name,
          qtyNumber,
          totalPrice,
          newStock
        )
      );

      // งานที่ 2: แจ้งเตือนสต๊อกใกล้หมด (ส่งแยกอีกข้อความ ถ้าเข้าเงื่อนไข)
      if (newStock <= LOW_STOCK_THRESHOLD) {
        await sendTelegramMessage(
          buildLowStockMessage(selectedProduct.name, newStock)
        );
      }
    })();

    resetForm();
    fetchProducts();
  };

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {loading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <form onSubmit={handleSell}>
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

          <input
            type="number"
            min="1"
            placeholder="จำนวน"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />

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
