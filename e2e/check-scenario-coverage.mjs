#!/usr/bin/env node
// plain Node script, no dependencies: verifies that every scenario
// catalogued in e2e/scenarios.md has a matching Maestro flow file under
// e2e/flows/. exits non-zero and names any catalogued scenario missing its
// flow.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(__dirname, 'scenarios.md');
const flowsDir = join(__dirname, 'flows');

const SCENARIO_HEADING = /^##\s+(SCN-\d+):\s*(.+)$/;

function readCatalog() {
  const contents = readFileSync(catalogPath, 'utf8');
  const scenarios = [];

  for (const line of contents.split('\n')) {
    const match = line.match(SCENARIO_HEADING);
    if (match) {
      scenarios.push({ id: match[1], title: match[2].trim() });
    }
  }

  return scenarios;
}

function main() {
  const scenarios = readCatalog();

  if (scenarios.length === 0) {
    console.error(
      `No scenarios found in ${catalogPath}. Expected at least one "## SCN-NNN: ..." heading.`,
    );
    process.exit(1);
  }

  const uncovered = scenarios.filter(
    (scenario) => !existsSync(join(flowsDir, `${scenario.id}.yaml`)),
  );

  if (uncovered.length > 0) {
    console.error(
      'Scenario coverage check failed. The following catalogued scenarios have no matching flow file:',
    );
    for (const scenario of uncovered) {
      console.error(
        `  - ${scenario.id} (${scenario.title}): expected e2e/flows/${scenario.id}.yaml`,
      );
    }
    process.exit(1);
  }

  console.log(`Scenario coverage OK: ${scenarios.length} scenario(s), all covered.`);
}

main();
