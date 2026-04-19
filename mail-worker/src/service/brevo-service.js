import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import orm from '../entity/orm';
import email from '../entity/email';
import { eq } from 'drizzle-orm';

const brevoService = {

	async webhooks(c, body) {
		const params = {
			brevoEmailId: body.messageId,
			status: emailConst.status.SENT
		}

		if (body.event === 'delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.event === 'spam') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.event === 'bounce') {
			let bounce = {
				reason: body.reason,
				email: body.email
			}
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (body.event === 'deferred') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.event === 'error' || body.event === 'failed') {
			params.status = emailConst.status.FAILED
			params.message = body.reason || body.error
		}

		const emailRow = await this.updateEmailStatusByBrevo(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}
	},

	async updateEmailStatusByBrevo(c, params) {
		const { status, brevoEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.brevoEmailId, brevoEmailId)).returning().get();
	},

	async sendEmail(c, brevoApiKey, sendForm) {
		const { from, to, subject, text, html, attachments } = sendForm;

		// 转换附件格式为 Brevo 要求的格式
		const brevoAttachments = attachments?.map(att => {
			let attData = {
				name: att.filename || att.name,
				content: att.content
			}
			return attData;
		}) || [];

		// Brevo API 要求：如果没有附件，不要发送 attachment 字段
		const brevoSendForm = {
			sender: { email: from.match(/<(.+)>/)?.[1] || from },
			to: to.map(email => ({ email: email })),
			subject: subject,
			htmlContent: html,
			textContent: text
		};

		// 只有在有附件时才添加 attachment 字段
		if (brevoAttachments.length > 0) {
			brevoSendForm.attachment = brevoAttachments;
		}

		const response = await fetch('https://api.brevo.com/v3/smtp/email', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'api-key': brevoApiKey
			},
			body: JSON.stringify(brevoSendForm)
		});

		const data = await response.json();

		if (!response.ok) {
			throw new BizError(data.message || 'Brevo 发送失败');
		}

		return { data, error: null };
	}
}

export default brevoService
