/**
 * Slack 插件类型定义
 * 自举任务产出：agent-plugin
 */

export interface PluginConfig {
  coordinatorUrl: string;
  meshId: string;
  apiKey?: string;
  slackToken?: string;
  slackChannel?: string;
  /** 接收用户回复：Slack Signing Secret，用于验证请求 */
  slackSigningSecret?: string;
  /** 接收用户回复：HTTP 端口，需公网可访问并配置为 Slack Event Subscriptions Request URL */
  slackEventsPort?: number;
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

export interface ChatPlugin {
  name: string;
  start(config: PluginConfig): Promise<void>;
  stop(): Promise<void>;
  onTaskUpdate?(event: TaskEvent): void;
  onMessage?(event: MessageEvent): void;
  sendToUser?(userId: string, content: string): Promise<void>;
  sendBroadcast?(content: string): Promise<void>;
}
