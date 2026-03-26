import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

let store;

async function loadSavedSettings() {
    try {
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

loadSavedSettings();

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
        console.log("Checking GitHub for updates...");
        const update = await check();
        
        if (update) {
            console.log(`Found update: Version ${update.version}`);

            if (confirm(`Version ${update.version} is available! Would you like to install it now?`)) {
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

checkForUpdates();

document.getElementById('launchBtn').addEventListener('click', async () => {
    const pin = document.getElementById('managerPin').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const loginPayload = `
            (function() {
                const injectedUser = ${JSON.stringify(username)};
                const injectedPass = ${JSON.stringify(password)};
                let attempts = 0;

                // REACT BYPASS: Triggers the actual synthetic events so the framework registers the text
                const setNativeValue = (element, value) => {
                    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    valueSetter.call(element, value);
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                };

                // THE POLLER: Checks the page every 500ms for the login fields
                const attemptLogin = () => {
                    attempts++;
                    
                    // Adjust these CSS selectors based on Dutchie's actual login page structure
                    const userField = document.querySelector('input[data-testid="login-page_input_username"], input[placeholder="Username"]');
                    const passField = document.querySelector('input[type="password"]');

                    if (userField && passField) {
                        console.log("Fields found! Injecting credentials...");
                        setNativeValue(userField, injectedUser);
                        setNativeValue(passField, injectedPass);
                        
                         const loginBtn = document.querySelector('button[type="submit"]');
                         if (loginBtn) {
                             setTimeout(() => loginBtn.click(), 500); // Slight delay to let React catch up
                         }
                    } else if (attempts < 20) {
                        // If not found, try again in 500ms (up to 10 seconds total)
                        setTimeout(attemptLogin, 500);
                    } else {
                        console.log("Auto-login failed: Could not find input fields after 10 seconds.");
                    }
                };

                attemptLogin();
            })();
        `;
    
    if (!pin.match(/^\d{4,6}$/)) {
        alert("Please enter a valid 4 to 6 digit numerical PIN.");
        return;
    }

    try {
        const osUser = await invoke('get_os_username');
        const rawPassword = document.getElementById('password').value;
        const encryptedPassword = await SecureStore.encrypt(rawPassword, osUser);

        await store.set('location', document.getElementById('location').value);
        await store.set('pin', document.getElementById('managerPin').value);
        await store.set('username', document.getElementById('username').value);
        await store.set('password', encryptedPassword);
        
        await store.save(); 
        console.log("Settings safely encrypted and saved.");
    } catch (saveError) {
        console.error("Failed to save settings:", saveError);
    }

    console.log("Attempting to spawn Dutchie window...");
    const dutchieWin = new WebviewWindow('dutchie', {
        url: 'https://verano.pos.dutchie.com/guestlist',
        title: 'Dutchie POS - DutchTouch Link',
        width: 1200,
        height: 800
        });
 

    dutchieWin.once('tauri://created', async () => {
        console.log("Window created successfully");

        const registerHotkeys = async () => {
            try {
                await register('Alt+B', async () => {
                    const payload = `
                        (function(){
                            const el = Array.from(document.querySelectorAll('input,textarea')).find(i => i.placeholder === 'Find guest...');
                            if(el) { el.focus(); } else { alert('Field not found'); }
                        })();
                    `;
                    await invoke('inject_js', { script: payload });
                });

                await register('Alt+C', async () => {

                    const payload = `
                        (async function(){
                            const f = (t) => Array.from(document.querySelectorAll('button,span,div')).find(i => i.innerText && i.innerText.trim() === t && i.offsetParent !== null);
                            const btn1 = f('Cancel'); 
                            if(btn1) { (btn1.closest('button') || btn1).click(); }
                            
                            await new Promise(r => setTimeout(r, 100));
                            
                            const btn2 = f('Close'); 
                            if(btn2) { (btn2.closest('button') || btn2).click(); }
                        })();
                    `;
                    await invoke('inject_js', { script: payload });
                });

                await register('Alt+M', async () => {
                    const payload = `
                        (function(){
                            const card = document.querySelector("div[class^='OrderKanbanCard']");
                            if(card) { card.click(); }
                        })();
                    `;
                    await invoke('inject_js', { script: payload });
                });

                await register('Alt+Space', async () => {
                    const payload = `
                        (function(){
                        const f = (t) => {
                        const e = Array.from(document.querySelectorAll('button,span,div')).find(b => b.innerText && b.innerText.trim() === t);
                        if(e) e.click();
                        return e;
                            };
                        if(f('Release')) { setTimeout(() => f('Confirm'), 100); }
                        })();
                    `;
                    await invoke('inject_js', { script: payload });
                });

                await register('Alt+Q', async () => {
                    const payload = `
                        (function(){
                            const el = document.querySelector("[data-testid='navigation-sidebar-logo-link']");
                            if(el){
                                const target = el.closest('div') || el.closest('a') || el;
                                target.click();
                            }
                        })();
                    `;
                    await invoke('inject_js', { script: payload });
                });

                await register('Alt+R', async () => {
                    const payload = `
                        (async function(){
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
                        })();
                    `;
                    await invoke('inject_js', { script: payload });
                });

                await register('Alt+I', async () => {
                    const payload = `
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
                                        sV(pF, '${pin}'); // PIN is injected securely here
                                        setTimeout(() => {
                                            const bC = fE('button,span,div', 'Continue');
                                            if(bC) bC.click();
                                        }, 250);
                                    }
                                }, 250);
                            }
                        })();
                    `;
                    await invoke('inject_js', { script: payload });
                });

                console.log("Hotkeys registered (Window focused)");
            } catch (error) {
                console.error("Failed to register hotkeys:", error);
            }
        };

        const releaseHotkeys = async () => {
            try {
                await unregisterAll();
                console.log("Hotkeys released")
            } catch (error) {
                console.error("Failed to release hotkeys to OS:", error);
            }
        };
        
        dutchieWin.onFocusChanged(async ({ payload: isFocused }) => {
            if (isFocused) {
                await registerHotkeys();
            } else {
                await releaseHotkeys();
            }
        });   

        dutchieWin.onCloseRequested(async () => {
            await releaseHotkeys();
        });

        await registerHotkeys();

        setTimeout(async () => {
            console.log("waiting to inject login sequence...")
            try {
                await invoke('inject_js', { script: loginPayload }); 
            } catch (error) {
                console.error("Failed to inject login script.", error);
            }
        }, 2000);
    });

});