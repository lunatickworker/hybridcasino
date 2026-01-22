
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./index.css";
  import { initFavicon } from "./utils/favicon";

  // Favicon 초기화
  initFavicon();

  createRoot(document.getElementById("root")!).render(<App />);
  