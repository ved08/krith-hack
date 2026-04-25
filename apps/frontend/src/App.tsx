import { Route, Routes } from "react-router-dom";
import { AuthProvider, RequireTeacher } from "./lib/auth.js";
import { ChatPage } from "./pages/Chat.js";
import { HomePage } from "./pages/Home.js";
import { KioskPage } from "./pages/Kiosk.js";
import { SimulationPage } from "./pages/Simulation.js";
import { StudentPage } from "./pages/Student.js";
import { TeacherDashboardPage } from "./pages/TeacherDashboard.js";
import { TeacherLoginPage } from "./pages/TeacherLogin.js";

export function App() {
  return (
    <AuthProvider>
      <div className="min-h-full font-sans text-slate-900 antialiased">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/kiosk" element={<KioskPage />} />
          <Route path="/student" element={<StudentPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/teacher/login" element={<TeacherLoginPage />} />
          <Route
            path="/teacher"
            element={
              <RequireTeacher>
                <TeacherDashboardPage />
              </RequireTeacher>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-3xl font-semibold">Not found</h1>
      <p className="mt-2 text-slate-600">That route doesn't exist.</p>
      <a href="/" className="mt-4 inline-block text-sm font-medium text-slate-900 underline">
        Go home
      </a>
    </div>
  );
}
