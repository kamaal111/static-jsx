import { parseArgs } from 'node:util';

import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';

interface Benchmark {
  readonly name: string;
  /** How much JSX the case moves per run, used to report throughput. */
  readonly bytes: number;
  readonly run: () => void;
}

interface Measurement {
  readonly name: string;
  readonly bytes: number;
  readonly nanosecondsPerRun: number;
}

const WARMUP_RUNS = 50;

const NANOSECONDS_PER_SECOND = 1e9;

const NANOSECONDS_PER_MILLISECOND = 1_000_000;

const BYTES_PER_MEGABYTE = 1024 * 1024;

const DEFAULT_DURATION_MILLISECONDS = '1000';

const SMALL = '<card title="Hello" count={3} open>Some text</card>';

const LARGE = listDocument(2000);

const DEEP = `${'<a>'.repeat(1000)}leaf${'</a>'.repeat(1000)}`;

const LARGE_TREE = parse(LARGE);

const PRINTED_LARGE = stringify(LARGE_TREE);

function listDocument(items: number): string {
  const rows = Array.from(
    { length: items },
    (_unused, index) => `    <li id="item-${index}" index={${index}}>Item ${index}</li>`,
  );

  return `<page title="Docs">\n  <ul>\n${rows.join('\n')}\n  </ul>\n</page>`;
}

const BENCHMARKS: Benchmark[] = [
  { name: 'parse a small element', bytes: SMALL.length, run: () => void parse(SMALL) },
  { name: 'parse 2000 list items', bytes: LARGE.length, run: () => void parse(LARGE) },
  { name: 'parse a tree 1000 levels deep', bytes: DEEP.length, run: () => void parse(DEEP) },
  { name: 'print 2000 list items', bytes: PRINTED_LARGE.length, run: () => void stringify(LARGE_TREE) },
];

/** Runs one case for the given budget and reports how long a single run took. */
function measure(benchmark: Benchmark, durationNanoseconds: bigint): Measurement {
  for (let run = 0; run < WARMUP_RUNS; run += 1) {
    benchmark.run();
  }

  const startedAt = process.hrtime.bigint();
  let runs = 0;

  while (process.hrtime.bigint() - startedAt < durationNanoseconds) {
    benchmark.run();
    runs += 1;
  }

  const elapsed = Number(process.hrtime.bigint() - startedAt);

  return { name: benchmark.name, bytes: benchmark.bytes, nanosecondsPerRun: elapsed / runs };
}

function tableRow(measurement: Measurement): string {
  const perSecond = NANOSECONDS_PER_SECOND / measurement.nanosecondsPerRun;
  const megabytesPerSecond = (perSecond * measurement.bytes) / BYTES_PER_MEGABYTE;

  return [
    measurement.name.padEnd(30),
    `${Math.round(perSecond).toLocaleString('en-US').padStart(12)} ops/s`,
    `${megabytesPerSecond.toFixed(1).padStart(8)} MB/s`,
  ].join('  ');
}

const { values } = parseArgs({
  options: {
    json: { type: 'boolean', default: false },
    duration: { type: 'string', default: DEFAULT_DURATION_MILLISECONDS },
  },
});

const budget = BigInt(Number(values.duration) * NANOSECONDS_PER_MILLISECOND);

const measurements = BENCHMARKS.map(benchmark => measure(benchmark, budget));

if (values.json) {
  console.log(JSON.stringify({ node: process.version, measurements }));
} else {
  console.log(`node ${process.version}\n`);

  for (const measurement of measurements) {
    console.log(tableRow(measurement));
  }
}
