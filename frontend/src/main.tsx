import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { WalletProvider } from "./wallet/WalletContext";
import { TruvoSDKProvider } from "./sdk/TruvoContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <TruvoSDKProvider>
          <App />
        </TruvoSDKProvider>
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>,
);
