type HttpMethod = "GET" | "POST" | "PATCH";

export interface CliClientOptions {
  baseUrl: string;
  apiKey?: string;
}

export class CliClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(options: CliClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  }
}
