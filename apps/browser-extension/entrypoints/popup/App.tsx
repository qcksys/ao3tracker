import { HashRouter, NavLink, Route, Routes } from "react-router";
import AuthLayout from "~popup/layouts/AuthLayout.tsx";
import Home from "~popup/pages/Home.tsx";
import Lists from "~popup/pages/Lists.tsx";
import Settings from "~popup/pages/Settings.tsx";
import Tracker from "~popup/pages/Tracker.tsx";

function App() {
  return (
    <div className="flex h-full w-full flex-col">
      <HashRouter>
        <div className="h-full overflow-y-auto border border-solid p-4 [&>*]:h-full [&>*]:overflow-y-auto">
          <Routes>
            <Route index element={<Tracker />} />
            <Route path="lists" element={<Lists />} />
            <Route path="settings" element={<Settings />} />

            <Route element={<AuthLayout />}>
              <Route path="login" element={<Home />} />
              <Route path="register" element={<Home />} />
            </Route>
          </Routes>
        </div>
        <footer className="flex h-20 w-full border border-solid">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `w-1/3 content-center border border-solid text-center text-xl ${isActive ? "bg-amber-500" : ""}`
            }
          >
            Tracker
          </NavLink>
          <NavLink
            to="lists"
            className={({ isActive }) =>
              `w-1/3 content-center border border-solid text-center text-xl ${isActive ? "bg-amber-500" : ""}`
            }
          >
            Lists
          </NavLink>
          <NavLink
            to="settings"
            className={({ isActive }) =>
              `w-1/3 content-center border border-solid text-center text-xl ${isActive ? "bg-amber-500" : ""}`
            }
          >
            Settings
          </NavLink>
        </footer>
      </HashRouter>
    </div>
  );
}

export default App;
