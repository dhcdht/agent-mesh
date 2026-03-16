import { z } from "zod";

export const idSchema = z.string().min(1);

export const createMeshSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
});

export const updateMeshSchema = z
  .object({
    name: z.string().min(1).optional(),
    status: z.enum(["created", "running", "completed", "recycled"]).optional(),
    completedAt: z.string().datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const createRepoSchema = z.object({
  id: idSchema,
  meshId: idSchema,
  path: z.string().min(1),
  gitRemote: z.string().url().optional(),
  agentId: idSchema,
});

export const registerAgentSchema = z.object({
  id: idSchema,
  meshId: idSchema,
  name: z.string().min(1),
  repoId: idSchema,
  cliType: z.string().min(1),
  cliConfig: z.record(z.unknown()),
  nodeId: z.string().min(1).optional(),
  status: z.enum(["idle", "busy", "offline"]).optional(),
});

export const createTaskSchema = z.object({
  id: idSchema,
  meshId: idSchema,
  subject: z.string().min(1),
  description: z.string().min(1),
  owner: idSchema,
  repoId: idSchema,
  blocks: z.array(idSchema).optional(),
  blockedBy: z.array(idSchema).optional(),
});

export const updateTaskSchema = z
  .object({
    subject: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    status: z.enum(["pending", "in_progress", "completed", "deleted"]).optional(),
    owner: idSchema.optional(),
    repoId: idSchema.optional(),
    blocks: z.array(idSchema).optional(),
    blockedBy: z.array(idSchema).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const createMessageSchema = z.object({
  id: idSchema,
  meshId: idSchema,
  from: idSchema,
  to: idSchema,
  type: z.string().min(1),
  payload: z.unknown(),
});
