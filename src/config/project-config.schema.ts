import {z} from 'zod';

const httpUrl = () => z.url({protocol: /^https?$/});

/**
 * Shape of `projects/<name>/project.json`. `production` is deliberately not an
 * allowed environment: the agent only tests local or staging copies.
 */
export const projectConfigSchema = z.strictObject({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Use lower-case letters, digits and -'),
  environment: z.enum(['local', 'staging']),
  baseUrl: httpUrl(),
  app: z
    .strictObject({
      startCommand: z.string().min(1),
      cwd: z.string().default('.'),
      readyUrl: httpUrl().optional(),
      readyTimeoutSeconds: z.number().int().positive().max(600).default(120),
    })
    .optional(),
  pages: z.array(z.string().startsWith('/')).min(1),
  allowedOrigins: z.array(httpUrl()).default([]),
  checks: z
    .strictObject({
      brokenLinks: z.boolean().default(true),
      accessibility: z.boolean().default(true),
      maxLinksPerPage: z.number().int().positive().max(500).default(50),
    })
    .prefault({}),
});
