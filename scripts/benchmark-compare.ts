import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import nodeUtils from 'node:util';

interface Measurement {
  readonly name: string;
  readonly bytes: number;
  readonly nanosecondsPerRun: number;
}

interface BenchmarkReport {
  readonly node: string;
  readonly measurements: Measurement[];
}

/** Every operations-per-second sample taken for one case, on either side of the comparison. */
interface Samples {
  readonly base: number[];
  readonly head: number[];
}

const NANOSECONDS_PER_SECOND = 1e9;

const BENCHMARK_SCRIPT = 'scripts/benchmark.ts';

/**
 * Runs one side's benchmark in its own process. Returns nothing when that side cannot be measured,
 * which is what happens when the base revision predates a case or an API this run depends on.
 */
function runBenchmark(scriptPath: string, durationMilliseconds: number): BenchmarkReport | undefined {
  try {
    const stdout = childProcess.execFileSync(
      process.execPath,
      [scriptPath, '--json', '--duration', String(durationMilliseconds)],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );

    const report: BenchmarkReport = JSON.parse(stdout);

    return report;
  } catch {
    return undefined;
  }
}

function median(values: number[]): number {
  const sorted = values.toSorted((left, right) => left - right);

  return sorted[Math.floor((sorted.length - 1) / 2)] ?? Number.NaN;
}

function operationsPerSecond(measurement: Measurement): number {
  return NANOSECONDS_PER_SECOND / measurement.nanosecondsPerRun;
}

function formatRate(perSecond: number): string {
  return `${Math.round(perSecond).toLocaleString('en-US')} ops/s`;
}

/**
 * Reports a change only when the two sides' sample ranges are fully apart. Overlapping ranges mean
 * the runner moved more than the code did, and calling that a regression would only cry wolf.
 */
function formatChange(samples: Samples): string {
  if (samples.base.length === 0) {
    return 'no base measurement';
  }

  const overlapping =
    Math.max(Math.min(...samples.base), Math.min(...samples.head)) <=
    Math.min(Math.max(...samples.base), Math.max(...samples.head));

  if (overlapping) {
    return '—';
  }

  const change = (median(samples.head) / median(samples.base) - 1) * 100;

  return change < 0 ? `🔺 ${Math.abs(change).toFixed(0)}% slower` : `🟢 ${change.toFixed(0)}% faster`;
}

function buildReport(order: string[], samples: Map<string, Samples>, passes: number, duration: number): string {
  const rows = order.map(name => {
    const caseSamples = samples.get(name) ?? { base: [], head: [] };
    const base = caseSamples.base.length === 0 ? '—' : formatRate(median(caseSamples.base));

    return `| ${name} | ${base} | ${formatRate(median(caseSamples.head))} | ${formatChange(caseSamples)} |`;
  });

  return [
    '### Benchmark',
    '',
    '| Benchmark | Base | This PR | Change |',
    '| --- | ---: | ---: | :--- |',
    ...rows,
    '',
    `<sub>Median of ${passes} interleaved passes on this runner, ${duration} ms per case per pass. ` +
      '“—” means the two sample ranges overlap, so the difference is runner noise rather than code. ' +
      'This comment never fails the build.</sub>',
    '',
  ].join('\n');
}

const { values } = nodeUtils.parseArgs({
  options: {
    base: { type: 'string' },
    out: { type: 'string', default: 'benchmark-report.md' },
    passes: { type: 'string', default: '3' },
    duration: { type: 'string', default: '300' },
  },
});

const outputPath = values.out ?? 'benchmark-report.md';

const passes = Number(values.passes);

const duration = Number(values.duration);

const headScript = BENCHMARK_SCRIPT;

const baseScript = values.base === undefined ? undefined : path.join(values.base, BENCHMARK_SCRIPT);

const samples = new Map<string, Samples>();

const order: string[] = [];

function record(side: 'base' | 'head', report: BenchmarkReport | undefined): void {
  if (report === undefined) {
    return;
  }

  for (const measurement of report.measurements) {
    const existing = samples.get(measurement.name) ?? { base: [], head: [] };
    existing[side].push(operationsPerSecond(measurement));
    samples.set(measurement.name, existing);

    if (side === 'head' && !order.includes(measurement.name)) {
      order.push(measurement.name);
    }
  }
}

for (let pass = 1; pass <= passes; pass += 1) {
  console.log(`pass ${pass} of ${passes}`);
  record('base', baseScript === undefined ? undefined : runBenchmark(baseScript, duration));
  record('head', runBenchmark(headScript, duration));
}

const report =
  order.length === 0
    ? '### Benchmark\n\nThe benchmark could not be run for this pull request.\n'
    : buildReport(order, samples, passes, duration);

await fs.writeFile(outputPath, report, 'utf8');

console.log(`\n${report}`);
