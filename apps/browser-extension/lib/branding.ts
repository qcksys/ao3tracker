export function extensionBranding(mode: string) {
  const beta = mode === "beta";
  const directory = beta ? "icon-beta" : "icon";
  return {
    name: beta ? "AO3 Tracker Beta" : "AO3 Tracker",
    icons: {
      16: `${directory}/16.png`,
      32: `${directory}/32.png`,
      48: `${directory}/48.png`,
      96: `${directory}/96.png`,
      128: `${directory}/128.png`,
    },
  } as const;
}
