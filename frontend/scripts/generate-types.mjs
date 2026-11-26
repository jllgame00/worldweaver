import { readFile, writeFile } from 'node:fs/promises';
import { compile } from 'json-schema-to-typescript';

const schema = JSON.parse(await readFile(new URL('../../docs/project-v1.schema.json', import.meta.url), 'utf8'));
const target = new URL('../src/project.generated.ts', import.meta.url);
const { Project, ...definitions } = schema.definitions;
const types = await compile({ ...Project, definitions }, 'Project', {
  bannerComment: '// Generated from docs/project-v1.schema.json. Run npm run generate:types after changing the schema.',
  unreachableDefinitions: true,
});

if (process.argv.includes('--check')) {
  const current = await readFile(target, 'utf8');
  if (current.replace(/\r\n/g, '\n') !== types) {
    console.error('Project types are out of date. Run npm run generate:types.');
    process.exitCode = 1;
  }
} else {
  await writeFile(target, types);
}
