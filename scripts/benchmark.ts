import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';

interface Benchmark {
  readonly name: string;
  readonly bytes: number;
  readonly run: () => void;
}

const WARMUP_RUNS = 50;

const MEASURE_NANOSECONDS = 1_000_000_000n;

const NANOSECONDS_PER_SECOND = 1e9;

const BYTES_PER_MEGABYTE = 1024 * 1024;

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
  { name: 'parse  small element', bytes: SMALL.length, run: () => void parse(SMALL) },
  { name: 'parse  2000 list items', bytes: LARGE.length, run: () => void parse(LARGE) },
  { name: 'parse  1000 levels deep', bytes: DEEP.length, run: () => void parse(DEEP) },
  { name: 'print  2000 list items', bytes: PRINTED_LARGE.length, run: () => void stringify(LARGE_TREE) },
];

function report(benchmark: Benchmark): string {
  for (let run = 0; run < WARMUP_RUNS; run += 1) {
    benchmark.run();
  }

  const startedAt = process.hrtime.bigint();
  let runs = 0;

  while (process.hrtime.bigint() - startedAt < MEASURE_NANOSECONDS) {
    benchmark.run();
    runs += 1;
  }

  const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_SECOND;

  const perSecond = runs / elapsedSeconds;
  const megabytesPerSecond = (perSecond * benchmark.bytes) / BYTES_PER_MEGABYTE;

  return [
    benchmark.name.padEnd(24),
    `${Math.round(perSecond).toLocaleString('en-US').padStart(12)} ops/s`,
    `${megabytesPerSecond.toFixed(1).padStart(8)} MB/s`,
  ].join('  ');
}

console.log(`node ${process.version}\n`);

for (const benchmark of BENCHMARKS) {
  console.log(report(benchmark));
}
