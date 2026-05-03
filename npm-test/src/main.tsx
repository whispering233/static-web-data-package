import { createRoot } from "react-dom/client";
import "@whispering233/static-web-data-react/styles.css";
import "./style.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(<App />);
