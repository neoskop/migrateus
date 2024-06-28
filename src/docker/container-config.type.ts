export type ContainerConfig = {
  NetworkSettings: { Networks: string[] };
  Config: { Env: string[] };
  State: { Running: boolean };
  Id: string;
};
