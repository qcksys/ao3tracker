import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
    resolve: { tsconfigPaths: true },
    test: {
        poolOptions: {
            workers: {
                wrangler: { configPath: "./wrangler.json" },
            },
        },
    },
});
