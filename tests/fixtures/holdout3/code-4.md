```yaml
- name: job-0
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=1/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-1
  runs-on: ubuntu-latest
  timeout-minutes: 11
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=2/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-2
  runs-on: ubuntu-latest
  timeout-minutes: 12
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=3/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-3
  runs-on: ubuntu-latest
  timeout-minutes: 13
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=4/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-4
  runs-on: ubuntu-latest
  timeout-minutes: 14
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=5/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-5
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=6/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-6
  runs-on: ubuntu-latest
  timeout-minutes: 16
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=7/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-7
  runs-on: ubuntu-latest
  timeout-minutes: 17
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=8/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-8
  runs-on: ubuntu-latest
  timeout-minutes: 18
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=9/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-9
  runs-on: ubuntu-latest
  timeout-minutes: 19
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=10/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-10
  runs-on: ubuntu-latest
  timeout-minutes: 20
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=11/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
- name: job-11
  runs-on: ubuntu-latest
  timeout-minutes: 21
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install --frozen-lockfile && pnpm test -- --shard=12/12
  env:
    NODE_OPTIONS: --max-old-space-size=4096
```
