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

export interface Agent {
  environment(userId?: string): Promise<AgentEnvironment>;
  state(ns?: string, user?: string, domain?: string): any;
  upload(userId?: string): Promise<string>;
  download(userId?: string): Promise<string>;
  close(): void;
  reset(ns: string): Promise<void>;
  synced(): Promise<void>;
}

export default Agent;
