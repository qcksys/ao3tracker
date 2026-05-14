import { BookmarkIcon, ListIcon, SettingsIcon } from "lucide-react";
import { HashRouter, NavLink, Route, Routes } from "react-router";

import { cn } from "@/lib/utils";
import { PopupStateProvider } from "~popup/lib/state";
import Lists from "~popup/pages/Lists";
import Login from "~popup/pages/Login";
import Register from "~popup/pages/Register";
import Settings from "~popup/pages/Settings";
import Tracker from "~popup/pages/Tracker";

const NAV_ITEMS = [
  { to: "/", label: "Tracker", icon: BookmarkIcon, end: true },
  { to: "/lists", label: "Favourites", icon: ListIcon, end: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
] as const;

function App() {
  return (
    <PopupStateProvider>
      <HashRouter>
        <div className="bg-background text-foreground flex h-full w-full flex-col">
          <main className="flex-1 overflow-y-auto p-4">
            <Routes>
              <Route index element={<Tracker />} />
              <Route path="lists" element={<Lists />} />
              <Route path="settings" element={<Settings />} />
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />
            </Routes>
          </main>
          <nav className="border-border flex border-t">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex w-1/3 flex-col items-center justify-center gap-1 py-2 text-xs",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </HashRouter>
    </PopupStateProvider>
  );
}

export default App;
