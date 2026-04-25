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
      <div className="min-h-screen font-sans text-slate-900 antialiased bg-white">
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
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-center space-y-6">
        <div className="text-8xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
          404
        </div>
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-3">
            Page not found
          </h1>
          <p className="text-xl text-slate-600 mb-8 max-w-md mx-auto">
            Oops! It looks like you've navigated to a page that doesn't exist.
            Let's get you back on track.
          </p>
        </div>
        <a
          href="/"
          className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-gradient-blue text-white font-bold text-lg shadow-glow hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-300"
        >
          ← Go back home
        </a>
      </div>
    </div>
  );
}
