import admin from 'firebase-admin';
import { db } from './init-firebase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Thiếu token xác thực!' });
  }

  let uid = '';
  try {
    const decodedToken = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
    uid = decodedToken.uid;
  } catch (err) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }

  const { code } = req.body || {};
  const cleanCode = code?.trim();

  if (!cleanCode) {
    return res.status(400).json({ error: 'Vui lòng nhập mã xác nhận.' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      // Tìm mã code trong collection 'codes'
      const codesRef = db.collection('codes');
      const codeQuery = await transaction.get(codesRef.where('code', '==', cleanCode).limit(1));

      if (codeQuery.empty) {
        throw new Error('Mã xác nhận không tồn tại hoặc không hợp lệ.');
      }

      const codeDoc = codeQuery.docs[0];
      const codeData = codeDoc.data();

      // Kiểm tra trạng thái mã (chỉ nhận mã chưa sử dụng)
      if (codeData.status !== 'unused' && codeData.status !== 'pending') {
        throw new Error('Mã xác nhận này đã được sử dụng hoặc hết hạn.');
      }

      const rewardAmount = codeData.reward || 1000; // Tiền thưởng mặc định nếu không set sẵn

      // Cập nhật trạng thái code thành đã sử dụng
      transaction.update(codeDoc.ref, {
        status: 'used',
        usedBy: uid,
        usedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Cộng tiền cho user
      const userRef = db.collection('users').doc(uid);
      const userDoc = await transaction.get(userRef);
      const currentBalance = userDoc.exists ? (userDoc.data().balance || 0) : 0;
      
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(rewardAmount)
      });

      return {
        reward: rewardAmount,
        newBalance: currentBalance + rewardAmount
      };
    });

    return res.status(200).json({
      success: true,
      message: `Xác minh thành công! Bạn nhận được ${result.reward.toLocaleString()} VNĐ.`,
      newBalance: result.newBalance
    });

  } catch (err) {
    console.error('Lỗi verify-code:', err);
    const isClientError = ['không tồn tại', 'đã được sử dụng', 'không hợp lệ'].some(msg => err.message.includes(msg));
    return res.status(isClientError ? 400 : 500).json({ error: err.message || 'Lỗi xử lý xác minh.' });
  }
}
