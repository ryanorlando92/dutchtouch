import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { register, unregisterAll, isRegistered } from '@tauri-apps/plugin-global-shortcut';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch, exit } from '@tauri-apps/plugin-process';
import { message, confirm } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';

let store;
const appWindow = WebviewWindow.getCurrent();

(async () => {
    try {
        await unregisterAll();
        console.log("Startup: Cleared OS global shortcut hooks.");
    } catch (e) {
        console.warn("Startup: Hook cleanup skipped/failed.", e);
    }
})();

appWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    console.log("Launcher closing. Unregistering all global hotkeys...");
    try {
        await unregisterAll();
        console.log("Hotkeys successfully released.");
    } catch (e) {
        console.error("Failed to unregister hotkeys on exit:", e);
    }
    console.log("Executing total application shutdown...");
    await exit(0); 
});

async function loadSavedSettings() {
    try {
        console.log('Loading saved settings...');
        store = await load('settings.json');
        const hwID = await invoke('get_hardware_key');

        const savedLocation = await store.get('location');
        if (savedLocation) document.getElementById('location').value = savedLocation;

        const savedPin = await store.get('pin');
        if (savedPin) document.getElementById('managerPin').value = savedPin;

        const savedUsername = await store.get('username');
        if (savedUsername) document.getElementById('username').value = savedUsername;

        const savedEncryptedPassword = await store.get('password');
        if (savedEncryptedPassword) {
            const decrypted = await SecureStore.decrypt(savedEncryptedPassword, hwID);
            document.getElementById('password').value = decrypted;
        }
    } catch (error) {
        console.error("Failed to load settings:", error);
    }
}

