; Changelog
;
; Version 1.1.1 - chrome profile storage moved to appdata, readme updates
; Version 1.1.0 - Backoffice hotkeys for 'Restock from vault' workflow (ALT + M) (ALT + Space)
; Version 1.0.1 - Dynamic port assignment (9000 - 9900) from hashing username. Prevent collisions with multiple users on same machine.
; Version 1.0.0 - Initial Release 
;
#Requires AutoHotkey v2.0
#Include Chrome.ahk
ProcessSetPriority "High"

global targetUrl := "https://verano.pos.dutchie.com/guestlist"
global backofficeUrl := "https://verano.backoffice.dutchie.com/"

global profileDir := A_AppData "\DutchTouch\DutchieProfile"
if !DirExist(profileDir) {
	DirCreate(profileDir)
}


global browser := ""

global dutchiePage := ""
global backofficePage := ""

MonitorGui := Gui("+Resize +MinSize", "Dutch Touch 1.1.1")
StatusText := MonitorGui.Add("Text", "x1 y15 w300 Center vStatus", "Initializing...")
MonitorGui.Add("Text", "x15 y+20", "Manager PIN:")
global PinInput := MonitorGui.Add("Edit", "x+15 yp-3 w80 Password Number", "")
MonitorGui.Add("Button", "x+15 yp-1 w80 h24", "README").OnEvent("Click", ShowReadme)
MonitorGui.OnEvent("Close", (*) => ExitApp())
MonitorGui.Show("w300 h90 NoActivate")

ShowReadme(*) {
    helpText := "
(
============= GUESTLIST HOTKEYS =============
**ANYWHERE**
Alt + C`t`tClick Cancel & Close modals
Alt + Q`t`tClick the Dutchie logo (Home)

**HOME PAGE**
Alt + B`t`tFocus the 'Find guest...' search bar
Alt + M`t`tClick the first visible patient card
Alt + R`t`tRelease the first visible patient card

**INSIDE A CART**
Alt + I`t`tClick 'Add items', input PIN, ready to search
Alt + Space`tRelease & Confirm the cart

============ BACKOFFICE HOTKEYS ============
**INVENTORY PAGE**
Alt + T`t`tFocus the 'Search' field and select all text
Alt + Space`tClick 'Move' button

**WillyB ONLY**
Alt + M`t`tAfter searching for a metrc tag, prep a
`t`t  move from vault to Sales Floor
)"

MsgBox(helpText, "DutchTouch Key Bindings", "Iconi")
}

InitializeChrome()
SetTimer(MonitorConnection, 2000)

InitializeChrome() {
    global browser, profileDir, targetUrl, backofficeUrl
    
    userHash := 0
    Loop Parse, A_UserName
        userHash += Ord(A_LoopField)
    myPort := 9000 + Mod(userHash, 900) ; 9000 - 9900
    
    StatusText.Value := "Status: Connecting on Port " myPort "..."
    
    try {
        browser := Chrome.FindInstance("chrome.exe", myPort)
        
        if (!browser) {
            browser := Chrome([targetUrl, backofficeUrl], "", "", myPort, profileDir)
            Sleep(2000) 
        }
        
        StatusText.Value := "Status: Chrome connected. Searching..."
    } catch as err {
        StatusText.Value := "Status: Error - " err.Message
    }
}

; safe search function to bypass Chrome.ahk's bugged version
FindPageSafe(browserObj, urlSnippet) {
    try {
        pageList := browserObj.GetPageList()
        for pageInfo in pageList {
            if (pageInfo.Has("url") && InStr(pageInfo["url"], urlSnippet)) {
                if (pageInfo.Has("webSocketDebuggerUrl")) {
                    return Chrome.Page(pageInfo["webSocketDebuggerUrl"])
                }
            }
        }
    }
    return ""
}

