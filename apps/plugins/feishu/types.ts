/**
 * 飞书插件类型定义
 * 复用 ChatPlugin 接口，适配飞书开放平台
 */

export interface FeishuPluginConfig {
  coordinatorUrl: string;
  meshId: string;
  apiKey?: string;
  /** 飞书应用 App ID */
  appId?: string;
  /** 飞书应用 App Secret */
  appSecret?: string;
  /** 群聊 ID（chat_id），用于推送消息 */
  chatId?: string;
  /** 事件订阅 Verification Token，用于校验请求来源 */
  verificationToken?: string;
  /** 接收用户消息的 HTTP 端口，需公网可访问并配置为飞书事件订阅请求 URL */
  eventsPort?: number;
}

export interface TaskEvent {
  meshId: string;
  taskId: string;
  status: string;
  subject?: string;
  owner?: string;
}

export interface MessageEvent {
  meshId: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
}