const SecureStore = {
    async getKey(usernameSeed) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(usernameSeed), { name: "PBKDF2" }, false, ["deriveKey"]
        );
        return await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: enc.encode("dutch_touch_salt"), iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    },

    async encrypt(plainText, usernameSeed) {
        if (!plainText) return "";
        const key = await this.getKey(usernameSeed);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plainText));
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    },

    async decrypt(cipherText, usernameSeed) {
        if (!cipherText) return "";
        try {
            const key = await this.getKey(usernameSeed);
            const combined = new Uint8Array(atob(cipherText).split('').map(c => c.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.warn("Could not decrypt password. Username may have changed.");
            return ""; 
        }
    }
};

async function checkForUpdates() {
    try {
        const update = await check();
        if (update) {
            console.log(`Found update: Version ${update.version}`);
            const userConfirmed = await confirm(
                `Version ${update.version} is available! Would you like to install it now?`, 
                { title: 'Dutch Touch Updater', kind: 'info' }
            );

            if (userConfirmed) {
                await update.downloadAndInstall();
                await relaunch();
            }
        }
    } catch (error) {
        console.error("Failed to check for updates:", error);
    }
}

let isToggling = false;

async function setupGlobalListener() {
    try {
        await listen('toggle-view', async (event) => {
            if (isToggling) return;
            isToggling = true;

            const target = event.payload;
            console.log(`\n[TOGGLE] Intercepted request to switch to: ${target}`);

            try {
                const posWin = await WebviewWindow.getByLabel('pos');
                const boWin = await WebviewWindow.getByLabel('backoffice');

                if (!posWin || !boWin) {
                    console.error("[TOGGLE] Aborted: Windows missing.");
                    isToggling = false;
                    return;
                }

                // FIX: Use hide()/show() instead of minimize(). It avoids Windows OS animation queues
                // which often corrupt focus reporting and cause the hotkeys to silently fail.
                if (target === 'backoffice') {
                    console.log("[TOGGLE] Hiding POS...");
                    await posWin.hide();
                    console.log("[TOGGLE] Showing Backoffice...");
                    await boWin.show();
                    await boWin.setFocus();
                } else if (target === 'pos') {
                    console.log("[TOGGLE] Hiding Backoffice...");
                    await boWin.hide();
                    console.log("[TOGGLE] Showing POS...");
                    await posWin.show();
                    await posWin.setFocus();
                }
            } catch (err) {
                console.error("[TOGGLE] Fatal crash during switch:", err);
            } finally {
                isToggling = false; 
            }
        });
    } catch (err) {
        console.error("Failed to boot global listener:", err);
    }
}

setupGlobalListener();
loadSavedSettings();
checkForUpdates();

document.getElementById('launchBtn').addEventListener('click', async () => {
    // Purge before launching
    await unregisterAll().catch(err => console.error("un-registering hotkeys failed:", err));

    const pin = document.getElementById('managerPin').value;
    
    const registerDualHotkeys = async () => {
        console.log('Starting hotkey registration sequence');

        const dispatchHotkey = async (key) => {
            console.log(`[ROUTER] Intercepted: ${key}`);
            
            const allWindows = await WebviewWindow.getAll();
            let target = null;
            let active = null;

            for (const win of allWindows) {
                if (await win.isFocused()) {
                    target = win.label;
                    if (target.includes('pos')) active = 'pos';
                    else if (target.includes('backoffice')) active = 'backoffice';
                    break;
                }
            }

            if (!active || !target) {
                console.log(`[ROUTER] ABORT: User is clicked into another app or unknown window.`);
                return;
            }
            
            let payload = "";
            target = active;

            // ... Your identical hotkey switch block ...
            switch (key) {
                case 'Alt+C':
                    if (active === 'pos') {
                        payload = `(function(){
                            const f = (t) => Array.from(document.querySelectorAll('button,span,div')).find(i => i.innerText?.trim() === t && i.offsetParent !== null);
                            const b1 = f('Cancel'); if(b1) b1.click();
                            setTimeout(() => { const b2 = f('Close'); if(b2) b2.click(); }, 100);
                        })();`;
                    } else {
                        payload = `(function(){
                            const f = (t) => {
                                const testIdBtn = document.querySelector('[data-testid="modal-close-button"]');
                                if (testIdBtn && testIdBtn.offsetParent !== null) return testIdBtn;
                                return Array.from(document.querySelectorAll('button,span,div')).find(i => i.innerText?.trim() === t && i.offsetParent !== null);
                            };
                            const b1 = f('Cancel'); if(b1) b1.click();
                            setTimeout(() => { const b2 = f('Close'); if(b2) b2.click(); }, 100);
                        })();`;
                    }
                break;
                case 'Alt+M':
                    if (active === 'pos') {
                        payload = `(function(){ const card = document.querySelector("div[class^='OrderKanbanCard']"); if(card) card.click(); })();`;
                    } else {
                        payload = `(async function(){
                            const f = (s) => document.querySelector(s);
                            const fA = (s) => Array.from(document.querySelectorAll(s));
                            
                            const RoomCol = fA('[data-field="room.roomNo"]');
                            const vaultCell = RoomCol.find(el => el.innerText && el.innerText.trim() === 'Vault');
                            if (!vaultCell) return;
                            
                            const row = vaultCell.closest('[data-rowindex]');
                            if (!row) return;
                            const rowIndex = row.getAttribute('data-rowindex');

                            const actionRow = f('[data-testid="data-grid-pinned-row"][data-rowindex="' + rowIndex + '"]');
                            if (!actionRow) return;

                            const actionButton = actionRow.querySelector('[data-testid="user-row-actions-button"]');
                            if (actionButton) actionButton.click();
                            await new Promise(r => setTimeout(r, 100));

                            const moveBtn = f('[data-testid="inventory-row-action-move"]');
                            if (moveBtn) moveBtn.click();
                            
                            await new Promise(r => setTimeout(r, 800)); 

                            const roomSelect = f('[id="select-input_Room:"]');
                            if (roomSelect) {
                                roomSelect.focus();
                                roomSelect.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true }));
                                roomSelect.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                            }

                            await new Promise(r => setTimeout(r, 200)); 

                            const salesFloor = f('li[data-value="4226"]');
                            if (salesFloor) salesFloor.click();
                            
                            await new Promise(r => setTimeout(r, 150));

                            const qtyInput = f('[data-field="quantity"][role="cell"] [type="number"]');
                            if (qtyInput) {
                                qtyInput.focus();
                                qtyInput.select();
                            }
                        })();`;
                    }
                break;
                case 'Alt+I':
                    if (active === 'pos') {
                        payload = `(function(){
                            const sV = (e,v) => {
                                const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                                s.call(e, v);
                                e.dispatchEvent(new Event('input', {bubbles:true}));
                            };
                            const fE = (t,x) => Array.from(document.querySelectorAll(t)).find(e => e.innerText?.trim() === x || e.placeholder === x || e.name === x);
                            const bA = fE('button,span,div', 'Add items');
                            if(bA) {
                                bA.click();
                                setTimeout(() => {
                                    const pF = fE('input', 'Manager PIN');
                                    if(pF) { sV(pF, '${pin}'); setTimeout(() => { const bC = fE('button,span,div', 'Continue'); if(bC) bC.click(); }, 200); }
                                }, 200);
                                setTimeout(() => {
                                    const el = document.getElementById("productSearchBar");
                                    if(el) { el.focus(); el.select(); }
                                }, 500);
                            }
                        })();`;
                    }
                break;
                case 'Alt+B':
                    if (active === 'pos') {
                        payload = `(function(){
                            const el = Array.from(document.querySelectorAll('input,textarea')).find(i => i.placeholder === 'Find guest...');
                            if(el) el.focus();
                        })();`;
                    } else {
                        payload = `(function(){
                            const inputs = Array.from(document.querySelectorAll('input[type="search"], input[placeholder*="search" i]'));
                            const visibleInputs = inputs.filter(el => el.offsetParent !== null);
                            
                            if (visibleInputs.length > 1) {
                                visibleInputs[1].focus();
                                visibleInputs[1].select(); 
                            } else if (visibleInputs.length === 1) {
                                visibleInputs[0].focus();
                                visibleInputs[0].select();
                            }
                        })();`;
                    }
                break;
                case 'Alt+Space':
                    if (active === 'pos') {
                        payload = `(async function(){
                            const f = (t) => {
                                const e = Array.from(document.querySelectorAll('button,span,div')).find(b => b.innerText.trim() === t);
                                if(e) e.click();
                                return e;
                            };
                            if(f('Release')) { setTimeout(() => f('Confirm'), 150); }
                            await new Promise(r => setTimeout(r, 500));
                            const el = Array.from(document.querySelectorAll('input,textarea')).find(i => i.placeholder === 'Find guest...');
                            if(el) el.focus();
                        })();`;
                    } else {
                        payload = `(function(){
                            const btn = document.querySelector("[data-testid='move-inventory-modal-move-button']");
                            if (btn) btn.click();
                        })();`;
                    }
                break;
                case 'Alt+Q':
                    if (active === 'pos') {
                        payload = `(function(){
                            const el = document.querySelector("[data-testid='navigation-sidebar-logo-link']");
                            if(el){
                                const target = el.closest('div') || el.closest('a') || el;
                                target.click();
                            }
                        })();`;
                    } else {
                        payload = `(function() {
                            const allSvgs = Array.from(document.querySelectorAll('svg'));
                            const anchorIndex = allSvgs.findIndex(svg => svg.getAttribute('data-testid') === 'sidebar-menu_svg_icon');
                            
                            if (anchorIndex !== -1 && anchorIndex + 1 < allSvgs.length) {
                                const targetSvg = allSvgs[anchorIndex + 1];
                                const wrapper = targetSvg.closest('a, button, li, div[role="button"], div[class*="MenuItem"]') || targetSvg;
                                const clickEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true, buttons: 1 });
                                wrapper.dispatchEvent(clickEvent);
                                if (wrapper.tagName === 'A' && wrapper.href) {
                                    setTimeout(() => { window.location.href = wrapper.href; }, 100);
                                }
                            }
                        })();`;
                    }
                break;
                case 'Alt+R':
                    if (active === 'pos') {
                        payload = `(async function(){
                            const f = (s) => document.querySelector(s);
                            const anchor = f("[data-testid='guest-card_overflow_menu_anchor']");
                                if (anchor) {
                                    anchor.click();
                                    await new Promise(r => setTimeout(r, 100));
                                    const release = f("[data-testid='guest-card_overflow_menu_menu-option_Release']");
                                    if (release) {
                                        release.click();
                                        await new Promise(r => setTimeout(r, 100));
                                        const confirm = f("[data-testid='confirmation-popup_confirm-button_confirm']");
                                        if (confirm) confirm.click();
                                    }
                                }
                        })();`;
                    }
                break;
            }

            if (payload) {
                await invoke('inject_js', { windowLabel: target, script: payload }).catch(err => console.error("Injection failed:", err));
            }
        };

        const keys = ['Alt+C', 'Alt+M', 'Alt+I', 'Alt+Space', 'Alt+B', 'Alt+Q', 'Alt+R'];
        
        for (const key of keys) {
            try {
                // Ensure double-clicks don't cause duplicate hook attempts
                if (await isRegistered(key)) continue; 
                await register(key, (event) => {
                    if (event.state === 'Released') return;
                    dispatchHotkey(key)
                });
            } catch (e) {
                console.error(`Failed to register ${key}:`, e);
            }
        }
    };

    const locationStr = document.getElementById('location').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!pin.match(/^\d{4,6}$/)) {
        await message('Please enter a valid 4 to 6 digit numerical PIN.', { title: 'Dutch Touch Error', kind: 'error' });
        return;
    }
    
    try {
        const hwID = await invoke('get_hardware_key');
        const encryptedPassword = await SecureStore.encrypt(password, hwID);
        await store.set('location', locationStr);
        await store.set('pin', pin);
        await store.set('username', username);
        await store.set('password', encryptedPassword);
        await store.save(); 
    } catch (saveError) {
        console.error("Failed to save settings:", saveError);
    }

    await registerDualHotkeys();

    // Create Windows
    const posWin = new WebviewWindow('pos', {
        url: 'https://verano.pos.dutchie.com/guestlist',
        title: 'Dutchie POS - DutchTouch',
        width: 1200, height: 800, visible: true, maximized: true
    });

    const boWin = new WebviewWindow('backoffice', {
        url: 'https://verano.backoffice.dutchie.com/',
        title: 'Dutchie Backoffice - DutchTouch',
        width: 1200, height: 800, visible: true, maximized: true
    });

    // FIX: Accidental window closures destroy the target label, breaking the hotkey router permanently.
    // Intercept and hide instead of closing.
    posWin.onCloseRequested((e) => { e.preventDefault(); posWin.hide(); });
    boWin.onCloseRequested((e) => { e.preventDefault(); boWin.hide(); });

    const getInjectionScript = (buttonText, targetView) => `
        (function() {
            if (document.getElementById('tauri-switcher')) return;
            const btn = document.createElement('button');
            btn.id = 'tauri-switcher';
            btn.innerText = '${buttonText}';
            btn.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:999999; background:#0f0f0f; color:#FFF; border:2px solid #396cd8; border-radius:8px; padding:12px 24px; cursor:pointer; font-weight:bold; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 14px;';
            
            btn.onclick = () => {
                try {
                    if (window.__TAURI__) window.__TAURI__.event.emit('toggle-view', '${targetView}');
                } catch (e) { console.error("EMIT FAILED: " + e.message); }
            };
            
            document.body.appendChild(btn);

            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Tab') {
                    e.preventDefault();
                    btn.click();
                }
            }, true);
            window.addEventListener('keyup', (e) => {
                if (e.key === 'Alt') { e.preventDefault(); e.stopPropagation(); }
            }, true);
        })();
    `;
    
    posWin.once('tauri://created', async () => {
        setTimeout(async () => {
            await invoke('inject_js', { windowLabel: 'pos', script: getInjectionScript('Backoffice ➔', 'backoffice') });
            await invoke('inject_js', { windowLabel: 'pos', script: getLoginPayload(username, password) });
        }, 2000);
    });

    boWin.once('tauri://created', async () => {
        setTimeout(async () => {
            await invoke('inject_js', { windowLabel: 'backoffice', script: getInjectionScript('⬅ POS', 'pos') });
            await invoke('inject_js', { windowLabel: 'backoffice', script: getLoginPayload(username, password) });
        }, 2000);
    });
});

