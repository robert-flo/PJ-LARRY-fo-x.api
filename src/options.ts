import type { OutputMode } from "./output/format.ts";
import type { ProviderChoice } from "./providers/index.ts";

export interface CliOptions {
  mode: OutputMode;
  provider: ProviderChoice;
  since?: string; // raw --since value
  context?: string;
  lang?: string;
  maxPosts: number; // total read budget for `research`
  maxCost?: number; // USD guard; refuse if estimate exceeds
  limit: number; // per-call result cap for single reads
  queries: number; // portfolio size for `research`
  minFaves?: number;
  accounts?: string[];
  dryRun: boolean;
}
