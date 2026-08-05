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

        // Tạo URL API Link4M
        const targetApi = `https://link4m.co/api-shorten?api=${encodeURIComponent(apiToken)}&url=${encodeURIComponent(url)}`;

        // Gọi API Link4M kèm Header giả lập Trình duyệt Chrome để tránh bị Cloudflare chặn HTML
        const response = await fetch(targetApi, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache'
            }
        });

        const rawText = await response.text();
        let data;
        
        try {
            data = JSON.parse(rawText);
        } catch (e) {
            // Trường hợp vẫn bị Cloudflare chặn trả về HTML
            return res.status(502).json({
                success: false,
                message: 'Link4M đang bật khiên bảo vệ Cloudflare chặn IP Serverless. Vui lòng kiểm tra lại API Token hoặc thử lại sau.'
            });
        }

        const shortUrl = data.shortenedUrl || data.url || data.shortedUrl;

        if (data.status === 'success' || shortUrl) {
            return res.status(200).json({ success: true, shortUrl: shortUrl });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: data.message || 'Lỗi từ Link4M (Kiểm tra lại API Token hoặc liên kết nhập vào)' 
            });
        }

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: 'Lỗi máy chủ: ' + error.message 
        });
    }
}
