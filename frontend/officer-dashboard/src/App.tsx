import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ComplaintQueue from "./pages/ComplaintQueue";
import ComplaintReview from "./pages/ComplaintReview";
import SpatialIntelligence from "./pages/SpatialIntelligence";
import InfrastructureHealth from "./pages/InfrastructureHealth";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import OfficerCopilot from "./pages/OfficerCopilot";
import OfficerProfile from "./pages/OfficerProfile";

function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isAuthenticated() {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get("token");
  if (urlToken) {
    localStorage.setItem("cp_officer_token", urlToken);
    window.history.replaceState({}, document.title, window.location.pathname);
    return isTokenValid(urlToken);
  }
  const stored = localStorage.getItem("cp_officer_token");
  if (!isTokenValid(stored)) {
    localStorage.removeItem("cp_officer_token");
    return false;
  }
  return true;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  return isAuthenticated() ? (
    children
  ) : (
    <Navigate to="/officer/login" replace />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/officer/login" element={<Login />} />

        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/officer" element={<Dashboard />} />
          <Route path="/officer/complaints" element={<ComplaintQueue />} />
          <Route path="/officer/complaints/:id" element={<ComplaintReview />} />
          <Route path="/officer/profile" element={<OfficerProfile />} />
          <Route
            path="/officer/map"
            element={<Navigate to="/officer/spatial-intelligence" replace />}
          />
          <Route
            path="/officer/spatial-intelligence"
            element={<SpatialIntelligence />}
          />
          <Route
            path="/officer/infrastructure-health"
            element={<InfrastructureHealth />}
          />
          <Route
            path="/officer/knowledge-graph"
            element={<KnowledgeGraph />}
          />
          <Route
            path="/officer/copilot"
            element={<OfficerCopilot />}
          />
        </Route>

        <Route path="*" element={<Navigate to="/officer" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
