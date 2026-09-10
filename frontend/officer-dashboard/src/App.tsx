import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ComplaintQueue from "./pages/ComplaintQueue";
import ComplaintReview from "./pages/ComplaintReview";
import IssueMap from "./pages/IssueMap";

function isAuthenticated() {
  return Boolean(localStorage.getItem("cp_officer_token"));
}

function RequireAuth({ children }: { children: JSX.Element }) {
  return isAuthenticated() ? children : <Navigate to="/officer/login" replace />;
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
          <Route path="/officer/map" element={<IssueMap />} />
        </Route>

        <Route path="*" element={<Navigate to="/officer" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
