import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { addCollection } from "@iconify/react"
import type { IconifyJSON } from "@iconify/types"

import "./index.css"
import "@/shared/i18n/i18n"
import App from "./app/App"
import { AppProviders } from "./app/providers"

import("@iconify-json/vscode-icons/icons.json").then(({ default: data }) => {
  addCollection(data as IconifyJSON)
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <main data-ui-scroll-container>
        <App />
      </main>
    </AppProviders>
  </StrictMode>
)
