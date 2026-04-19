import settingService from './setting-service';
import dayjs from 'dayjs';
import dayjs_plugin_utc from 'dayjs/plugin/utc';
import dayjs_plugin_timezone from 'dayjs/plugin/timezone';
dayjs.extend(dayjs_plugin_utc);
dayjs.extend(dayjs_plugin_timezone);
import jwtUtils from '../utils/jwt-utils';
import emailHtmlTemplate from '../template/email-html';
import emailTextTemplate from '../template/email-text';
import orm from '../entity/orm';
import email from '../entity/email';
import { eq } from 'drizzle-orm';
import domainUtils from "../utils/domain-uitls";
import emailUtils from "../utils/email-utils";

const feishuService = {

	async getAccessToken(c) {
		const { feishuAppId, feishuAppSecret } = await settingService.query(c);

		if (!feishuAppId || !feishuAppSecret) {
			return null;
		}

		const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				app_id: feishuAppId,
				app_secret: feishuAppSecret
			})
		});

		const data = await response.json();

		if (data.code !== 0) {
			throw new Error(`获取飞书访问令牌失败: ${data.msg}`);
		}

		return data.tenant_access_token;
	},

	async sendEmailToFeishu(c, email) {
		const { 
			feishuBotStatus, 
			feishuChatId, 
			feishuOpenId,
			feishuReceiveType,
			customDomain,
			feishuHeaderTemplate,
			feishuShowSender,
			feishuShowRecipient,
			feishuShowTime,
			feishuShowViewButton,
			feishuCustomDomain,
			feishuAppId
		} = await settingService.query(c);

		console.log(`[Feishu] 开始推送 - 状态:${feishuBotStatus}, AppID:${feishuAppId?feishuAppId.substring(0,8)+'...':'空'}, 接收类型:${feishuReceiveType === 1 ? '个人' : '群聊'}`);

		if (feishuBotStatus !== 0) {
			console.log(`[Feishu] 跳过：未启用 (status=${feishuBotStatus})`);
			return;
		}
		
		// 检查目标ID是否配置
		if (feishuReceiveType === 1) {
			// 个人模式
			if (!feishuOpenId) {
				console.log(`[Feishu] 跳过：个人 Open ID 为空`);
				return;
			}
		} else {
			// 群聊模式
			if (!feishuChatId) {
				console.log(`[Feishu] 跳过：群聊 ID 为空`);
				return;
			}
		}

		let accessToken;
		try {
			accessToken = await this.getAccessToken(c);
		} catch (e) {
			console.error(`[Feishu] 获取 Access Token 失败：${e.message}`);
			return;
		}

		if (!accessToken) {
			console.error('[Feishu] 配置不完整');
			return;
		}
		
		console.log('[Feishu] Access Token 获取成功');

		const jwtToken = await jwtUtils.generateToken(c, { emailId: email.emailId })
		const webAppUrl = feishuCustomDomain || customDomain ? `${feishuCustomDomain || domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : null;

		// 构建飞书富文本消息
		const cardContent = {
			config: {
				wide_screen_mode: true
			},
			header: {
				title: {
					tag: 'plain_text',
					content: `📧 收到新邮件 - ${email.subject || '无主题'}`
				},
				template: feishuHeaderTemplate === 'none' ? undefined : (feishuHeaderTemplate || 'blue')
			},
			elements: []
		};

		// 如果 header template 为 none，移除 header
		if (feishuHeaderTemplate === 'none') {
			delete cardContent.header;
		}

		// 根据配置添加元素
		if (feishuShowSender === 0 || feishuShowTime === 0) {
			const fields = [];
			
			if (feishuShowSender === 0) {
				fields.push({
					is_short: true,
					text: {
						tag: 'lark_md',
						content: `**发件人**\n${email.name || ''} <${email.sendEmail || ''}>`
					}
				});
			}
			
			if (feishuShowTime === 0) {
				fields.push({
					is_short: true,
					text: {
						tag: 'lark_md',
						content: `**时间**\n${dayjs(email.createTime).format('YYYY-MM-DD HH:mm:ss')}`
					}
				});
			}
			
			if (fields.length > 0) {
				cardContent.elements.push({
					tag: 'div',
					fields: fields
				});
			}
		}

		// 添加分隔线
		if (cardContent.elements.length > 0) {
			cardContent.elements.push({ tag: 'hr' });
		}

		// 添加收件人信息
		if (feishuShowRecipient === 0) {
			cardContent.elements.push({
				tag: 'div',
				text: {
					tag: 'lark_md',
					content: `**收件人**\n${email.toName || ''} <${email.toEmail || ''}>`
				}
			});
		}

		// 如果有 WebApp URL 且显示查看按钮，添加按钮
		if (webAppUrl && feishuShowViewButton === 0) {
			cardContent.elements.push({
				tag: 'action',
				actions: [
					{
						tag: 'button',
						text: {
							tag: 'plain_text',
							content: '查看邮件'
						},
						type: 'primary',
						url: webAppUrl
					}
				]
			});
		}

		const chatIds = feishuChatId.split(',').filter(id => id.trim());
		const openIds = feishuOpenId ? feishuOpenId.split(',').filter(id => id.trim()) : [];
		
		// 根据接收类型决定发送目标
		let targets = [];
		if (feishuReceiveType === 1) {
			// 个人模式：使用 open_id
			targets = openIds.map(id => ({ type: 'open_id', id: id.trim() }));
		} else {
			// 群聊模式：使用 chat_id
			targets = chatIds.map(id => ({ type: 'chat_id', id: id.trim() }));
		}

		for (const target of targets) {
			try {
				const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${target.type}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${accessToken}`
					},
					body: JSON.stringify({
						receive_id: target.id,
						msg_type: 'interactive',
						content: JSON.stringify(cardContent)
					})
				});

				const result = await response.json();

				if (result.code !== 0) {
					console.error(`[Feishu] 发送消息失败 ${target.type}: ${target.id}, 错误: ${result.msg}`);
				} else {
					console.log(`[Feishu] 消息发送成功 ${target.type}: ${target.id}`);
				}
			} catch (e) {
				console.error(`[Feishu] 发送消息异常 ${target.type}: ${target.id}:`, e.message);
			}
		}
	},

	async getEmailContent(c, params) {
		const { token } = params

		const result = await jwtUtils.verifyToken(c, token);

		if (!result) {
			return emailTextTemplate('Access denied')
		}

		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();

		if (emailRow) {

			if (emailRow.content) {
				const { r2Domain } = await settingService.query(c);
				return emailHtmlTemplate(emailRow.content || '', r2Domain)
			} else {
				return emailTextTemplate(emailRow.text || '')
			}

		} else {
			return emailTextTemplate('The email does not exist')
		}
	},

	// 发送邮件后推送飞书通知
	async sendEmailNotifyFeishu(c, emailRow, recipients) {
		const { 
			feishuBotStatus, 
			feishuChatId, 
			feishuOpenId,
			feishuReceiveType,
			customDomain,
			feishuHeaderTemplate,
			feishuShowSender,
			feishuShowRecipient,
			feishuShowTime,
			feishuShowViewButton,
			feishuCustomDomain,
			feishuAppId
		} = await settingService.query(c);

		console.log(`[Feishu] 发送邮件推送 - 状态:${feishuBotStatus}, AppID:${feishuAppId?feishuAppId.substring(0,8)+'...':'空'}, 接收类型:${feishuReceiveType === 1 ? '个人' : '群聊'}`);

		if (feishuBotStatus !== 0) {
			console.log(`[Feishu] 发送推送跳过：未启用 (status=${feishuBotStatus})`);
			return;
		}
		
		// 检查目标ID是否配置
		if (feishuReceiveType === 1) {
			// 个人模式
			if (!feishuOpenId) {
				console.log(`[Feishu] 发送推送跳过：个人 Open ID 为空`);
				return;
			}
		} else {
			// 群聊模式
			if (!feishuChatId) {
				console.log(`[Feishu] 发送推送跳过：群聊 ID 为空`);
				return;
			}
		}

		let accessToken;
		try {
			accessToken = await this.getAccessToken(c);
		} catch (e) {
			console.error(`[Feishu] 获取 Access Token 失败：${e.message}`);
			return;
		}

		if (!accessToken) {
			console.error('[Feishu] 配置不完整');
			return;
		}
		
		console.log('[Feishu] 发送邮件 Access Token 获取成功');

		const jwtToken = await jwtUtils.generateToken(c, { emailId: emailRow.emailId })
		const webAppUrl = feishuCustomDomain || customDomain ? `${feishuCustomDomain || domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : null;

		// 构建飞书富文本消息（发送邮件通知）
		const cardContent = {
			config: {
				wide_screen_mode: true
			},
			header: {
				title: {
					tag: 'plain_text',
					content: `📤 已发送邮件 - ${emailRow.subject || '无主题'}`
				},
				template: feishuHeaderTemplate === 'none' ? undefined : (feishuHeaderTemplate || 'blue')
			},
			elements: []
		};

		// 如果 header template 为 none，移除 header
		if (feishuHeaderTemplate === 'none') {
			delete cardContent.header;
		}

		// 根据配置添加元素
		if (feishuShowSender === 0 || feishuShowTime === 0) {
			const fields = [];
			
			if (feishuShowSender === 0) {
				fields.push({
					is_short: true,
					text: {
						tag: 'lark_md',
						content: `**发件人**\n${emailRow.name || ''} <${emailRow.sendEmail || ''}>`
					}
				});
			}
			
			if (feishuShowTime === 0) {
				fields.push({
					is_short: true,
					text: {
						tag: 'lark_md',
						content: `**时间**\n${dayjs(emailRow.createTime).format('YYYY-MM-DD HH:mm:ss')}`
					}
				});
			}
			
			if (fields.length > 0) {
				cardContent.elements.push({
					tag: 'div',
					fields: fields
				});
			}
		}

		// 添加分隔线
		if (cardContent.elements.length > 0) {
			cardContent.elements.push({ tag: 'hr' });
		}

		// 添加收件人信息
		if (feishuShowRecipient === 0) {
			const recipientText = recipients.map(r => r.address).join(', ');
			cardContent.elements.push({
				tag: 'div',
				text: {
					tag: 'lark_md',
					content: `**收件人**\n${recipientText}`
				}
			});
		}

		// 如果有 WebApp URL 且显示查看按钮，添加按钮
		if (webAppUrl && feishuShowViewButton === 0) {
			cardContent.elements.push({
				tag: 'action',
				actions: [
					{
						tag: 'button',
						text: {
							tag: 'plain_text',
							content: '查看邮件'
						},
						type: 'primary',
						url: webAppUrl
					}
				]
			});
		}

		const chatIds = feishuChatId.split(',').filter(id => id.trim());
		const openIds = feishuOpenId ? feishuOpenId.split(',').filter(id => id.trim()) : [];
		
		// 根据接收类型决定发送目标
		let targets = [];
		if (feishuReceiveType === 1) {
			// 个人模式：使用 open_id
			targets = openIds.map(id => ({ type: 'open_id', id: id.trim() }));
		} else {
			// 群聊模式：使用 chat_id
			targets = chatIds.map(id => ({ type: 'chat_id', id: id.trim() }));
		}

		for (const target of targets) {
			try {
				const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${target.type}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${accessToken}`
					},
					body: JSON.stringify({
						receive_id: target.id,
						msg_type: 'interactive',
						content: JSON.stringify(cardContent)
					})
				});

				const result = await response.json();

				if (result.code !== 0) {
					console.error(`[Feishu] 发送消息失败 ${target.type}: ${target.id}, 错误: ${result.msg}`);
				} else {
					console.log(`[Feishu] 消息发送成功 ${target.type}: ${target.id}`);
				}
			} catch (e) {
				console.error(`[Feishu] 发送消息异常 ${target.type}: ${target.id}:`, e.message);
			}
		}
	}
}

export default feishuService
