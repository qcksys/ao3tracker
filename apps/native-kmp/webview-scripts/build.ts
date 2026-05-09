/**
 * Build script for webview scripts
 * Compiles TypeScript files to minified JavaScript bundles
 */

const isDevMode = process.argv.includes("--dev");

async function build() {
    const buildOptions = {
        target: "browser" as const,
        minify: !isDevMode,
        format: "iife" as const, // Output as IIFE for WebView injection (not ES module)
    };

    // Build ao3-tracking script
    const trackingResult = await Bun.build({
        ...buildOptions,
        entrypoints: ["./src/ao3-tracking.ts"],
        outdir: "./dist",
        naming: isDevMode ? "ao3-tracking.js" : "ao3-tracking.min.js",
    });

    if (!trackingResult.success) {
        console.error("Failed to build ao3-tracking.ts:");
        trackingResult.logs.forEach((log) => {
            console.error(log);
        });
        process.exit(1);
    }

    // Build scroll-restore script
    const scrollRestoreResult = await Bun.build({
        ...buildOptions,
        entrypoints: ["./src/scroll-restore.ts"],
        outdir: "./dist",
        naming: isDevMode ? "scroll-restore.js" : "scroll-restore.min.js",
    });

    if (!scrollRestoreResult.success) {
        console.error("Failed to build scroll-restore.ts:");
        scrollRestoreResult.logs.forEach((log) => {
            console.error(log);
        });
        process.exit(1);
    }

    console.log(
        `Built ${trackingResult.outputs.length + scrollRestoreResult.outputs.length} files:`,
    );
    [...trackingResult.outputs, ...scrollRestoreResult.outputs].forEach(
        (output) => {
            console.log(
                `  ${output.path} (${(output.size / 1024).toFixed(2)} KB)`,
            );
        },
    );
}

build();
