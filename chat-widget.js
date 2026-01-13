(function() {
    'use strict';

    const scriptTag = document.currentScript;
    const CONFIG = {
        webhookUrl: scriptTag?.getAttribute('data-webhook') || '',
        primaryColor: scriptTag?.getAttribute('data-color') || '#ff6d37',
        botName: scriptTag?.getAttribute('data-name') || 'AI Assistant',
        botAvatar: scriptTag?.getAttribute('data-avatar') || '🤖',
        welcomeMessage: scriptTag?.getAttribute('data-welcome') || 'Hi! 👋 How can I help you today?',
        position: scriptTag?.getAttribute('data-position') || 'right',
        popupDelay: parseInt(scriptTag?.getAttribute('data-popup-delay')) || 7000,
        popupMessage: scriptTag?.getAttribute('data-popup-message') || 'Need help?',
        streamingSpeed: 20,
    };

    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    let isOpen = false;
    let isProcessing = false;
    let popupShown = false;

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function adjustColor(hex, percent) {
        const num = parseInt(hex.slice(1), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, Math.max(0, (num >> 16) + amt));
        const G = Math.min(255, Math.max(0, (num >> 8 & 0x00FF) + amt));
        const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
        return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function formatTime(d) { return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }); }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #ai-chat-widget{--c-primary:${CONFIG.primaryColor};--c-light:${adjustColor(CONFIG.primaryColor,20)};--c-dark:${adjustColor(CONFIG.primaryColor,-15)};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;position:fixed;bottom:24px;${CONFIG.position}:24px;z-index:99999}
            #ai-chat-widget *{box-sizing:border-box;margin:0;padding:0}
            
            /* Toggle Button */
            #ai-chat-toggle{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--c-primary),var(--c-light));border:none;cursor:pointer;box-shadow:0 8px 32px ${hexToRgba(CONFIG.primaryColor,0.4)};display:flex;align-items:center;justify-content:center;transition:all .4s cubic-bezier(.175,.885,.32,1.275);position:relative;overflow:hidden}
            #ai-chat-toggle:hover{transform:scale(1.1);box-shadow:0 12px 40px ${hexToRgba(CONFIG.primaryColor,0.5)}}
            #ai-chat-toggle::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.2),transparent 50%);border-radius:50%}
            .ai-toggle-icon{width:28px;height:28px;position:relative;display:flex;align-items:center;justify-content:center}
            .ai-toggle-icon svg{width:28px;height:28px;fill:#fff;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transition:all .3s ease}
            .ai-toggle-icon .icon-chat{opacity:1;transform:translate(-50%,-50%) scale(1)}
            .ai-toggle-icon .icon-close{opacity:0;transform:translate(-50%,-50%) scale(.5) rotate(-90deg)}
            #ai-chat-widget.open .icon-chat{opacity:0;transform:translate(-50%,-50%) scale(.5) rotate(90deg)}
            #ai-chat-widget.open .icon-close{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0)}
            @keyframes ai-pulse{0%,100%{box-shadow:0 8px 32px ${hexToRgba(CONFIG.primaryColor,0.4)}}50%{box-shadow:0 8px 32px ${hexToRgba(CONFIG.primaryColor,0.4)},0 0 0 12px ${hexToRgba(CONFIG.primaryColor,0)}}}
            #ai-chat-widget:not(.open) #ai-chat-toggle{animation:ai-pulse 3s ease-in-out infinite}
            #ai-chat-widget.open #ai-chat-toggle{animation:none}
            
            /* Popup Bubble */
            .ai-popup-bubble{position:absolute;bottom:80px;${CONFIG.position}:0;background:#fff;padding:16px 24px;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.08);font-size:15px;font-weight:500;color:#1a1a2e;white-space:nowrap;opacity:0;transform:translateY(10px) scale(.9);transition:all .4s cubic-bezier(.175,.885,.32,1.275);pointer-events:none;border:1px solid rgba(0,0,0,.05)}
            .ai-popup-bubble::after{content:'';position:absolute;bottom:-10px;${CONFIG.position}:28px;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-top:10px solid #fff;filter:drop-shadow(0 2px 2px rgba(0,0,0,.05))}
            .ai-popup-bubble.show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
            .ai-popup-bubble .close-popup{position:absolute;top:-10px;right:-10px;width:24px;height:24px;background:#fff;border:1px solid #e2e8f0;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;color:#64748b;line-height:1;transition:all .2s;box-shadow:0 2px 8px rgba(0,0,0,.1)}
            .ai-popup-bubble .close-popup:hover{background:#f8f9fc;color:#1a1a2e;transform:scale(1.1)}
            #ai-chat-widget.open .ai-popup-bubble{opacity:0;transform:translateY(10px) scale(.9);pointer-events:none}

            /* Chat Window */
            #ai-chat-window{position:absolute;bottom:80px;${CONFIG.position}:0;width:400px;height:600px;background:#fff;border-radius:24px;box-shadow:0 25px 60px -12px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.05);display:flex;flex-direction:column;overflow:hidden;opacity:0;visibility:hidden;transform:translateY(20px) scale(.9);transform-origin:bottom ${CONFIG.position};transition:all .4s cubic-bezier(.175,.885,.32,1.275)}
            #ai-chat-widget.open #ai-chat-window{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
            
            /* Header */
            #ai-chat-header{background:linear-gradient(135deg,var(--c-primary) 0%,var(--c-light) 100%);padding:20px 24px;color:#fff;position:relative;overflow:hidden}
            #ai-chat-header::before{content:'';position:absolute;top:-50%;right:-30%;width:80%;height:200%;background:radial-gradient(circle,rgba(255,255,255,.12) 0%,transparent 60%);pointer-events:none}
            #ai-chat-header::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.2),transparent)}
            .ai-header-content{display:flex;align-items:center;gap:14px;position:relative;z-index:1}
            .ai-header-avatar{width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);box-shadow:0 4px 12px rgba(0,0,0,.1)}
            .ai-header-info{flex:1}
            .ai-header-info h3{margin:0 0 2px 0;font-size:17px;font-weight:700;letter-spacing:-.3px;text-shadow:0 1px 2px rgba(0,0,0,.1)}
            .ai-header-status{display:flex;align-items:center;gap:8px;font-size:13px;opacity:.95}
            .ai-status-dot{width:8px;height:8px;background:#4ade80;border-radius:50%;animation:ai-statusPulse 2s infinite;box-shadow:0 0 8px rgba(74,222,128,.6)}
            @keyframes ai-statusPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.7;transform:scale(.85)}}
            
            /* Close Button in Header */
            .ai-header-close{width:36px;height:36px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.2);border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s ease;backdrop-filter:blur(8px)}
            .ai-header-close:hover{background:rgba(255,255,255,.25);transform:scale(1.05)}
            .ai-header-close:active{transform:scale(.95)}
            .ai-header-close svg{width:18px;height:18px;fill:#fff}
            
            /* Messages */
            #ai-chat-messages{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px;background:linear-gradient(180deg,#f8f9fc 0%,#fff 100%);scroll-behavior:smooth}
            #ai-chat-messages::-webkit-scrollbar{width:6px}
            #ai-chat-messages::-webkit-scrollbar-track{background:transparent}
            #ai-chat-messages::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:3px}
            #ai-chat-messages::-webkit-scrollbar-thumb:hover{background:#cbd5e1}
            
            /* Message Animation - Bounce + Fade */
            .ai-msg-wrap{display:flex;flex-direction:column;gap:6px;opacity:0;transform:translateY(20px) scale(0.95);animation:ai-msgBounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards}
            @keyframes ai-msgBounceIn{
                0%{opacity:0;transform:translateY(30px) scale(0.9)}
                50%{opacity:1;transform:translateY(-5px) scale(1.02)}
                70%{transform:translateY(3px) scale(0.99)}
                100%{opacity:1;transform:translateY(0) scale(1)}
            }
            .ai-msg-wrap.user{align-items:flex-end}
            .ai-msg-wrap.bot{align-items:flex-start}
            .ai-msg-bubble{max-width:85%;padding:16px 20px;font-size:14px;line-height:1.65;word-wrap:break-word;transition:transform 0.2s ease, box-shadow 0.2s ease}
            .ai-msg-bubble:hover{transform:scale(1.01)}
            .ai-msg-wrap.user .ai-msg-bubble{background:linear-gradient(135deg,var(--c-primary),var(--c-light));color:#fff;border-radius:20px 20px 6px 20px;box-shadow:0 4px 16px ${hexToRgba(CONFIG.primaryColor,0.25)}}
            .ai-msg-wrap.user .ai-msg-bubble:hover{box-shadow:0 6px 20px ${hexToRgba(CONFIG.primaryColor,0.35)}}
            .ai-msg-wrap.bot .ai-msg-bubble{background:#fff;color:#1a1a2e;border-radius:20px 20px 20px 6px;box-shadow:0 2px 12px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.04)}
            .ai-msg-wrap.bot .ai-msg-bubble:hover{box-shadow:0 4px 16px rgba(0,0,0,.1),0 0 0 1px rgba(0,0,0,.04)}
            .ai-msg-wrap.error .ai-msg-bubble{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
            .ai-msg-time{font-size:11px;color:#94a3b8;padding:0 12px;opacity:0;animation:ai-fadeIn 0.3s ease 0.3s forwards}
            @keyframes ai-fadeIn{to{opacity:1}}
            
            /* Typing */
            .ai-typing{display:flex;align-items:flex-end;gap:10px;opacity:0;animation:ai-msgBounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards}
            .ai-typing-avatar{width:36px;height:36px;background:linear-gradient(135deg,var(--c-primary),var(--c-light));border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 4px 12px ${hexToRgba(CONFIG.primaryColor,0.25)}}
            .ai-typing-bubble{background:#fff;padding:18px 22px;border-radius:20px 20px 20px 6px;box-shadow:0 2px 12px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.04);display:flex;gap:6px;align-items:center}
            .ai-typing-dot{width:8px;height:8px;background:var(--c-primary);border-radius:50%;animation:ai-wave 1.4s infinite}
            .ai-typing-dot:nth-child(2){animation-delay:.15s}
            .ai-typing-dot:nth-child(3){animation-delay:.3s}
            @keyframes ai-wave{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-10px);opacity:1}}
            .ai-streaming::after{content:'▋';animation:ai-blink .8s infinite;margin-left:2px;color:var(--c-primary)}
            @keyframes ai-blink{0%,50%{opacity:1}51%,100%{opacity:0}}
            
            /* Input Area */
            #ai-chat-input-area{padding:20px 24px;background:#fff;border-top:1px solid #f1f5f9;display:flex;gap:12px;align-items:flex-end}
            #ai-chat-input{flex:1;padding:14px 20px;border:2px solid #e2e8f0;border-radius:18px;font-size:14px;outline:none;resize:none;font-family:inherit;line-height:1.5;max-height:120px;min-height:48px;background:#f8f9fc;transition:border-color 0.3s ease,box-shadow 0.3s ease,background 0.3s ease,height 0.15s ease}
            #ai-chat-input:focus{border-color:var(--c-primary);box-shadow:0 0 0 4px ${hexToRgba(CONFIG.primaryColor,0.1)};background:#fff}
            #ai-chat-input::placeholder{color:#94a3b8}
            #ai-chat-send{width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,var(--c-primary),var(--c-light));border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s ease;flex-shrink:0;box-shadow:0 4px 12px ${hexToRgba(CONFIG.primaryColor,0.3)}}
            #ai-chat-send:hover:not(:disabled){transform:scale(1.05);box-shadow:0 6px 20px ${hexToRgba(CONFIG.primaryColor,0.4)}}
            #ai-chat-send:active:not(:disabled){transform:scale(0.95)}
            #ai-chat-send:disabled{background:#e2e8f0;cursor:not-allowed;box-shadow:none}
            #ai-chat-send svg{width:22px;height:22px;fill:#fff;transition:transform .2s ease}
            #ai-chat-send:hover:not(:disabled) svg{transform:translateX(2px)}
            
            /* Footer */
            .ai-powered{text-align:center;padding:14px 24px;font-size:12px;color:#94a3b8;background:#f8f9fc;border-top:1px solid #f1f5f9}
            .ai-powered a{color:var(--c-primary);text-decoration:none;font-weight:600;transition:color .2s}
            .ai-powered a:hover{color:var(--c-dark);text-decoration:underline}
            
            /* Mobile */
            @media(max-width:480px){#ai-chat-widget{bottom:16px;${CONFIG.position}:16px}#ai-chat-window{width:calc(100vw - 32px);height:calc(100vh - 100px);bottom:76px;border-radius:20px}#ai-chat-toggle{width:56px;height:56px}.ai-popup-bubble{bottom:68px}}
        `;
        document.head.appendChild(style);
    }

    function injectHTML() {
        const widget = document.createElement('div');
        widget.id = 'ai-chat-widget';
        widget.innerHTML = `
            <div id="ai-chat-window">
                <div id="ai-chat-header">
                    <div class="ai-header-content">
                        <div class="ai-header-avatar">${CONFIG.botAvatar}</div>
                        <div class="ai-header-info">
                            <h3>${CONFIG.botName}</h3>
                            <div class="ai-header-status"><span class="ai-status-dot"></span><span>Online</span></div>
                        </div>
                        <button class="ai-header-close" title="Close chat">
                            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                    </div>
                </div>
                <div id="ai-chat-messages"></div>
                <div id="ai-chat-input-area">
                    <textarea id="ai-chat-input" placeholder="Type a message..." rows="1"></textarea>
                    <button id="ai-chat-send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
                </div>
                <div class="ai-powered">Powered by <a href="https://aiserviceboost.com" target="_blank">AI Service Boost</a></div>
            </div>
            <div class="ai-popup-bubble">
                ${CONFIG.popupMessage}
                <button class="close-popup">×</button>
            </div>
            <button id="ai-chat-toggle">
                <div class="ai-toggle-icon">
                    <svg class="icon-chat" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h10v2H7zm0-3h10v2H7z"/></svg>
                    <svg class="icon-close" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </div>
            </button>
        `;
        document.body.appendChild(widget);
        return widget;
    }

    function initChat(widget) {
        const toggle = widget.querySelector('#ai-chat-toggle');
        const headerClose = widget.querySelector('.ai-header-close');
        const input = widget.querySelector('#ai-chat-input');
        const sendBtn = widget.querySelector('#ai-chat-send');
        const messages = widget.querySelector('#ai-chat-messages');
        const popupBubble = widget.querySelector('.ai-popup-bubble');
        const closePopup = widget.querySelector('.close-popup');

        function closeChat() {
            isOpen = false;
            widget.classList.remove('open');
        }

        function openChat() {
            isOpen = true;
            widget.classList.add('open');
            popupBubble.classList.remove('show');
            setTimeout(() => input.focus(), 300);
        }

        toggle.addEventListener('click', () => {
            if (isOpen) closeChat();
            else openChat();
        });

        headerClose.addEventListener('click', closeChat);

        closePopup.addEventListener('click', (e) => {
            e.stopPropagation();
            popupBubble.classList.remove('show');
        });

        setTimeout(() => {
            if (!isOpen && !popupShown) {
                popupBubble.classList.add('show');
                popupShown = true;
            }
        }, CONFIG.popupDelay);

        popupBubble.addEventListener('click', openChat);

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
        
        // Smooth textarea resize
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            const newHeight = Math.min(input.scrollHeight, 120);
            input.style.height = newHeight + 'px';
        });

        setTimeout(() => addMessage(CONFIG.welcomeMessage, 'bot'), 500);

        function scrollToBottom() { messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' }); }

        function addMessage(text, type) {
            const wrap = document.createElement('div');
            wrap.className = `ai-msg-wrap ${type}`;
            wrap.innerHTML = `<div class="ai-msg-bubble">${text}</div><div class="ai-msg-time">${formatTime(new Date())}</div>`;
            messages.appendChild(wrap);
            scrollToBottom();
            return wrap;
        }

        async function addMessageStreaming(text) {
            const wrap = document.createElement('div');
            wrap.className = 'ai-msg-wrap bot';
            const bubble = document.createElement('div');
            bubble.className = 'ai-msg-bubble ai-streaming';
            wrap.appendChild(bubble);
            messages.appendChild(wrap);
            scrollToBottom();

            for (let i = 0; i <= text.length; i++) {
                bubble.textContent = text.substring(0, i);
                scrollToBottom();
                await sleep(CONFIG.streamingSpeed);
            }
            bubble.classList.remove('ai-streaming');
            const time = document.createElement('div');
            time.className = 'ai-msg-time';
            time.textContent = formatTime(new Date());
            wrap.appendChild(time);
            return wrap;
        }

        function showTyping() {
            const el = document.createElement('div');
            el.className = 'ai-typing';
            el.innerHTML = `<div class="ai-typing-avatar">${CONFIG.botAvatar}</div><div class="ai-typing-bubble"><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div></div>`;
            messages.appendChild(el);
            scrollToBottom();
            return el;
        }

        async function sendMessage() {
            const text = input.value.trim();
            if (!text || isProcessing) return;

            isProcessing = true;
            sendBtn.disabled = true;
            addMessage(text, 'user');
            input.value = '';
            input.style.height = 'auto';

            const typing = showTyping();

            try {
                let response;
                if (CONFIG.webhookUrl) {
                    const res = await fetch(CONFIG.webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: text, sessionId, timestamp: new Date().toISOString() })
                    });
                    const data = await res.json();
                    response = data.output || data.response || data.message || data.text || JSON.stringify(data);
                } else {
                    await sleep(1500);
                    response = 'Widget is working! Set data-webhook to connect to your AI backend.';
                }
                typing.remove();
                await addMessageStreaming(response);
            } catch (err) {
                typing.remove();
                addMessage('Something went wrong. Please try again.', 'error');
            }

            isProcessing = false;
            sendBtn.disabled = false;
            input.focus();
        }
    }

    function init() {
        injectStyles();
        const widget = injectHTML();
        initChat(widget);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
