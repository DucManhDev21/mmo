import { db } from './init-firebase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Vui lòng nhập mã' });

  try {
    const codeRef = db.collection('codes').doc(code.toUpperCase());
    const doc = await codeRef.get();

    if (!doc.exists) return res.status(400).json({ error: 'Mã không tồn tại trên hệ thống!' });
    if (doc.data().isUsed) return res.status(400).json({ error: 'Mã này đã được sử dụng rồi!' });

    await codeRef.update({ isUsed: true });
    return res.status(200).json({ success: true, message: 'Xác nhận mã thành công! Bạn đã nhận thưởng.' });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi xác minh mã phía Server' });
  }
}
