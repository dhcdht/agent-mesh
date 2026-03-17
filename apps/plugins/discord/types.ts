/**
 * Discord 插件类型定义
 * 复用 ChatPlugin 模式，适配 Discord Bot API
 */

export interface DiscordPluginConfig {
  coordinatorUrl: string;
  meshId: string;
  apiKey?: string;
  /** Discord Bot Token（Bot 身份发消息） */
  botToken?: string;
  /** 频道 ID（channel_id），用于推送消息 */
  channelId?: string;
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
