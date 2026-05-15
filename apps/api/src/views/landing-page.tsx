import type { FC } from "hono/jsx";
import { PageLayout } from "~/views/page-layout";

const PlayStoreIcon: FC = () => (
    <svg
        class="w-6 h-6"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
    >
        <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.5,12.92 20.16,13.19L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
    </svg>
);

const ChromeIcon: FC = () => (
    <svg
        class="w-6 h-6"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
    >
        <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z" />
    </svg>
);

export const LandingPage: FC = () => (
    <PageLayout
        title="AO3 Tracker"
        description="Track your reading progress on Archive of Our Own"
    >
        <div class="min-h-screen flex items-center justify-center px-4">
            <div class="max-w-xl text-center">
                <h1 class="text-5xl font-bold mb-2 bg-linear-to-r from-[#9d4edd] to-[#c77dff] bg-clip-text text-transparent">
                    AO3 Tracker
                </h1>
                <p class="text-zinc-400 text-lg mb-8">
                    Track your reading progress on Archive of Our Own
                </p>
                <div class="flex flex-col items-center gap-4">
                    <span class="flex items-center justify-center gap-3 w-72 py-4 px-8 rounded-xl font-medium text-white opacity-60 cursor-not-allowed bg-linear-to-br from-[#34a853] to-[#1e8e3e]">
                        <PlayStoreIcon />
                        Google Play – Coming Soon
                    </span>
                    <span class="flex items-center justify-center gap-3 w-72 py-4 px-8 rounded-xl font-medium text-white opacity-60 cursor-not-allowed bg-linear-to-br from-[#4285f4] to-[#1a73e8]">
                        <ChromeIcon />
                        Chrome Extension – Coming Soon
                    </span>
                </div>
                <footer class="mt-12 text-sm text-zinc-500">
                    <p>
                        Made by{" "}
                        <a
                            href="https://qcksys.com"
                            class="text-[#9d4edd] hover:underline"
                        >
                            qcksys
                        </a>
                    </p>
                </footer>
            </div>
        </div>
    </PageLayout>
);
