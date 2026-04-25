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
      <div className="min-h-screen font-sans text-slate-900 antialiased bg-paper-50">
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
      <div className="text-center space-y-6 max-w-md">
        <div className="font-display text-[10rem] leading-none italic text-slate-900">
          404
        </div>
        <div>
          <h1 className="font-display text-4xl text-slate-900 mb-3">
            Page <em className="text-primary-600">not found</em>
          </h1>
          <p className="text-base leading-7 text-slate-600 mb-8 mx-auto">
            The path you followed doesn't lead anywhere on this campus.
            Let's get you back to the entrance.
          </p>
        </div>
        <a
          href="/"
          className="inline-flex items-center justify-center px-7 py-3 rounded-full bg-slate-900 text-paper-50 font-medium text-sm tracking-wide hover:bg-slate-800 active:scale-[0.98] transition-all duration-300"
        >
          ← Back to home
        </a>
      </div>
    </div>
  );
}
