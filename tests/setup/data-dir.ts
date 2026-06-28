import os from "node:os";
import path from "node:path";

const workerId = process.env.VITEST_WORKER_ID ?? String(process.pid);
process.env.ORCHESTRABENCH_DATA_DIR = path.join(os.tmpdir(), "orchestrabench-test", workerId);