// FIX: Robust payload injection to prevent race conditions during slow network speeds
function getLoginPayload(username, password) {
    return `
        (function() {
            const injectedUser = ${JSON.stringify(username)};
            const injectedPass = ${JSON.stringify(password)};

            // Use an interval instead of a fixed timeout to account for React routing and slow internet
            const intervalId = setInterval(() => {
                const userField = document.querySelector('input[data-testid="login-page_input_username"], input[placeholder="Username"], input[name="username"]');
                const passField = document.querySelector('input[type="password"]');
                const loginBtn = document.querySelector('button[type="submit"]');

                if (userField && passField && loginBtn) {
                    clearInterval(intervalId); // Mount confirmed, clear poller

                    const setNativeValue = (element, value) => {
                        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                        if (valueSetter) valueSetter.call(element, value);
                        else element.value = value;
                        element.dispatchEvent(new Event('input', { bubbles: true }));
                        element.dispatchEvent(new Event('change', { bubbles: true }));
                    };

                    setNativeValue(userField, injectedUser);
                    setNativeValue(passField, injectedPass);
                    
                    setTimeout(() => loginBtn.click(), 400); 
                }
            }, 1000);

            // Safety killswitch: Stop polling after 45 seconds
            setTimeout(() => clearInterval(intervalId), 45000);
        })();
    `;
}