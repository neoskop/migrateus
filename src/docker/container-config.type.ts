export type ContainerConfig = {
  NetworkSettings: { Networks: string[] };
  Config: { Env: string[]; Image?: string };
  State: { Running: boolean };
  Id: string;
};
