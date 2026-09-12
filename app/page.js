'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  // รายการสินค้าทั้งหมด
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ฟอร์มเพิ่มสินค้าใหม่
  const [form, setForm] = useState({
    sku: '',
    name: '',
    price: '',
    stock: '',
    unit: '',
  });

  // แถวที่กำลังแก้ไข (inline edit) + ค่าที่กำลังแก้
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // โหลดรายการสินค้าจาก Supabase
  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

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

  // เพิ่มสินค้าใหม่
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!form.sku || !form.name) return;

    const { error } = await supabase.from('products').insert([
      {
        sku: form.sku,
        name: form.name,
        price: parseFloat(form.price) || 0,
        stock: parseInt(form.stock, 10) || 0,
        unit: form.unit,
      },
    ]);

    if (error) {
      alert('เพิ่มสินค้าไม่สำเร็จ: ' + error.message);
      return;
    }

    // เคลียร์ฟอร์มและโหลดรายการใหม่
    setForm({ sku: '', name: '', price: '', stock: '', unit: '' });
    fetchProducts();
  };

  // เริ่มแก้ไขแถว
  const startEdit = (product) => {
    setEditingId(product.id);
    setEditForm({
      sku: product.sku,
      name: product.name,
      price: product.price,
      stock: product.stock,
      unit: product.unit,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  // บันทึกการแก้ไข
  const handleUpdateProduct = async (id) => {
    const { error } = await supabase
      .from('products')
      .update({
        sku: editForm.sku,
        name: editForm.name,
        price: parseFloat(editForm.price) || 0,
        stock: parseInt(editForm.stock, 10) || 0,
        unit: editForm.unit,
      })
      .eq('id', id);

    if (error) {
      alert('แก้ไขสินค้าไม่สำเร็จ: ' + error.message);
      return;
    }

    cancelEdit();
    fetchProducts();
  };

  // ลบสินค้า
  const handleDeleteProduct = async (id) => {
    const confirmed = window.confirm('ยืนยันการลบสินค้านี้หรือไม่?');
    if (!confirmed) return;

    const { error } = await supabase.from('products').delete().eq('id', id);

    if (error) {
      alert('ลบสินค้าไม่สำเร็จ: ' + error.message);
      return;
    }

    fetchProducts();
  };

  return (
    <div>
      <h1>รายการสินค้า</h1>

      {/* ฟอร์มเพิ่มสินค้าใหม่ */}
      <form onSubmit={handleAddProduct} style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="SKU"
          value={form.sku}
          onChange={(e) => setForm({ ...form, sku: e.target.value })}
          required
        />
        <input
          type="text"
          placeholder="ชื่อสินค้า"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder="ราคา"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <input
          type="number"
          placeholder="คงเหลือ"
          value={form.stock}
          onChange={(e) => setForm({ ...form, stock: e.target.value })}
        />
        <input
          type="text"
          placeholder="หน่วย (เช่น ชิ้น, ขวด)"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
        />
        <button type="submit">เพิ่มสินค้า</button>
      </form>

      {/* ตารางรายการสินค้า */}
      {loading ? (
        <p>กำลังโหลด...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>ชื่อสินค้า</th>
              <th>ราคา</th>
              <th>คงเหลือ</th>
              <th>หน่วย</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const isEditing = editingId === product.id;
              return (
                <tr key={product.id}>
                  {isEditing ? (
                    <>
                      <td>
                        <input
                          value={editForm.sku}
                          onChange={(e) =>
                            setEditForm({ ...editForm, sku: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={editForm.name}
                          onChange={(e) =>
                            setEditForm({ ...editForm, name: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.price}
                          onChange={(e) =>
                            setEditForm({ ...editForm, price: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={editForm.stock}
                          onChange={(e) =>
                            setEditForm({ ...editForm, stock: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={editForm.unit}
                          onChange={(e) =>
                            setEditForm({ ...editForm, unit: e.target.value })
                          }
                        />
                      </td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleUpdateProduct(product.id)}>
                          บันทึก
                        </button>
                        <button onClick={cancelEdit}>ยกเลิก</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{product.sku}</td>
                      <td>{product.name}</td>
                      <td>{product.price}</td>
                      <td>{product.stock}</td>
                      <td>{product.unit}</td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => startEdit(product)}>แก้ไข</button>
                        <button onClick={() => handleDeleteProduct(product.id)}>
                          ลบ
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center' }}>
                  ยังไม่มีสินค้า
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
