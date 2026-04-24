import { Route, Routes } from "react-router-dom";
import { ChatPage } from "./pages/Chat.js";
import { HomePage } from "./pages/Home.js";
import { KioskPage } from "./pages/Kiosk.js";

export function App() {
  return (
    <div className="min-h-full font-sans text-slate-900 antialiased">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
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
