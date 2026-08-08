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
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }

  // Hỗ trợ nhận cả telecom/network và value/amount từ client
  const body = req.body || {};
  const telecom = body.telecom || body.network;
  const cardValue = Number(body.value !== undefined ? body.value : body.amount);

  if (!telecom || !cardValue) {
    return res.status(400).json({ error: 'Vui lòng chọn nhà mạng và mệnh giá.' });
  }
  
  if (![10000, 20000, 50000, 100000].includes(cardValue)) {
    return res.status(400).json({ error: 'Mệnh giá thẻ không hợp lệ.' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) throw new Error('Tài khoản không tồn tại.');

      const currentBalance = userDoc.data().balance || 0;
      if (currentBalance < cardValue) {
        throw new Error(`Số dư không đủ. Bạn cần ${cardValue.toLocaleString()} VNĐ.`);
      }

      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(-cardValue)
      });

      const requestRef = db.collection('card_requests').doc();
      transaction.set(requestRef, {
        uid: uid,
        email: userDoc.data().email || '',
        telecom: telecom,
        value: cardValue,
        status: 'PENDING',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { newBalance: currentBalance - cardValue, email: userDoc.data().email };
    });

    // Tạo thông tin thẻ cào giả lập để trả về cho giao diện hiển thị
    const mockSerial = "1000" + Math.floor(1000000000 + Math.random() * 900000000);
    const mockPin = Math.floor(100000000000 + Math.random() * 90000000000).toString();

    // Thông báo Telegram (Tuỳ chọn)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const teleMsg = `📱 *YÊU CẦU ĐỔI THẺ CÀO*\n👤 UID: \`${uid}\`\n📧 Email: ${result.email}\n🏷️ Nhà mạng: ${telecom}\n💰 Mệnh giá: ${cardValue.toLocaleString()} VNĐ`;
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: teleMsg, parse_mode: 'Markdown' })
      }).catch(console.error);
    }

    return res.status(200).json({
      success: true,
      message: `Yêu cầu đổi thẻ ${telecom} ${cardValue.toLocaleString()}đ thành công!`,
      newBalance: result.newBalance,
      card: {
        serial: mockSerial,
        pin: mockPin
      }
    });

  } catch (err) {
    const isClientError = err.message.includes('không đủ') || err.message.includes('tồn tại');
    return res.status(isClientError ? 400 : 500).json({ error: err.message || 'Lỗi Server.' });
  }
}
