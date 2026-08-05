module.exports = async (req, res) => {
    // Chỉ chấp nhận phương thức POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            message: 'Phương thức không được hỗ trợ. Vui lòng sử dụng POST.' 
        });
    }

    try {
        const { url } = req.body || {};

        if (!url) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng cung cấp URL gốc.' 
            });
        }

        // Lấy API Token từ biến môi trường Vercel
        const apiToken = process.env.LINK4M_API_TOKEN;

        if (!apiToken) {
            return res.status(500).json({ 
                success: false, 
                message: 'Chưa cấu hình biến môi trường LINK4M_API_TOKEN trên Vercel.' 
            });
        }

        // Gọi API Link4M
        const targetApi = `https://link4m.co/api-shorten?api=${encodeURIComponent(apiToken)}&url=${encodeURIComponent(url)}`;
        const response = await fetch(targetApi);
        const data = await response.json();

        // Xử lý phản hồi từ Link4M
        if (data.status === 'success' || data.shortenedUrl || data.url || data.shortedUrl) {
            const shortUrl = data.shortenedUrl || data.url || data.shortedUrl;
            return res.status(200).json({ 
                success: true, 
                shortUrl: shortUrl 
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: data.message || 'Lỗi khi tạo link rút gọn từ API Link4M.' 
            });
        }

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: 'Lỗi kết nối máy chủ: ' + error.message 
        });
    }
};
