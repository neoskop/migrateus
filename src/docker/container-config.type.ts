export type ContainerConfig = {
  NetworkSettings: {
    Networks: Record<string, { IPAddress?: string } | null>;
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  };
  Config: { Env: string[]; Image?: string };
  State: { Running: boolean };
  Id: string;
};
