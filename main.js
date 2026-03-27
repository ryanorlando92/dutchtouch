import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { message, confirm } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';

let store;

async function loadSavedSettings() {
    try {
        console.log('loading saved settings...');

        store = await load('settings.json');
        
        const osUser = await invoke('get_os_username');

        const savedLocation = await store.get('location');
        if (savedLocation) document.getElementById('location').value = savedLocation;

        const savedPin = await store.get('pin');
        if (savedPin) document.getElementById('managerPin').value = savedPin;

        const savedUsername = await store.get('username');
        if (savedUsername) document.getElementById('username').value = savedUsername;

        const savedEncryptedPassword = await store.get('password');
        if (savedEncryptedPassword) {
            const decrypted = await SecureStore.decrypt(savedEncryptedPassword, osUser);
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
        console.log("Checking for updates...");
        const update = await check();
        
        if (update) {
            console.log(`Found update: Version ${update.version}`);

            if (confirm(`Version ${update.version} is available! Would you like to install it now?`, { title: 'Dutch Touch Updater', kind: 'info' })) {
                console.log("Downloading and installing...");
                
                await update.downloadAndInstall();
                
                console.log("Installation complete. Restarting app!");
                await relaunch();
            }
        } else {
            console.log("App is currently up to date.");
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
                    console.error("[TOGGLE] Aborted: Could not find windows in memory.");
                    isToggling = false;
                    return;
                }

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
        console.log("Global listener started.");
    } catch (err) {
        console.error("Failed to boot global listener:", err);
    }
}

setupGlobalListener();
loadSavedSettings();
checkForUpdates();

document.getElementById('launchBtn').addEventListener('click', async () => {
    await unregisterAll().catch(err => console.error("un-registering hotkeys failed:", err));
    
    console.log('setting variables from launcher input');
    const locationStr = document.getElementById('location').value;
    const pin = document.getElementById('managerPin').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!pin.match(/^\d{4,6}$/)) {
        await message('Please enter a valid 4 to 6 digit numerical PIN.', { title: 'Dutch Touch Error', kind: 'error' });
        return;
    }
    
    console.log('saving launcher settings...');
    try {
        const osUser = await invoke('get_os_username');
        const encryptedPassword = await SecureStore.encrypt(password, osUser);
        await store.set('location', locationStr);
        await store.set('pin', pin);
        await store.set('username', username);
        await store.set('password', encryptedPassword);
        await store.save(); 
        console.log("Settings safely encrypted and saved.");
    } catch (saveError) {
        console.error("Failed to save settings:", saveError);
    }

    console.log("Spawning windows...");
        const posWin = new WebviewWindow('pos', {
            url: 'https://verano.pos.dutchie.com/guestlist',
            title: 'Dutchie POS - DutchTouch',
            width: 1200,
            height: 800,
            visible: true
        });

        const boWin = new WebviewWindow('backoffice', {
            url: 'https://verano.backoffice.dutchie.com/',
            title: 'Dutchie Backoffice - DutchTouch',
            width: 1200,
            height: 800,
            visible: false
        });
        console.log('POS & Backoffice windows successfully initialized');

    const getInjectionScript = (buttonText, targetView) => {
        return `
            (function() {
                if (document.getElementById('tauri-switcher')) return;
                const btn = document.createElement('button');
                btn.id = 'tauri-switcher';
                btn.innerText = '${buttonText}';
                btn.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:999999; background:#0f0f0f; color:#FFF; border:2px solid #396cd8; border-radius:8px; padding:12px 24px; cursor:pointer; font-weight:bold; box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 14px;';
                btn.onclick = () => window.__TAURI__.event.emit('toggle-view', '${targetView}');
                document.body.appendChild(btn);
            })();
        `;
    };

    const getActiveLabel = async () => {
        if (await posWin.isFocused()) return 'pos';
        if (await boWin.isFocused()) return 'backoffice';
        return null;
    };

    const registerDualHotkeys = async () => {
        console.log('Starting hotkey registration sequence');

        const dispatchHotkey = async (key) => {
          // console.log(`[ROUTER] Intercepted: ${key}`);

           // await new Promise(r => setTimeout(r, 50)); 

            const active = await getActiveLabel();
            // console.log(`[ROUTER] Active window evaluated as: ${active}`);

            if (!active) {
               // console.log(`[ROUTER] ABORT: User is clicked into another app.`);
                return;
            }

            let payload = "";
            let target = active;

            switch (key) {
                case 'Alt+C':
                    if (active === 'pos') {
                        payload = `(function(){
                            const f = (t) => Array.from(document.querySelectorAll('button,span,div')).find(i => i.innerText?.trim() === t && i.offsetParent !== null);
                            const b1 = f('Cancel'); if(b1) b1.click();
                            setTimeout(() => { const b2 = f('Close'); if(b2) b2.click(); }, 100);
                        })();`;
                    } else {
                        payload = `/* Backoffice specific logic */`;
                    }
                break;

                case 'Alt+M':
                    if (active === 'pos') {
                        payload = `(function(){ const card = document.querySelector("div[class^='OrderKanbanCard']"); if(card) card.click(); })();`;
                    } else {
                        payload = `/* Backoffice specific logic */`;
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
                                    if(pF) { sV(pF, '${pin}'); setTimeout(() => { const bC = fE('button,span,div', 'Continue'); if(bC) bC.click(); }, 250); }
                                }, 250);
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
                            const el = Array.from(document.querySelectorAll('input,textarea')).filter(i => i.placeholder && i.placeholder.includes('Search')).pop();
                            if(el) { el.focus(); } else { alert('Field not found'); }
                        })();`;
                    }
                break;

                case 'Alt+Space':
                    if (active === 'pos') {
                        payload = `(function(){
                            const f = (t) => {
                                const e = Array.from(document.querySelectorAll('button,span,div')).find(b => b.innerText.trim() === t);
                                if(e) e.click();
                                return e;
                            };
                            if(f('Release')) { setTimeout(() => f('Confirm'), 100); }
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
                        payload = `/* Backoffice specific logic */`;
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
                // console.log(`[ROUTER] Firing ${key} payload into -> ${target}`);
                await invoke('inject_js', { windowLabel: target, script: payload }).catch(err => console.error("Injection failed:", err));
            }
        };

        const keys = ['Alt+C', 'Alt+M', 'Alt+I', 'Alt+Space', 'Alt+B', 'Alt+Q', 'Alt+R'];
        
        console.log('registering hotkeys...');
        for (const key of keys) {
            try {
                await register(key, () => dispatchHotkey(key));
            } catch (e) {
                console.error(`Failed to register ${key}:`, e);
            }
        }
        console.log('Keys registered');
    };
    
    posWin.once('tauri://created', async () => {
        console.log("POS Window created.");
        
        await registerDualHotkeys();

        setTimeout(async () => {
            await invoke('inject_js', { windowLabel: 'pos', script: getInjectionScript('Backoffice ➔', 'backoffice') })
            .catch(err => console.error("create pos->backoffice button failed:", err));
            await invoke('inject_js', { windowLabel: 'pos', script: getLoginPayload(username, password) })
            .catch(err => console.error("pos login injection failed:", err));
        }, 2000);
    });

    boWin.once('tauri://created', async () => {
        console.log("Backoffice Window created.");

        setTimeout(async () => {
            await invoke('inject_js', { windowLabel: 'backoffice', script: getInjectionScript('⬅ POS', 'pos') })
            .catch(err => console.error("create backoffice->pos button failed:", err));
            await invoke('inject_js', { windowLabel: 'backoffice', script: getLoginPayload(username, password) })
            .catch(err => console.error("backoffice login injection failed:", err));
        }, 2000);
    });

    posWin.onCloseRequested(async () => {
        try { await unregisterAll(); } catch (e) { console.error(e); };
        await boWin.close(); 
    });

    boWin.onCloseRequested(async () => {
        try { await unregisterAll(); } catch (e) { console.error(e); }
        await posWin.close(); 
    });

});

function getLoginPayload(username, password) {
    return `
        (function() {
            const injectedUser = ${JSON.stringify(username)};
            const injectedPass = ${JSON.stringify(password)};
            let attempts = 0;

            const setNativeValue = (element, value) => {
                const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                valueSetter.call(element, value);
                element.dispatchEvent(new Event('input', { bubbles: true }));
            };

            const attemptLogin = () => {
                attempts++;
                const userField = document.querySelector('input[data-testid="login-page_input_username"], input[placeholder="Username"]');
                const passField = document.querySelector('input[type="password"]');

                if (userField && passField) {
                    setNativeValue(userField, injectedUser);
                    setNativeValue(passField, injectedPass);
                    
                     const loginBtn = document.querySelector('button[type="submit"]');
                     if (loginBtn) {
                         setTimeout(() => loginBtn.click(), 500); 
                     }
                } else if (attempts < 20) {
                    setTimeout(attemptLogin, 500);
                }
            };
            attemptLogin();
        })();
    `;
}