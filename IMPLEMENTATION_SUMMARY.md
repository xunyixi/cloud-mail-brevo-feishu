# 功能实现概述

## 1. Brevo 邮件发送支持

### 后端实现

#### 数据库实体修改
- `mail-worker/src/entity/email.js`: 添加 `brevoEmailId` 和 `emailProvider` 字段
- `mail-worker/src/entity/setting.js`: 添加 `brevoTokens` 字段存储 Brevo API Key

#### 服务层
- **新建** `mail-worker/src/service/brevo-service.js`: 
  - `webhooks()`: 处理 Brevo 的 webhook 事件
  - `sendEmail()`: 通过 Brevo API 发送邮件
  - `updateEmailStatusByBrevo()`: 更新 Brevo 邮件状态

- **修改** `mail-worker/src/service/email-service.js`:
  - 导入 `brevoService` 和 `resendService`
  - 修改发送逻辑支持根据设置选择邮件服务商（Resend 或 Brevo）
  - 添加 `updateEmailStatusByBrevo()` 方法调用 Brevo 服务

- **修改** `mail-worker/src/service/resend-service.js`:
  - 重构代码，添加 `sendEmail()` 独立方法
  - 保留原有的 webhook 处理

- **修改** `mail-worker/src/service/setting-service.js`:
  - 在 `refresh()` 方法中解析 `brevoTokens`
  - 在 `get()` 方法中隐藏敏感的 Brevo Token
  - 在 `set()` 方法中处理 `brevoTokens` 的保存

#### API 层
- **新建** `mail-worker/src/api/brevo-api.js`: 添加 Brevo webhook 接口

### 前端实现

#### 系统设置页面修改
- **修改** `mail-vue/src/views/sys-setting/index.vue`:
  - 在邮件设置卡片中添加 Brevo Token 配置按钮（列表查看和添加）
  - 添加邮件服务商选择下拉框（Resend/Brevo）
  - 添加 Brevo Token 配置对话框
  - 添加 Brevo Token 列表对话框
  - 添加相关方法：`openBrevoForm()`, `openBrevoList()`, `saveBrevoToken()`, `cleanBrevoTokenForm()`
  - 添加 `brevoTokenForm` 响应式对象
  - 添加 `brevoList` 计算属性

## 2. 飞书推送功能

### 后端实现

#### 数据库实体修改
- `mail-worker/src/entity/setting.js`: 添加飞书相关字段
  - `feishuAppId`: 飞书应用 ID
  - `feishuAppSecret`: 飞书应用密钥
  - `feishuBotStatus`: 飞书推送开关（0:启用, 1:禁用）
  - `feishuChatId`: 接收推送的群聊 ID

#### 服务层
- **新建** `mail-worker/src/service/feishu-service.js`:
  - `getAccessToken()`: 获取飞书访问令牌
  - `sendEmailToFeishu()`: 发送邮件到飞书（富文本卡片格式）
  - `getEmailContent()`: 获取邮件内容（供飞书 WebApp 使用）

- **修改** `mail-worker/src/service/setting-service.js`:
  - 在 `get()` 方法中隐藏敏感的 `feishuAppSecret`

- **修改** `mail-worker/src/email/email.js`:
  - 在邮件接收逻辑中添加飞书推送调用

#### API 层
- **新建** `mail-worker/src/api/feishu-api.js`:
  - `/getEmail/:token`: 获取邮件内容（飞书 WebApp 使用）
  - `/callback`: 飞书事件回调（可选）

### 前端实现

#### 系统设置页面修改
- **修改** `mail-vue/src/views/sys-setting/index.vue`:
  - 在邮件推送卡片中添加飞书推送配置按钮
  - 添加飞书配置对话框
  - 添加相关方法：`openFeishuSetting()`, `feishuSave()`
  - 添加飞书相关变量：`feishuAppId`, `feishuAppSecret`, `feishuChatId`, `feishuBotStatus`

## 功能特性

### Brevo 支持
- ✅ 支持 Brevo API Key 配置（按域名）
- ✅ 支持邮件服务商切换（Resend/Brevo）
- ✅ 支持群发、内嵌图片和附件发送
- ✅ 支持 webhook 状态跟踪（已发送、已投递、退回、延迟、失败等）
- ✅ 保留原有 Resend 功能

### 飞书推送
- ✅ 支持配置飞书应用（App ID 和 App Secret）
- ✅ 支持配置接收推送的群聊 ID（支持多个）
- ✅ 邮件以富文本卡片形式推送到飞书
- ✅ 支持开关控制推送功能
- ✅ 与 Telegram 推送并存

## 部署注意事项

1. **数据库迁移**: 部署时需要确保数据库已添加新字段（`brevoEmailId`, `emailProvider`, `brevoTokens`, `feishuAppId`, `feishuAppSecret`, `feishuBotStatus`, `feishuChatId`）

2. **环境变量**: 无需添加新的环境变量，所有配置通过系统设置界面配置

3. **Webhook 配置**:
   - Brevo webhook URL: `https://your-domain.com/api/brevo/webhooks`
   - 在 Brevo 后台配置 webhook 以接收邮件状态更新

4. **飞书应用配置**:
   - 需要在飞书开放平台创建应用
   - 获取 App ID 和 App Secret
   - 配置应用权限：发送消息到群聊、获取群聊信息等
   - 获取目标群聊的 open_id

## 使用说明

### Brevo 邮件发送
1. 登录系统，进入系统设置
2. 在"邮件设置"卡片中，点击 Brevo Token 旁边的添加按钮
3. 选择域名并输入 Brevo API Key（从 Brevo 后台获取）
4. 在"邮件服务商"下拉框中选择使用的服务商（Resend 或 Brevo）
5. 保存设置

### 飞书推送
1. 登录系统，进入系统设置
2. 在"邮件推送"卡片中，点击飞书推送旁边的设置按钮
3. 输入飞书应用的 App ID 和 App Secret
4. 输入接收推送的群聊 open_id（多个用逗号分隔）
5. 开启推送开关
6. 保存设置

## 代码文件清单

### 后端（mail-worker）
- `src/entity/email.js` - 邮件实体（添加 Brevo 字段）
- `src/entity/setting.js` - 设置实体（添加 Brevo 和飞书字段）
- `src/service/brevo-service.js` - **新建** Brevo 服务
- `src/service/feishu-service.js` - **新建** 飞书服务
- `src/service/email-service.js` - 邮件服务（修改发送逻辑）
- `src/service/resend-service.js` - Resend 服务（重构）
- `src/service/setting-service.js` - 设置服务（添加 Brevo 和飞书支持）
- `src/api/brevo-api.js` - **新建** Brevo API
- `src/api/feishu-api.js` - **新建** 飞书 API
- `src/email/email.js` - 邮件接收处理（添加飞书推送）

### 前端（mail-vue）
- `src/views/sys-setting/index.vue` - 系统设置页面（添加 Brevo 和飞书配置界面）

## 测试建议

1. **Brevo 发送测试**:
   - 配置 Brevo API Key
   - 发送测试邮件到外部邮箱
   - 检查邮件是否正常发送
   - 验证 webhook 状态更新

2. **飞书推送测试**:
   - 配置飞书应用
   - 发送测试邮件到站内邮箱
   - 验证飞书是否收到推送消息
   - 点击"查看邮件"按钮测试 WebApp

3. **服务商切换测试**:
   - 切换邮件服务商
   - 验证邮件是否通过正确的服务商发送