MonitorConnection() {
    global browser, dutchiePage, backofficePage, targetUrl, backofficeUrl
    
    if (browser && !ProcessExist(browser.PID)) {
        browser := ""
        dutchiePage := ""
        backofficePage := ""
        StatusText.Value := "Status: Browser closed. Relaunching..."
    }

    if (!browser) {
        InitializeChrome()
        return
    }
    
    if (IsObject(dutchiePage)) {
        try {
            dutchiePage.Evaluate("1") 
        } catch {
            dutchiePage := ""
            MonitorGui.Opt("+AlwaysOnTop")
            MonitorGui.Show("NoActivate")
            MonitorGui.Opt("-AlwaysOnTop")
        }
    } else {
        dutchiePage := FindPageSafe(browser, targetUrl)
    }

    if (IsObject(backofficePage)) {
        try {
            backofficePage.Evaluate("1")
        } catch {
            backofficePage := ""
        }
    } else {
        backofficePage := FindPageSafe(browser, "verano.backoffice.dutchie.com")
    }

    if (browser) {
        strGuest := IsObject(dutchiePage) ? "Guestlist [ ✔️ ]" : "Guestlist [ ✖️ ]"
        strBack := IsObject(backofficePage) ? "Backoffice [ ✔️ ]" : "Backoffice [ ✖️ ]"
        StatusText.Value := strGuest "            " strBack
    }
}

IsTabActive(pageObj) {
    if !IsObject(pageObj)
        return false
    try {
        res := pageObj.Evaluate("document.visibilityState === 'visible'")
        return res.Has("value") ? res["value"] : false
    } catch {
        return false
    }
}

#HotIf IsTabActive(dutchiePage)

!c:: {
    js := "
    (
        (async function(){
            const f = (t) => Array.from(document.querySelectorAll('button,span,div')).find(i => i.innerText && i.innerText.trim() === t && i.offsetParent !== null);
            const btn1 = f('Cancel'); 
            if(btn1) { (btn1.closest('button') || btn1).click(); }
            
            await new Promise(r => setTimeout(r, 100));
            
            const btn2 = f('Close'); 
            if(btn2) { (btn2.closest('button') || btn2).click(); }
        })();
    )"
    try dutchiePage.Evaluate(js)
}

!b:: {
    js := "
    (
        (function(){
            const el = Array.from(document.querySelectorAll('input,textarea')).find(i => i.placeholder === 'Find guest...');
            if(el) { el.focus(); } else { alert('Field not found'); }
        })();
    )"
    try dutchiePage.Evaluate(js)
}

!Space:: {
    js := "
    (
        (function(){
            const f = (t) => {
                const e = Array.from(document.querySelectorAll('button,span,div')).find(b => b.innerText.trim() === t);
                if(e) e.click();
                return e;
            };
            if(f('Release')) { setTimeout(() => f('Confirm'), 100); }
        })();
    )"
    try dutchiePage.Evaluate(js)
}

!i:: {
    currentPin := PinInput.Value
    
    if (currentPin = "") {
        MsgBox("Please enter a Manager PIN in the monitor GUI first.", "Missing PIN", "Icon! 0x30")
        return
    }

    js := "
    (
        (function(){
            const sV = (e,v) => {
                const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                s.call(e, v);
                e.dispatchEvent(new Event('input', {bubbles:true}));
            };
            const fE = (t,x) => Array.from(document.querySelectorAll(t)).find(e => e.innerText?.trim() === x || e.placeholder === x || e.name === x || e.getAttribute('aria-label') === x);
            const bA = fE('button,span,div', 'Add items');
            
            if(bA) {
                bA.click();
                setTimeout(() => {
                    const pF = fE('input', 'Manager PIN');
                    if(pF) {
                        sV(pF, 'INSERT_PIN_HERE');
                        setTimeout(() => {
                            const bC = fE('button,span,div', 'Continue');
                            if(bC) bC.click();
                            setTimeout(() => {
                                const sF = fE('input', 'Product search...');
                                if(sF) sF.focus();
                            }, 250);
                        }, 250);
                    }
                }, 250);
            }
        })();
    )"
    
    ; Safely inject the PIN without breaking the continuation syntax
    js := StrReplace(js, "INSERT_PIN_HERE", currentPin)
    try dutchiePage.Evaluate(js)
}

