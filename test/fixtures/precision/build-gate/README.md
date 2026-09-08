# build-gate

CI entry point. `run.sh` is the test gate: it loops over `test/*.test.ts`
(non-recursive), while the real suite lives in `test/unit/`. The gate
passes green while silently never running a single unit test — a future
change that adds `test/*.test.ts` files or moves the suite will keep
publishing a green build on an untested tree.
