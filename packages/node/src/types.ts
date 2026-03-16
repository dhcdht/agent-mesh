import { z } from "zod";

export const nodeConfigSchema = z.object({
  coordinator: z.object({
    url: z.string().url(),
    apiKey: z.string().nullish(),
  }),
  mesh: z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
  }),
  repos: z.array(
    z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      gitRemote: z.string().optional(),
      agent: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        cliType: z.string().min(1),
        cliConfig: z.record(z.unknown()).default({}),
      }),
    })
  ),
  node: z
    .object({
      id: z.string().min(1),
      pollIntervalMs: z.number().int().positive().default(3000),
    })
    .default({ id: "node-1", pollIntervalMs: 3000 }),
});

export type NodeConfig = z.infer<typeof nodeConfigSchema>;
