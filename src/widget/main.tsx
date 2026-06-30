import React, { StrictMode } from "react";

import { createRoot } from "react-dom/client";
import { PlannerWidget } from "./planner-widget.js";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <PlannerWidget />
    </StrictMode>
  );
}
