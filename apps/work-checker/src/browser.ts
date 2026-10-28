import { readFile } from "node:fs/promises";
import {
  type BrowserContext,
  chromium,
  type Page,
  type Download as PlaywrightDownload,
  type Response,
} from "patchright";

const NAVIGATION_TIMEOUT_MS = 60_000;
const CHALLENGE_TIMEOUT_MS = 45_000;
const CHALLENGE_TITLE = "Just a moment...";

export interface PageLoad {
  status: number;
  finalUrl: string;
  html: string;
  /** A Cloudflare challenge was still showing when the wait ran out */
  challenged: boolean;
}

export interface Download {
  status: number;
  /** Chrome saved the response as a file (an attachment) rather than rendering it */
  attachment: boolean;
  contentType: string;
  body: Uint8Array<ArrayBuffer>;
}

export interface Ao3Browser {
  load(url: string): Promise<PageLoad>;
  download(url: string): Promise<Download>;
  close(): Promise<void>;
}

async function isChallenge(page: Page, response: Response | null): Promise<boolean> {
  if (response?.headers()["cf-mitigated"] === "challenge") return true;
  return (await page.title()) === CHALLENGE_TITLE;
}

/** The challenge solves itself in a real browser and then reloads the page */
async function waitForChallenge(page: Page): Promise<void> {
  await page
    .waitForFunction((title) => document.title !== title, CHALLENGE_TITLE, {
      timeout: CHALLENGE_TIMEOUT_MS,
    })
    .catch(() => {});
}

function isDownloadStart(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Download is starting");
}

async function saveDownload(download: PlaywrightDownload): Promise<Download> {
  const body = new Uint8Array(await readFile(await download.path()));
  await download.delete();
  return { status: 200, attachment: true, contentType: "", body };
}

/**
 * Launch installed Google Chrome through Patchright, which removes Playwright's automation
 * signals, with a window (under Xvfb in the container) and a persistent profile that keeps
 * Cloudflare's clearance cookie between runs. Patchright's guidance: real Chrome, headful, no
 * viewport, user agent or header overrides.
 */
export async function launchAo3Browser(profileDir: string): Promise<Ao3Browser> {
  const context: BrowserContext = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    viewport: null,
  });
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    async load(url) {
      let response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      let challenged = await isChallenge(page, response);
      if (challenged) {
        // Load again once it clears, so the status is the page's own, not the challenge's 403.
        await waitForChallenge(page);
        response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: NAVIGATION_TIMEOUT_MS,
        });
        challenged = await isChallenge(page, response);
      }
      return {
        status: response?.status() ?? 0,
        finalUrl: page.url(),
        html: await page.content(),
        challenged,
      };
    },

    /**
     * Download through Chrome itself: AO3's download host challenges any other client, even
     * one carrying the profile's cookies.
     */
    async download(url) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const downloadEvent = page.waitForEvent("download", {
          timeout: NAVIGATION_TIMEOUT_MS + CHALLENGE_TIMEOUT_MS,
        });
        // Not every outcome below awaits the event; keep it from rejecting unhandled.
        downloadEvent.catch(() => {});
        let response: Response | null = null;
        try {
          response = await page.goto(url, { timeout: NAVIGATION_TIMEOUT_MS });
        } catch (error) {
          if (!isDownloadStart(error)) throw error;
        }
        if (!response) return saveDownload(await downloadEvent);
        if (!(await isChallenge(page, response))) {
          // Rendered rather than downloaded: an error page, or a file served inline.
          return {
            status: response.status(),
            attachment: false,
            contentType: response.headers()["content-type"] ?? "",
            body: new Uint8Array(await response.body()),
          };
        }
        // A cleared challenge reloads the URL. An attachment then arrives as this attempt's
        // download; a file served inline replaces the page, so request it again.
        const cleared = await Promise.race([
          downloadEvent,
          waitForChallenge(page).then(() => null),
        ]);
        if (cleared) return saveDownload(cleared);
      }
      throw new Error(`Cloudflare challenge did not clear for ${url}`);
    },

    close: () => context.close(),
  };
}
