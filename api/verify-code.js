import { db } from './init-firebase.js';

export default async function handler(req, res) {
  // 1. Cấu hình CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Hãy dùng phương thức POST.' });
  }

  const { code, uid } = req.body || {};

  if (!code) {
    return res.status(400).json({ error: 'Vui lòng nhập mã xác nhận từ trang đích!' });
  }
  if (!uid) {
    return res.status(400).json({ error: 'Thiếu thông tin tài khoản (UID). Vui lòng đăng nhập lại.' });
  }

  try {
    const cleanCode = code.trim().toUpperCase();
    const codeRef = db.collection('codes').doc(cleanCode);
    const doc = await codeRef.get();

    if (!doc.exists) {
      return res.status(400).json({ error: 'Mã không tồn tại trên hệ thống!' });
    }

    const codeData = doc.data();
    if (codeData.isUsed) {
      return res.status(400).json({ error: 'Mã này đã được sử dụng trước đó rồi!' });
    }

    // Kiểm tra hạn sử dụng mã (nếu có trường expiresAt)
    if (codeData.expiresAt && Date.now() > codeData.expiresAt) {
      return res.status(400).json({ error: 'Mã xác nhận đã hết hạn sử dụng!' });
    }

    // 2. Lấy thông tin user để cộng tiền
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Tài khoản người dùng không tồn tại trên hệ thống.' });
    }

    const currentBalance = userDoc.data().balance || 0;
    const rewardAmount = 200; // Thưởng 200 VNĐ mỗi lần vượt link thành công

    // 3. Thực hiện giao dịch nguyên tử (Batch): Vừa khóa mã vừa cộng tiền an toàn tuyệt đối
    const batch = db.batch();
    batch.update(codeRef, { 
      isUsed: true, 
      usedBy: uid, 
      usedAt: Date.now() 
    });
    batch.update(userRef, { 
      balance: currentBalance + rewardAmount 
    });

    await batch.commit();

    return res.status(200).json({ 
      success: true, 
      message: `Xác nhận mã thành công! Đã cộng +${rewardAmount} VNĐ vào ví.`,
      newBalance: currentBalance + rewardAmount
    });

  } catch (err) {
    console.error('Lỗi xác minh mã:', err);
    return res.status(500).json({ error: 'Lỗi xử lý phía Server: ' + err.message });
  }
}
