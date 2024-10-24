export interface AgentAuthInfo {
  name?: string;
  picture?: string;
}

export interface AgentAuth {
  user: string;
  provider: string;
  info?: AgentAuthInfo;
}

export interface AgentEnvironment {
  auth: AgentAuth;
  domain: string;
  server: string;
  session: string;
  context: string[];
}

export interface AgentUploadInfo {
  name?: string,
  type?: string,
  data?: string | ArrayBuffer,
  id?: string,
  browser?: boolean,
  accept?: string,
}

export interface Agent {
  login(provider: string): void;
  logout(): void;
  uuid(): string;
  state(id: string, user?: string, domain?: string): Promise<object>;
  metadata(id: string, user?: string, domain?: string): Promise<object>;
  watch(id: string, callback: (update: { state: object }) => void, user?: string, domain?: string): void;
  upload(info?: AgentUploadInfo): Promise<string>;
  download(id?: string): Promise<Response>;
  environment(userId?: string): Promise<AgentEnvironment>;
  close(): void;
  reset(ns: string): Promise<void>;
  synced(): Promise<void>;
}

declare const agent: Agent;
export default agent;
