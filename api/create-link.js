export default async function handler(req, res) {
    // Thiết lập Header CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Chỉ chấp nhận phương thức POST' });
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {}
        }

        const url = body?.url;
        if (!url) {
            return res.status(400).json({ success: false, message: 'Thiếu URL gốc' });
        }

        const apiToken = process.env.LINK4M_API_TOKEN;
        if (!apiToken) {
            return res.status(500).json({ 
                success: false, 
                message: 'Chưa cấu hình biến môi trường LINK4M_API_TOKEN trên Vercel' 
            });
        }

        // Gọi API Link4M
        const targetApi = `https://link4m.co/api-shorten?api=${encodeURIComponent(apiToken)}&url=${encodeURIComponent(url)}`;
        const response = await fetch(targetApi);

        // Đọc phản hồi dạng text trước để tránh crash JSON
        const rawText = await response.text();
        let data;
        
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            return res.status(500).json({
                success: false,
                message: `Phản hồi từ Link4M không hợp lệ. Nội dung: ${rawText.substring(0, 100)}`
            });
        }

        const shortUrl = data.shortenedUrl || data.url || data.shortedUrl;

        if (data.status === 'success' || shortUrl) {
            return res.status(200).json({ success: true, shortUrl: shortUrl });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: data.message || 'Lỗi API Link4M (Vui lòng kiểm tra lại API Key hoặc Link gốc)' 
            });
        }

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: 'Lỗi máy chủ: ' + error.message 
        });
    }
}
