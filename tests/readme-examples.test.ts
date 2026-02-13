// Verifies that code examples in README.md produce their documented output.
// Uses HTML comment markers in README to identify testable code and expected output blocks.

import * as fs from 'node:fs';
import { rmSync } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import * as nanalogue from '../index';

const README_PATH = path.resolve('README.md');

// Regex patterns for extracting marked blocks from README
// Matches: <!-- TEST CODE: START marker_name --> or <!-- TEST CODE: NOOUTPUT marker_name -->
const _MARKER = '([a-zA-Z0-9_]+)';
const CODE_START_RE = new RegExp(
  `<!--\\s*TEST CODE:\\s*(START|NOOUTPUT)\\s+${_MARKER}\\s*-->`,
);
const CODE_END_RE = new RegExp(
  `<!--\\s*TEST CODE:\\s*END\\s+${_MARKER}\\s*-->`,
);
const OUTPUT_START_RE = new RegExp(
  `<!--\\s*TEST OUTPUT:\\s*START\\s+${_MARKER}\\s*-->`,
);
const OUTPUT_END_RE = new RegExp(
  `<!--\\s*TEST OUTPUT:\\s*END\\s+${_MARKER}\\s*-->`,
);

// Matches markdown code fences like ```typescript, ```text, ```json, etc.
const FENCE_RE = /^```\w*\s*$/;

function stripFences(block: string): string {
  const lines = block.trim().split('\n');
  if (lines.length > 0 && FENCE_RE.test(lines[0])) {
    lines.shift();
  }
  if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
    lines.pop();
  }
  return lines.join('\n');
}

function normalize(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

interface TestCase {
  marker: string;
  code: string;
  expectedOutput: string | null;
}

function parseReadmeExamples(): TestCase[] {
  const readmeText = fs.readFileSync(README_PATH, 'utf-8');
  const lines = readmeText.split('\n');

  const codeBlocks: Record<string, { code: string; hasOutput: boolean }> = {};
  const outputBlocks: Record<string, string> = {};

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check for code block start
    const codeMatch = CODE_START_RE.exec(line);
    if (codeMatch) {
      const blockType = codeMatch[1]; // START or NOOUTPUT
      const marker = codeMatch[2];
      const hasOutput = blockType === 'START';
      i++;
      const blockLines: string[] = [];
      while (i < lines.length) {
        const endMatch = CODE_END_RE.exec(lines[i]);
        if (endMatch && endMatch[1] === marker) {
          break;
        }
        blockLines.push(lines[i]);
        i++;
      }
      if (i >= lines.length) {
        throw new Error(
          `TEST CODE: START/NOOUTPUT '${marker}' has no matching END`,
        );
      }
      if (marker in codeBlocks) {
        throw new Error(`Duplicate TEST CODE marker '${marker}'`);
      }
      codeBlocks[marker] = {
        code: stripFences(blockLines.join('\n')),
        hasOutput,
      };
      i++;
      continue;
    }

    // Check for output block start
    const outputMatch = OUTPUT_START_RE.exec(line);
    if (outputMatch) {
      const marker = outputMatch[1];
      i++;
      const blockLines: string[] = [];
      while (i < lines.length) {
        const endMatch = OUTPUT_END_RE.exec(lines[i]);
        if (endMatch && endMatch[1] === marker) {
          break;
        }
        blockLines.push(lines[i]);
        i++;
      }
      if (i >= lines.length) {
        throw new Error(`TEST OUTPUT: START '${marker}' has no matching END`);
      }
      if (marker in outputBlocks) {
        throw new Error(`Duplicate TEST OUTPUT marker '${marker}'`);
      }
      outputBlocks[marker] = stripFences(blockLines.join('\n'));
      i++;
      continue;
    }

    i++;
  }

  // Validate: every code block with hasOutput=true must have an output block
  for (const [marker, { hasOutput }] of Object.entries(codeBlocks)) {
    if (hasOutput && !(marker in outputBlocks)) {
      throw new Error(
        `TEST CODE '${marker}' expects output but no TEST OUTPUT block found`,
      );
    }
  }

  // Validate: every output block must have a code block
  for (const marker of Object.keys(outputBlocks)) {
    if (!(marker in codeBlocks)) {
      throw new Error(
        `TEST OUTPUT '${marker}' has no matching TEST CODE block`,
      );
    }
  }

  if (Object.keys(codeBlocks).length === 0) {
    throw new Error('No TEST CODE markers found in README.md');
  }

  // Build test cases: (marker, code, expected_output_or_null)
  return Object.entries(codeBlocks).map(([marker, { code, hasOutput }]) => ({
    marker,
    code,
    expectedOutput: hasOutput ? (outputBlocks[marker] ?? null) : null,
  }));
}

/**
 * Strip import statements from code extracted from the README.
 * The nanalogue functions are provided via the `nanalogue` parameter
 * in the generated Function, so imports are not needed at runtime.
 */
function transformCode(code: string): string {
  return code
    .split('\n')
    .filter((line) => !line.match(/^\s*import\s/))
    .join('\n');
}

/**
 * Execute a code block extracted from the README, capturing console.log output.
 * The code is wrapped in an async IIFE with nanalogue exports destructured
 * from the module passed as a parameter, and console.log replaced with a mock
 * that captures output for comparison against expected README output.
 */
async function executeCode(code: string): Promise<string> {
  const transformed = transformCode(code);
  const captured: string[] = [];
  const mockConsole = {
    log: (...args: unknown[]) => {
      const parts = args.map((arg) =>
        typeof arg === 'string' ? arg : JSON.stringify(arg),
      );
      captured.push(parts.join(' '));
    },
  };

  // Build an async function with nanalogue exports and mock console available.
  // The destructuring mirrors what the import statements in the README would provide.
  const asyncFn = new Function(
    'nanalogue',
    'console',
    `
    const { peek, readInfo, bamMods, windowReads, seqTable, simulateModBam } = nanalogue;
    return (async () => {
      ${transformed}
    })();
    `,
  );

  await asyncFn(nanalogue, mockConsole);
  return captured.join('\n');
}

// Parse at module level so test cases are available for the describe block
const TEST_CASES = parseReadmeExamples();

describe('README examples', () => {
  for (const { marker, code, expectedOutput } of TEST_CASES) {
    const hasOutput = expectedOutput !== null;
    const testType = hasOutput ? 'START' : 'NOOUTPUT';
    it(`${marker} (${testType}) produces documented output`, async () => {
      console.log(`Running README example: ${marker} (${testType})`);
      try {
        const actual = await executeCode(code);

        if (expectedOutput !== null) {
          const actualNorm = normalize(actual);
          const expectedNorm = normalize(expectedOutput);

          // Try JSON deep comparison first to handle key ordering differences
          // between NAPI-RS native objects and the README's documented order.
          // Falls back to exact string comparison for non-JSON output (e.g. TSV).
          let actualJson: unknown = null;
          let expectedJson: unknown = null;
          try {
            actualJson = JSON.parse(actualNorm);
            expectedJson = JSON.parse(expectedNorm);
          } catch {
            // Not valid JSON, will use string comparison
          }

          if (actualJson !== null && expectedJson !== null) {
            expect(actualJson).toEqual(expectedJson);
          } else {
            expect(actualNorm).toBe(expectedNorm);
          }
        }
      } finally {
        // Clean up any files that NOOUTPUT examples may have created
        // (e.g. simulateModBam writes output.bam and output.fasta)
        if (expectedOutput === null) {
          for (const file of ['output.bam', 'output.bam.bai', 'output.fasta']) {
            rmSync(file, { force: true });
          }
        }
      }
    });
  }
});
