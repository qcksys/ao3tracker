import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { BookmarkIcon, BookOpenIcon, SearchIcon, ListIcon, SettingsIcon } from "lucide-react";
import Tracker from "~popup/pages/Tracker";
import Searches from "~popup/pages/Searches";
import "./store.css";

const scenes = {
  tracker: {
    number: "01",
    category: "READING PROGRESS",
    title: (
      <>
        Every story.
        <br />
        Right where
        <br />
        <em>you left it.</em>
      </>
    ),
    description: "Keep your chapter and reading position in sync across devices.",
    details: ["Automatically remembers your place", "Resume your reading on AO3"],
    component: Tracker,
    nav: "Tracker",
  },
  searches: {
    number: "02",
    category: "SAVED SEARCHES",
    title: (
      <>
        Find your next
        <br />
        favourite.
        <br />
        <em>Again.</em>
      </>
    ),
    description: "Save your AO3 filters once. Reopen the searches you love whenever you want.",
    details: ["Name, copy and organise searches", "Sync your saved searches across devices"],
    component: Searches,
    nav: "Searches",
  },
};
const scene = scenes[new URLSearchParams(location.search).get("scene")] ?? scenes.tracker;
const Screen = scene.component;
const navItems = [
  ["Tracker", BookmarkIcon],
  ["Works", BookOpenIcon],
  ["Searches", SearchIcon],
  ["Favourites", ListIcon],
  ["Settings", SettingsIcon],
];

createRoot(document.getElementById("root")).render(
  <MemoryRouter>
    <div className="store-art">
      <div className="paper-panel" />
      <div className="brand">
        <img src="/icon/128.png" alt="" />
        <span>AO3 Tracker</span>
        <span className="edition">FOR CHROME</span>
      </div>
      <section className="copy">
        <div className="eyebrow">
          <span>{scene.number} / 02</span>
          {scene.category}
        </div>
        <h1>{scene.title}</h1>
        <p className="description">{scene.description}</p>
        <ul className="details">
          {scene.details.map((detail) => (
            <li key={detail}>
              <span>↗</span>
              {detail}
            </li>
          ))}
        </ul>
      </section>
      <div className="popup-shell">
        <div className="popup bg-background text-foreground flex h-full w-full flex-col">
          <header className="border-border flex items-center gap-2 border-b px-4 py-2">
            <img src="/icon/48.png" alt="" width="36" height="36" className="rounded-lg" />
            <span className="text-sm font-semibold">AO3 Tracker</span>
          </header>
          <main className="flex-1 overflow-y-auto p-4">
            <Screen />
          </main>
          <nav className="border-border flex border-t">
            {navItems.map(([label, Icon]) => (
              <div
                key={label}
                className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs ${label === scene.nav ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="size-4" />
                {label}
              </div>
            ))}
          </nav>
        </div>
      </div>
      <div className="screen-caption">THE EXTENSION · EXAMPLE DATA</div>
      <footer>
        <span>Made for your next chapter.</span>
        <span>Independent of Archive of Our Own and the OTW.</span>
      </footer>
    </div>
  </MemoryRouter>,
);
