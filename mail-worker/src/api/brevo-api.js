import brevoService from '../service/brevo-service';
import app from '../hono/hono';
app.post('/webhooks',async (c) => {
	try {
		await brevoService.webhooks(c, await c.req.json());
		return c.text('success', 200)
	} catch (e) {
		return  c.text(e.message, 500)
	}
})
