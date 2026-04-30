export interface AgentAuthInfo {
  name?: string;
  picture?: string;
}

export interface AgentAuth {
  user: string;
  provider: string;
  info?: AgentAuthInfo;
}

export interface AgentEnvironmentVariables {
  LANGUAGES?: string[];
  [key: string]: unknown;
}

export interface AgentEnvironment {
  auth: AgentAuth;
  domain: string;
  server: string;
  session: string;
  context: string[];
  variables: AgentEnvironmentVariables;
}

export interface AgentUploadInfo {
  name?: string;
  type?: string;
  data?: string | ArrayBuffer;
  id?: string;
  browser?: boolean;
  accept?: string;
}

export interface SyncedStatePromise extends Promise<object> {
  synced(callback?: (state: object, patch: object[]) => void): SyncedStatePromise;
  metadata: Promise<object>;
}

export interface Agent {
  login(provider: string): void;
  logout(): void;
  uuid(): string;
  state(id: string, user?: string, domain?: string): SyncedStatePromise;
  metadata(id: string, user?: string, domain?: string): Promise<object>;
  watch(id: string, callback: (update: { state: object }) => void, user?: string, domain?: string): void;
  upload(info?: AgentUploadInfo): Promise<string>;
  download(id?: string): Promise<Response>;
  environment(userId?: string): Promise<AgentEnvironment>;
  close(info: any): void;
  reset(ns: string): Promise<void>;
  //  TODO: add query function
  synced(): Promise<void>;
}

declare const agent: Agent;
export default agent;
