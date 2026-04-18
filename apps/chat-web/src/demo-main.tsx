import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DemoApp } from "./demo-app";
import "./index.css";

const app = document.getElementById("app");
if (!app) throw new Error("App root not found");

createRoot(app).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>
);