!m:: {
    js := "
    (
        (function(){
            const card = document.querySelector(``div[class^='OrderKanbanCard']``);
            if(card) { card.click(); }
        })();
    )"
    try dutchiePage.Evaluate(js)
}

!q:: {
    js := "
    (
        (function(){
            const el = document.querySelector(``[data-testid='navigation-sidebar-logo-link']``);
            if(el){
                const target = el.closest('div') || el.closest('a') || el;
                target.click();
            }
        })();
    )"
    try dutchiePage.Evaluate(js)
}

!r:: {
    js := "
    (
        (async function(){
            const f = (s) => document.querySelector(s);
            const anchor = f(``[data-testid='guest-card_overflow_menu_anchor']``);
            if (anchor) {
                anchor.click();
                await new Promise(r => setTimeout(r, 100));
                const release = f(``[data-testid='guest-card_overflow_menu_menu-option_Release']``);
                if (release) {
                    release.click();
                    await new Promise(r => setTimeout(r, 100));
                    const confirm = f(``[data-testid='confirmation-popup_confirm-button_confirm']``);
                    if (confirm) confirm.click();
                }
            }
        })();
    )"
    try dutchiePage.Evaluate(js)
}

; ==========================================
; --- BACKOFFICE HOTKEYS ---
; ==========================================
#HotIf IsTabActive(backofficePage)

!t:: {
    js := "
    (
        (function(){
            const el = Array.from(document.querySelectorAll('input,textarea')).filter(i => i.placeholder && i.placeholder.includes('Search')).pop();
            if(el) { el.focus(); } else { alert('Field not found'); }
        })();
    )"
    try backofficePage.Evaluate(js)
    Sleep 100
    SendInput "^a"
}

!Space:: {
    js := "
    (
        (function(){
            const btn = document.querySelector(``[data-testid='move-inventory-modal-move-button']``);
            if (btn) btn.click();
        })();
    )"
    try backofficePage.Evaluate(js)
}

!m:: {
    js1 := "
    (
        (async function(){
            const f = (s) => document.querySelector(s);
            const fA = (s) => Array.from(document.querySelectorAll(s));
            
			const RoomCol = Array.from(document.querySelectorAll('[data-field="room.roomNo"]'));
			const vaultCell = RoomCol.find(el => el.outerText.trim() === 'Vault');
            if (!vaultCell) { console.log('Vault room not found'); return; }
            
            const row = vaultCell.closest('[data-rowindex]');
            if (!row) return;
            const rowIndex = row.getAttribute('data-rowindex');

            const actionRow = f('[data-testid="data-grid-pinned-row"][data-rowindex="' + rowIndex + '"]');
			const actionButton = actionRow.querySelector('[data-testid="user-row-actions-button"]');
			if (actionButton) actionButton.click();
            await new Promise(r => setTimeout(r, 100));

            const moveBtn = f('[data-testid="inventory-row-action-move"]');
            if (moveBtn) moveBtn.click();
            await new Promise(r => setTimeout(r, 100));

            const roomSelect = f('[id="select-input_Room:"]');
            if (roomSelect) roomSelect.focus();
        })();
    )"
    try backofficePage.Evaluate(js1)

    Sleep 750
    SendInput "{Space}"
    Sleep 100

    js2 := "
    (
        (async function(){
            const f = (s) => document.querySelector(s);
            const fA = (s) => Array.from(document.querySelectorAll(s));

            const salesFloor = document.querySelector('li[data-value="4226"]');
            if (salesFloor) salesFloor.click();
            await new Promise(r => setTimeout(r, 100));

            // 6. Focus the Qty input
            let qtyInput = f('[data-field="quantity"][role="cell"] [type="number"]');
			qtyInput.focus();
			qtyInput.select();
        })(); 
    )"
    try backofficePage.Evaluate(js2)
}

#HotIf
