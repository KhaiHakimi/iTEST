import type {z} from 'zod';
import type {projectConfigSchema} from '../project-config.schema.js';

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type TestGoal = ProjectConfig['testGoals'][number];
export type LoginConfig = NonNullable<ProjectConfig['login']>;
export type AccountConfig = ProjectConfig['accounts'][string];

export interface LoadedProject {
  config: ProjectConfig;
  /** Absolute folder holding the project's `project.json`. */
  projectDir: string;
}
