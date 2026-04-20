import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import r2Service from './service/r2-service';
import settingService from './service/setting-service';
import oauthService from "./service/oauth-service";

export default {
	async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			const key = url.pathname.substring(1);
			
			// 创建 context 对象
			const c = { env };
			
			// 获取存储类型
			const storageType = await r2Service.storageType(c);

			if (storageType === 'KV') {
				return await kvObjService.toObjResp(c, key);
			}

			if (storageType === 'R2') {
				const obj = await env.r2.get(key);
				if (!obj) {
					return new Response('Not Found', { status: 404 });
				}
				return new Response(obj.body, {
					headers: {
						'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
						'Content-Disposition': obj.httpMetadata?.contentDisposition || null,
						'Cache-Control': obj.httpMetadata?.cacheControl || null
					}
				});
			}

			if (storageType === 'S3') {
				const setting = await settingService.query(c);
				const { bucket, endpoint, s3AccessKey, s3SecretKey, forcePathStyle } = setting;
				
				if (!bucket || !endpoint) {
					return new Response('Storage not configured', { status: 500 });
				}
				
				const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
				const domainUtils = (await import('./utils/domain-uitls.js')).default;
				const { settingConst } = await import('./const/entity-const.js');
				
				const client = new S3Client({
					region: 'auto',
					endpoint: domainUtils.toOssDomain(endpoint),
					forcePathStyle: forcePathStyle === settingConst.forcePathStyle.OPEN,
					credentials: {
						accessKeyId: s3AccessKey,
						secretAccessKey: s3SecretKey,
					}
				});
				
				try {
					const response = await client.send(new GetObjectCommand({
						Bucket: bucket,
						Key: key
					}));
					
					return new Response(response.Body, {
						headers: {
							'Content-Type': response.ContentType || 'application/octet-stream',
							'Content-Disposition': response.ContentDisposition || null,
							'Cache-Control': response.CacheControl || null
						}
					});
				} catch (e) {
					console.error('S3 get error:', e);
					return new Response('Not Found', { status: 404 });
				}
			}
		}

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await oauthService.clearNoBindOathUser({ env })
	},
};
