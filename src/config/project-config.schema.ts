import {z} from 'zod';

const httpUrl = () => z.url({protocol: /^https?$/});
const slug = () =>
  z.string().regex(/^[a-z0-9-]+$/, 'Use lower-case letters, digits and -');
const appPath = () =>
  z
    .string()
    .startsWith('/')
    .refine(path => !path.startsWith('//'), 'Must be a path on this app');
/** Passwords live in environment variables; settings only name them. */
const envName = () =>
  z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Use an environment variable name');

const accountSchema = z.strictObject({
  usernameEnv: envName(),
  passwordEnv: envName(),
});

/** Routine log-in is scripted (no AI), as the proposal requires. */
const loginSchema = z.strictObject({
  path: appPath(),
  usernameSelector: z.string().min(1),
  passwordSelector: z.string().min(1),
  submitSelector: z.string().min(1),
  /** Playwright selector that only appears after a successful log-in. */
  successSelector: z.string().min(1),
});

const testGoalSchema = z.strictObject({
  id: slug(),
  /** Plain-language goal, e.g. "Submit an application with CGPA 5.00". */
  goal: z.string().min(10).max(1000),
  startPath: appPath().default('/'),
  /** Account (key of `accounts`) to log in with before the goal starts. */
  account: slug().optional(),
  maxSteps: z.number().int().positive().max(50).default(15),
  /** Dangerous words this goal may click, e.g. ["send"]. Empty by default. */
  allowActions: z.array(z.string().min(1)).default([]),
});

/**
 * Shape of `projects/<name>/project.json`. `production` is deliberately not an
 * allowed environment: the agent only tests local or staging copies.
 */
export const projectConfigSchema = z
  .strictObject({
    name: slug(),
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
    pages: z.array(appPath()).min(1),
    allowedOrigins: z.array(httpUrl()).default([]),
    checks: z
      .strictObject({
        brokenLinks: z.boolean().default(true),
        accessibility: z.boolean().default(true),
        maxLinksPerPage: z.number().int().positive().max(500).default(50),
      })
      .prefault({}),
    accounts: z.record(slug(), accountSchema).default({}),
    login: loginSchema.optional(),
    testGoals: z.array(testGoalSchema).default([]),
  })
  .superRefine((config, ctx) => {
    config.testGoals.forEach((goal, index) => {
      if (!goal.account) {
        return;
      }
      if (!config.accounts[goal.account]) {
        ctx.addIssue({
          code: 'custom',
          path: ['testGoals', index, 'account'],
          message: `Account "${goal.account}" is not defined in accounts`,
        });
      }
      if (!config.login) {
        ctx.addIssue({
          code: 'custom',
          path: ['login'],
          message: 'login is required when a test goal uses an account',
        });
      }
    });
  });
