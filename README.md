# Dutch Touch
**A cross-platform desktop wrapper for the Dutchie POS and Backoffice, built with Tauri. This application replaces the legacy AutoHotkey script by running the web interfaces in native WebViews making a seamless wrapper around Dutchie.**

## Hotkey Mapping
### These shortcuts only fire when actively focused inside the application window.
`Ctrl + Tab` Toggles focus between the POS and Backoffice windows.

**`Alt + M` (Select Patient / Move Vault Item)**

**POS:** Clicks the first available Order Card.
**Backoffice:** Automates the Vault-to-Sales-Floor transfer. Finds the Vault row, opens the move drawer, selects Sales Floor, and focuses the quantity input.

**`Alt + Space` (Release > Confirm / Finalize Move)**

**POS:** Two-step confirmation to leave a cart. Clicks 'Release', then clicks 'Confirm'.  
**Backoffice:** Submits the move inventory modal.

**`Alt + B` (Search)**

**POS:** Focuses the "Find guest..." search bar.  
**Backoffice:** Highlights the search bar on 'Catalog' and 'Inventory' pages.

**`Alt + C` (Cancel / Close)**

**POS:** Dismisses *most* active modals. 

**`Alt + Q` (Navigation)**

**POS:** Clicks the main sidebar logo link (Takes you to POS Homepage).  
**Backoffice:** Clicks the logi link (Takes you to Backoffice Homepage).

## Known Issues
* **React DOM Volatility:** Because Dutchie is an SPA, hard navigations or aggressive DOM redraws by React can occasionally wipe out injected floating buttons or listeners. Diagnostic tripwires are in place, but the app may need to be closed and re-opened if it behaves erratically.

* **Brittle Selectors:** The Backoffice lacks comprehensive data-testid attributes. Several macros rely on DOM array indexing or fuzzy text matching, which will break if Dutchie pushes a major UI layout update.

## Roadmap
**PMP Workflow Integration:** Implement cross-window orchestration to automate Prescription Monitoring Program checks.  
    <div style="padding-left: 30px;">
    - Spawn a dedicated PMP WebView.  
    - Automate data entry for patient searches.  
    - Intercept the resulting CSV download using Tauri's fs API to prevent saving to the user's public Downloads folder.  
    - Process the CSV data natively in Rust.  
    - Pass a result payload back to the POS window to auto-fill the transaction reference.  
    </div>

**store specific room names for backoffice alt+m**


