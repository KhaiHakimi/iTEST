import {existsSync} from 'node:fs';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import type {LoadedProject} from './interfaces/project-config.interface.js';
import {projectConfigSchema} from './project-config.schema.js';

const PROJECT_NAME_PATTERN = /^[a-z0-9-]+$/;
const CONFIG_FILE = 'project.json';

/** Loads and validates per-project settings from the `projects/` folder. */
export class ProjectConfigService {
  constructor(private readonly projectsDir: string) {}

  async list(): Promise<string[]> {
    const entries = await readdir(this.projectsDir, {withFileTypes: true});
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => existsSync(join(this.projectsDir, name, CONFIG_FILE)))
      .sort();
  }

  async load(projectName: string): Promise<LoadedProject> {
    // Checked before building a path so a name like "../x" cannot escape projects/.
    if (!PROJECT_NAME_PATTERN.test(projectName)) {
      throw new Error(
        `Invalid project name "${projectName}". Use lower-case letters, digits and -.`,
      );
    }
    const projectDir = join(this.projectsDir, projectName);
    const file = join(projectDir, CONFIG_FILE);
    if (!existsSync(file)) {
      throw new Error(`No ${CONFIG_FILE} found for project "${projectName}".`);
    }

    const parsed = projectConfigSchema.safeParse(
      JSON.parse(await readFile(file, 'utf8')),
    );
    if (!parsed.success) {
      throw new Error(`Invalid ${file}:\n${z.prettifyError(parsed.error)}`);
    }
    if (parsed.data.name !== projectName) {
      throw new Error(
        `${file} has name "${parsed.data.name}" but is in folder "${projectName}".`,
      );
    }
    return {config: parsed.data, projectDir};
  }
}
