/**
 * Truvo frontend — application shell.
 *
 * Scaffold only: routes to three placeholder views (Requester, Worker,
 * Admin) and shows the Freighter wallet widget in the nav bar. Task/escrow
 * UI will be built on later branches.
 */

import { NavLink, Route, Routes } from "react-router-dom";
import { ConnectButton } from "./wallet/ConnectButton";
import Requester from "./views/Requester";
import Worker from "./views/Worker";
import Admin from "./views/Admin";

export default function App() {
  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">
          <h1>
            Truvo <span className="brand-badge">testnet</span>
          </h1>
        </div>
        <div className="nav-links">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Requester
          </NavLink>
          <NavLink
            to="/worker"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Worker
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Admin
          </NavLink>
        </div>
        <ConnectButton />
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Requester />} />
          <Route path="/worker" element={<Worker />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Requester />} />
        </Routes>
      </main>
    </div>
  );
}
