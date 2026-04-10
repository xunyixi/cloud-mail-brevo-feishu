import feishuService from '../service/feishu-service';
import app from '../hono/hono';

// 获取邮件内容（飞书 WebApp 使用）
app.get('/getEmail/:token', async (c) => {
	try {
		const token = c.req.param('token');
		const content = await feishuService.getEmailContent(c, { token });
		return c.html(content);
	} catch (e) {
		return c.text(e.message, 500);
	}
});

// 飞书事件回调（可选，用于处理飞书按钮点击等交互）
app.post('/callback', async (c) => {
	try {
		const body = await c.req.json();
		console.log('飞书回调:', body);
		return c.json({ code: 0, msg: 'success' });
	} catch (e) {
		return c.json({ code: 1, msg: e.message }, 500);
	}
});
