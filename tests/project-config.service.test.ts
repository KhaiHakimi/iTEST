import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {ProjectConfigService} from '../src/config/project-config.service.js';

describe('ProjectConfigService', () => {
  let projectsDir: string;
  let service: ProjectConfigService;

  const writeProject = async (folder: string, config: unknown) => {
    await mkdir(join(projectsDir, folder), {recursive: true});
    await writeFile(
      join(projectsDir, folder, 'project.json'),
      JSON.stringify(config),
    );
  };

  beforeEach(async () => {
    projectsDir = await mkdtemp(join(tmpdir(), 'agent-projects-'));
    service = new ProjectConfigService(projectsDir);
  });

  afterEach(async () => {
    await rm(projectsDir, {recursive: true, force: true});
  });

  it('loads a minimal project and applies defaults', async () => {
    await writeProject('portal', {
      name: 'portal',
      environment: 'local',
      baseUrl: 'http://localhost:3000',
      pages: ['/'],
    });

    const {config} = await service.load('portal');

    expect(config.allowedOrigins).toEqual([]);
    expect(config.checks).toEqual({
      brokenLinks: true,
      accessibility: true,
      maxLinksPerPage: 50,
    });
  });

  it('refuses production as an environment', async () => {
    await writeProject('live', {
      name: 'live',
      environment: 'production',
      baseUrl: 'https://portal.example.com',
      pages: ['/'],
    });

    await expect(service.load('live')).rejects.toThrow(/environment/);
  });

  it('refuses unknown keys so typos are caught', async () => {
    await writeProject('typo', {
      name: 'typo',
      environment: 'local',
      baseUrl: 'http://localhost:3000',
      pages: ['/'],
      pagess: ['/x'],
    });

    await expect(service.load('typo')).rejects.toThrow(/pagess/);
  });

  it('refuses project names that could escape the projects folder', async () => {
    await expect(service.load('../secrets')).rejects.toThrow(
      /Invalid project name/,
    );
  });

  it('refuses a settings name that does not match its folder', async () => {
    await writeProject('one', {
      name: 'two',
      environment: 'local',
      baseUrl: 'http://localhost:3000',
      pages: ['/'],
    });

    await expect(service.load('one')).rejects.toThrow(/folder "one"/);
  });

  it('lists only folders that contain project.json', async () => {
    await writeProject('b-project', {});
    await writeProject('a-project', {});
    await mkdir(join(projectsDir, 'empty-folder'));

    expect(await service.list()).toEqual(['a-project', 'b-project']);
  });
});
