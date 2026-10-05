import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function validateAndroidRelease({ channel, tracks, status }) {
  if (!["production", "beta"].includes(channel)) {
    throw new Error("Release channel must be production or beta.");
  }
  if (!["completed", "draft"].includes(status)) {
    throw new Error("Release status must be completed or draft.");
  }
  if (!["internal", "alpha", "internal,alpha"].includes(tracks)) {
    throw new Error("Release tracks must be internal, alpha, or internal,alpha.");
  }
  if (channel === "beta" && tracks !== "internal") {
    throw new Error("The beta app only releases to internal testing.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    validateAndroidRelease({
      channel: process.env.RELEASE_CHANNEL,
      tracks: process.env.RELEASE_TRACKS,
      status: process.env.RELEASE_STATUS,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
