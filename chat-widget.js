/**
 * AI Service Boost Chat Widget
 * © 2025 AI Service Boost. All rights reserved.
 * Unauthorized copying, modification, or distribution is prohibited.
 * Contact: https://aiserviceboost.com
 */
(function() {
    'use strict';

    // Domain whitelist - widget only works on these domains
    const ALLOWED_DOMAINS = [
        'aiserviceboost.com',
        'www.aiserviceboost.com',
        'localhost',
        '127.0.0.1'
        // Add client domains here: 'client-website.com'
    ];

    const currentDomain = window.location.hostname;
    const isAllowed = ALLOWED_DOMAINS.some(domain => 
        currentDomain === domain || currentDomain.endsWith('.' + domain)
    );

    if (!isAllowed) {
        console.warn('AI Chat Widget: Domain not authorized. Contact AI Service Boost for access.');
        return;
    }

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
        quickReplies: [
            'What services do you offer?',
            'I\'m interested in your services',
            'I\'d like to schedule a call'
        ],
    };

    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    let isOpen = false;
    let isProcessing = false;
    let popupShown = false;
    let quickRepliesShown = false;

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
    
    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Convert URLs and markdown links to clickable links
    function linkify(text) {
        // Clean up malformed markdown from AI
        let cleaned = text
            .replace(/\]?\(_*(?=https?:\/\/)/g, '](')  // Fix ](__http or (__http
            .replace(/_+\)/g, ')')  // Remove underscores before )
            .replace(/\)_+\.*/g, ')')  // Remove ).__  or )__. patterns
            .replace(/__+/g, '')  // Remove any remaining underscores
            .replace(/\)\.+/g, ')')  // Remove trailing dots after )
            .trim();
        
        const escaped = escapeHtml(cleaned);
        
        // Convert markdown links [text](url) to HTML
        const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
        let result = escaped.replace(markdownLinkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // Convert plain URLs that aren't already in links
        const plainUrlRegex = /(^|[^"'>])(https?:\/\/[^\s<]+)/g;
        result = result.replace(plainUrlRegex, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
        
        return result;
    }
    
    // Calculate realistic typing delay based on text length
    function getTypingDelay(textLength) {
        // Base: 15ms per char, but slower for longer texts (more realistic)
        // Short (<50): ~15ms/char = 750ms total
        // Medium (50-150): ~20ms/char = 2-3s total  
        // Long (>150): ~12ms/char but with 2s base = 3-5s total
        if (textLength < 50) {
            return { perChar: 18, baseDelay: 300 };
        } else if (textLength < 150) {
            return { perChar: 15, baseDelay: 500 };
        } else if (textLength < 300) {
            return { perChar: 10, baseDelay: 800 };
        } else {
            return { perChar: 6, baseDelay: 1000 };
        }
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'ai-chat-widget-styles-v7';
        style.textContent = `
            #ai-chat-widget {
                --c-primary: ${CONFIG.primaryColor};
                --c-light: ${adjustColor(CONFIG.primaryColor, 20)};
                --c-dark: ${adjustColor(CONFIG.primaryColor, -15)};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                position: fixed;
                bottom: 24px;
                ${CONFIG.position}: 24px;
                z-index: 99999;
            }
            #ai-chat-widget * {
                box-sizing: border-box;
                margin: 0;
            }
            
            #ai-chat-toggle {
                width: 64px;
                height: 64px;
                border-radius: 50%;
                background: linear-gradient(135deg, var(--c-primary), var(--c-light));
                border: none;
                cursor: pointer;
                box-shadow: 0 8px 32px ${hexToRgba(CONFIG.primaryColor, 0.4)};
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                position: relative;
                overflow: hidden;
            }
            #ai-chat-toggle:hover {
                transform: scale(1.1);
                box-shadow: 0 12px 40px ${hexToRgba(CONFIG.primaryColor, 0.5)};
            }
            #ai-chat-toggle::before {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(135deg, rgba(255,255,255,0.2), transparent 50%);
                border-radius: 50%;
            }
            .ai-toggle-icon {
                width: 28px;
                height: 28px;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .ai-toggle-icon svg {
                width: 28px;
                height: 28px;
                fill: #fff;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                transition: all 0.3s ease;
            }
            .ai-toggle-icon .icon-chat {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            .ai-toggle-icon .icon-close {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.5) rotate(-90deg);
            }
            #ai-chat-widget.open .icon-chat {
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.5) rotate(90deg);
            }
            #ai-chat-widget.open .icon-close {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1) rotate(0);
            }
            @keyframes ai-pulse {
                0%, 100% { box-shadow: 0 8px 32px ${hexToRgba(CONFIG.primaryColor, 0.4)}; }
                50% { box-shadow: 0 8px 32px ${hexToRgba(CONFIG.primaryColor, 0.4)}, 0 0 0 12px ${hexToRgba(CONFIG.primaryColor, 0)}; }
            }
            #ai-chat-widget:not(.open) #ai-chat-toggle {
                animation: ai-pulse 3s ease-in-out infinite;
            }
            #ai-chat-widget.open #ai-chat-toggle {
                animation: none;
            }
            
            .ai-popup-bubble {
                position: absolute;
                bottom: 80px;
                ${CONFIG.position}: 0;
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                padding: 18px 28px;
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12);
                font-size: 15px;
                font-weight: 500;
                color: #1a1a2e;
                white-space: nowrap;
                opacity: 0;
                transform: translateY(10px) scale(0.9);
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                pointer-events: none;
                border: 1px solid rgba(255,255,255,0.6);
            }
            .ai-popup-bubble::after {
                content: '';
                position: absolute;
                bottom: -10px;
                ${CONFIG.position}: 28px;
                width: 0;
                height: 0;
                border-left: 10px solid transparent;
                border-right: 10px solid transparent;
                border-top: 10px solid rgba(255, 255, 255, 0.95);
            }
            .ai-popup-bubble.show {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }
            .ai-popup-bubble .close-popup {
                position: absolute;
                top: -10px;
                right: -10px;
                width: 24px;
                height: 24px;
                background: #fff;
                border: 1px solid #e2e8f0;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                color: #64748b;
                line-height: 1;
                transition: all 0.2s;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .ai-popup-bubble .close-popup:hover {
                background: #f8f9fc;
                color: #1a1a2e;
                transform: scale(1.1);
            }
            #ai-chat-widget.open .ai-popup-bubble {
                opacity: 0;
                transform: translateY(10px) scale(0.9);
                pointer-events: none;
            }

            /* Glassmorphism Chat Window */
            #ai-chat-window {
                position: absolute;
                bottom: 80px;
                ${CONFIG.position}: 0;
                width: 400px;
                height: 600px;
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border-radius: 24px;
                box-shadow: 0 25px 60px -12px rgba(0,0,0,0.25);
                border: 1px solid rgba(255,255,255,0.6);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                opacity: 0;
                visibility: hidden;
                transform: translateY(20px) scale(0.9);
                transform-origin: bottom ${CONFIG.position};
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            #ai-chat-widget.open #ai-chat-window {
                opacity: 1;
                visibility: visible;
                transform: translateY(0) scale(1);
            }
            
            /* Smaller Header */
            #ai-chat-header {
                background: linear-gradient(135deg, var(--c-primary) 0%, var(--c-light) 100%);
                padding: 14px 18px;
                color: #fff;
                position: relative;
                overflow: hidden;
            }
            #ai-chat-header::before {
                content: '';
                position: absolute;
                top: -50%;
                right: -30%;
                width: 80%;
                height: 200%;
                background: radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 60%);
                pointer-events: none;
            }
            .ai-header-content {
                display: flex;
                align-items: center;
                gap: 12px;
                position: relative;
                z-index: 1;
            }
            .ai-header-avatar {
                width: 42px;
                height: 42px;
                background: rgba(255,255,255,0.2);
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                border: 1px solid rgba(255,255,255,0.1);
            }
            .ai-header-info {
                flex: 1;
            }
            .ai-header-info h3 {
                font-size: 16px;
                font-weight: 700;
            }
            .ai-header-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                opacity: 0.95;
                margin-top: 2px;
            }
            .ai-status-dot {
                width: 7px;
                height: 7px;
                background: #4ade80;
                border-radius: 50%;
                animation: ai-statusPulse 2s infinite;
            }
            @keyframes ai-statusPulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.7; transform: scale(0.85); }
            }
            
            .ai-header-close {
                width: 32px;
                height: 32px;
                background: rgba(255,255,255,0.15);
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            .ai-header-close:hover {
                background: rgba(255,255,255,0.25);
                transform: scale(1.05);
            }
            .ai-header-close svg {
                width: 16px;
                height: 16px;
                fill: #fff;
            }
            
            #ai-chat-messages {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                background: linear-gradient(180deg, rgba(248,249,252,0.9) 0%, rgba(255,255,255,0.9) 100%);
                scroll-behavior: smooth;
            }
            #ai-chat-messages::-webkit-scrollbar {
                width: 6px;
            }
            #ai-chat-messages::-webkit-scrollbar-thumb {
                background: #e2e8f0;
                border-radius: 3px;
            }
            
            .ai-msg-wrap {
                display: flex;
                flex-direction: column;
                gap: 4px;
                opacity: 0;
                transform: translateY(20px) scale(0.95);
                animation: ai-msgBounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
            @keyframes ai-msgBounceIn {
                0% { opacity: 0; transform: translateY(30px) scale(0.9); }
                50% { opacity: 1; transform: translateY(-5px) scale(1.02); }
                70% { transform: translateY(3px) scale(0.99); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            .ai-msg-wrap.user {
                align-items: flex-end;
            }
            .ai-msg-wrap.bot {
                align-items: flex-start;
            }
            
            .ai-msg-bubble {
                max-width: 85%;
                padding: 10px 16px;
                font-size: 14px;
                line-height: 1.6;
                word-wrap: break-word;
            }
            .ai-msg-bubble a {
                color: inherit;
                text-decoration: underline;
                word-break: break-all;
            }
            .ai-msg-bubble a:hover {
                opacity: 0.8;
            }
            .ai-msg-wrap.user .ai-msg-bubble {
                background: linear-gradient(135deg, var(--c-primary), var(--c-light));
                color: #fff;
                border-radius: 18px 18px 4px 18px;
                box-shadow: 0 4px 16px ${hexToRgba(CONFIG.primaryColor, 0.25)};
            }
            .ai-msg-wrap.bot .ai-msg-bubble {
                background: rgba(255,255,255,0.95);
                backdrop-filter: blur(10px);
                color: #1a1a2e;
                border-radius: 18px 18px 18px 4px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.06);
                border: 1px solid rgba(0,0,0,0.04);
            }
            .ai-msg-wrap.error .ai-msg-bubble {
                background: #fef2f2;
                color: #dc2626;
                border: 1px solid #fecaca;
            }
            .ai-msg-meta {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 0 8px;
            }
            .ai-msg-time {
                font-size: 11px;
                color: #94a3b8;
                opacity: 0;
                animation: ai-fadeIn 0.3s ease 0.3s forwards;
            }
            .ai-msg-seen {
                font-size: 12px;
                color: var(--c-primary);
                opacity: 0;
                animation: ai-fadeIn 0.3s ease 0.5s forwards;
            }
            @keyframes ai-fadeIn {
                to { opacity: 1; }
            }
            
            /* Quick Replies */
            .ai-quick-replies {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding: 4px 0;
                opacity: 0;
                animation: ai-fadeIn 0.4s ease 0.3s forwards;
            }
            .ai-quick-reply {
                background: rgba(255,255,255,0.9);
                backdrop-filter: blur(10px);
                border: 1px solid ${hexToRgba(CONFIG.primaryColor, 0.3)};
                color: var(--c-primary);
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                white-space: nowrap;
            }
            .ai-quick-reply:hover {
                background: var(--c-primary);
                color: #fff;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px ${hexToRgba(CONFIG.primaryColor, 0.3)};
            }
            .ai-quick-reply:active {
                transform: translateY(0);
            }
            
            /* Typing - Bounce Animation */
            .ai-typing {
                display: flex;
                align-items: flex-end;
                gap: 10px;
                opacity: 0;
                animation: ai-msgBounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
            .ai-typing-avatar {
                width: 32px;
                height: 32px;
                background: linear-gradient(135deg, var(--c-primary), var(--c-light));
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            }
            .ai-typing-bubble {
                background: rgba(255,255,255,0.95);
                backdrop-filter: blur(10px);
                padding: 14px 18px;
                border-radius: 18px 18px 18px 4px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.06);
                border: 1px solid rgba(0,0,0,0.04);
                display: flex;
                gap: 5px;
                align-items: center;
            }
            .ai-typing-dot {
                width: 8px;
                height: 8px;
                background: var(--c-primary);
                border-radius: 50%;
                animation: ai-bounce 1.4s ease-in-out infinite;
            }
            .ai-typing-dot:nth-child(2) { animation-delay: 0.2s; }
            .ai-typing-dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes ai-bounce {
                0%, 80%, 100% { 
                    transform: translateY(0) scale(1);
                    opacity: 0.5;
                }
                40% { 
                    transform: translateY(-12px) scale(1.1);
                    opacity: 1;
                }
            }
            .ai-streaming::after {
                content: '▋';
                animation: ai-blink 0.8s infinite;
                margin-left: 2px;
                color: var(--c-primary);
            }
            @keyframes ai-blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0; }
            }
            
            #ai-chat-input-area {
                padding: 16px 20px;
                background: rgba(255,255,255,0.9);
                backdrop-filter: blur(10px);
                border-top: 1px solid rgba(241,245,249,0.8);
                display: flex;
                gap: 12px;
                align-items: flex-end;
            }
            #ai-chat-input {
                flex: 1;
                padding: 12px 18px;
                border: 2px solid #e2e8f0;
                border-radius: 20px;
                font-size: 14px;
                outline: none;
                resize: none;
                font-family: inherit;
                line-height: 1.5;
                max-height: 120px;
                height: 48px;
                background: rgba(248,249,252,0.8);
                transition: border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
                overflow: hidden;
            }
            #ai-chat-input:focus {
                border-color: var(--c-primary);
                box-shadow: 0 0 0 4px ${hexToRgba(CONFIG.primaryColor, 0.1)};
                background: #fff;
            }
            #ai-chat-input::placeholder {
                color: #94a3b8;
            }
            #ai-chat-input.multiline {
                overflow-y: auto;
            }
            #ai-chat-send {
                width: 48px;
                height: 48px;
                border-radius: 14px;
                background: linear-gradient(135deg, var(--c-primary), var(--c-light));
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                flex-shrink: 0;
                box-shadow: 0 4px 12px ${hexToRgba(CONFIG.primaryColor, 0.3)};
                position: relative;
                overflow: hidden;
            }
            #ai-chat-send::after {
                content: '';
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at center, rgba(255,255,255,0.3) 0%, transparent 70%);
                opacity: 0;
                transform: scale(0);
                transition: all 0.4s ease;
            }
            #ai-chat-send.sending::after {
                opacity: 1;
                transform: scale(2);
            }
            #ai-chat-send:hover:not(:disabled) {
                transform: scale(1.05);
                box-shadow: 0 6px 20px ${hexToRgba(CONFIG.primaryColor, 0.4)};
            }
            #ai-chat-send:active:not(:disabled) {
                transform: scale(0.95);
            }
            #ai-chat-send:disabled {
                background: #e2e8f0;
                cursor: not-allowed;
                box-shadow: none;
            }
            #ai-chat-send svg {
                width: 20px;
                height: 20px;
                fill: #fff;
                position: relative;
                z-index: 1;
                transition: transform 0.2s ease;
            }
            #ai-chat-send.sending svg {
                animation: ai-sendFly 0.4s ease forwards;
            }
            @keyframes ai-sendFly {
                0% { transform: translateX(0); }
                50% { transform: translateX(5px) scale(0.9); }
                100% { transform: translateX(0) scale(1); }
            }
            
            .ai-powered {
                text-align: center;
                padding: 12px 20px;
                font-size: 11px;
                color: #94a3b8;
                background: rgba(248,249,252,0.9);
                border-top: 1px solid rgba(241,245,249,0.8);
            }
            .ai-powered a {
                color: var(--c-primary);
                text-decoration: none;
                font-weight: 600;
            }
            .ai-powered a:hover {
                text-decoration: underline;
            }
            
            /* Tablet */
            @media (max-width: 768px) {
                #ai-chat-widget {
                    bottom: 20px;
                    ${CONFIG.position}: 20px;
                }
                #ai-chat-window {
                    width: 380px;
                    height: 550px;
                    bottom: 76px;
                    border-radius: 20px;
                }
                #ai-chat-toggle {
                    width: 60px;
                    height: 60px;
                }
                .ai-popup-bubble {
                    bottom: 72px;
                }
            }
            
            /* Mobile - Hide toggle when open, fullscreen chat */
            @media (max-width: 480px) {
                #ai-chat-widget {
                    bottom: 16px;
                    ${CONFIG.position}: 16px;
                }
                #ai-chat-widget.open #ai-chat-toggle {
                    opacity: 0;
                    pointer-events: none;
                    transform: scale(0);
                }
                #ai-chat-window {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    width: 100%;
                    height: 100%;
                    border-radius: 0;
                    max-height: 100%;
                }
                #ai-chat-toggle {
                    width: 56px;
                    height: 56px;
                }
                .ai-toggle-icon svg {
                    width: 24px;
                    height: 24px;
                }
                .ai-popup-bubble {
                    bottom: 68px;
                    ${CONFIG.position}: 0;
                    font-size: 14px;
                    padding: 14px 20px;
                }
                #ai-chat-header {
                    padding: 14px 16px;
                    border-radius: 0;
                }
                .ai-header-avatar {
                    width: 40px;
                    height: 40px;
                    font-size: 18px;
                }
                .ai-header-info h3 {
                    font-size: 15px;
                }
                .ai-header-close {
                    width: 36px;
                    height: 36px;
                }
                .ai-header-close svg {
                    width: 18px;
                    height: 18px;
                }
                #ai-chat-messages {
                    padding: 16px;
                    gap: 14px;
                }
                .ai-msg-bubble {
                    max-width: 88%;
                    padding: 10px 14px;
                    font-size: 15px;
                }
                .ai-quick-reply {
                    padding: 10px 16px;
                    font-size: 14px;
                }
                #ai-chat-input-area {
                    padding: 12px 16px;
                    gap: 10px;
                }
                #ai-chat-input {
                    padding: 12px 16px;
                    font-size: 16px;
                    height: 48px;
                }
                #ai-chat-send {
                    width: 48px;
                    height: 48px;
                }
                .ai-powered {
                    padding: 14px 16px;
                }
            }
            
            /* Small mobile */
            @media (max-width: 360px) {
                #ai-chat-header {
                    padding: 12px 14px;
                }
                .ai-header-avatar {
                    width: 36px;
                    height: 36px;
                    font-size: 16px;
                }
                .ai-header-content {
                    gap: 10px;
                }
                #ai-chat-messages {
                    padding: 12px;
                }
                .ai-msg-bubble {
                    padding: 8px 12px;
                    font-size: 14px;
                }
                #ai-chat-input-area {
                    padding: 10px 12px;
                }
            }
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
                <div class="ai-powered">⚡ Powered by <a href="https://aiserviceboost.com" target="_blank">AI Service Boost</a></div>
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

        const baseHeight = 48;

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

        toggle.addEventListener('click', () => isOpen ? closeChat() : openChat());
        headerClose.addEventListener('click', closeChat);
        closePopup.addEventListener('click', (e) => { e.stopPropagation(); popupBubble.classList.remove('show'); });
        
        setTimeout(() => {
            if (!isOpen && !popupShown) {
                popupBubble.classList.add('show');
                popupShown = true;
            }
        }, CONFIG.popupDelay);

        popupBubble.addEventListener('click', openChat);
        sendBtn.addEventListener('click', () => sendMessage());
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
        
        input.addEventListener('input', () => {
            input.style.height = baseHeight + 'px';
            const scrollHeight = input.scrollHeight;
            if (scrollHeight > baseHeight) {
                input.style.height = Math.min(scrollHeight, 120) + 'px';
                input.classList.add('multiline');
            } else {
                input.classList.remove('multiline');
            }
        });

        // Welcome message + quick replies
        setTimeout(() => {
            addMessage(CONFIG.welcomeMessage, 'bot');
            setTimeout(showQuickReplies, 400);
        }, 500);

        function scrollToBottom() { messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' }); }

        function addMessage(text, type) {
            const wrap = document.createElement('div');
            wrap.className = `ai-msg-wrap ${type}`;
            
            const bubble = document.createElement('div');
            bubble.className = 'ai-msg-bubble';
            bubble.innerHTML = linkify(text);
            
            const meta = document.createElement('div');
            meta.className = 'ai-msg-meta';
            
            const time = document.createElement('span');
            time.className = 'ai-msg-time';
            time.textContent = formatTime(new Date());
            meta.appendChild(time);
            
            // Add seen indicator for user messages
            if (type === 'user') {
                const seen = document.createElement('span');
                seen.className = 'ai-msg-seen';
                seen.textContent = '✓✓';
                meta.appendChild(seen);
            }
            
            wrap.appendChild(bubble);
            wrap.appendChild(meta);
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

            // Realistic typing speed based on length
            const { perChar, baseDelay } = getTypingDelay(text.length);
            await sleep(baseDelay);

            for (let i = 0; i <= text.length; i++) {
                bubble.innerHTML = linkify(text.substring(0, i));
                scrollToBottom();
                await sleep(perChar);
            }
            
            bubble.classList.remove('ai-streaming');
            bubble.innerHTML = linkify(text);
            
            const meta = document.createElement('div');
            meta.className = 'ai-msg-meta';
            const time = document.createElement('span');
            time.className = 'ai-msg-time';
            time.textContent = formatTime(new Date());
            meta.appendChild(time);
            wrap.appendChild(meta);
            
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
        
        function showQuickReplies() {
            if (quickRepliesShown) return;
            quickRepliesShown = true;
            
            const container = document.createElement('div');
            container.className = 'ai-quick-replies';
            
            CONFIG.quickReplies.forEach(text => {
                const btn = document.createElement('button');
                btn.className = 'ai-quick-reply';
                btn.textContent = text;
                btn.addEventListener('click', () => {
                    container.remove();
                    sendMessage(text);
                });
                container.appendChild(btn);
            });
            
            messages.appendChild(container);
            scrollToBottom();
        }

        async function sendMessage(text) {
            const messageText = text || input.value.trim();
            if (!messageText || isProcessing) return;

            // Remove quick replies when user sends first message
            const quickReplies = messages.querySelector('.ai-quick-replies');
            if (quickReplies) quickReplies.remove();

            isProcessing = true;
            sendBtn.disabled = true;
            sendBtn.classList.add('sending');
            
            setTimeout(() => sendBtn.classList.remove('sending'), 400);
            
            addMessage(messageText, 'user');
            input.value = '';
            input.style.height = baseHeight + 'px';
            input.classList.remove('multiline');

            const typing = showTyping();

            try {
                let response;
                if (CONFIG.webhookUrl) {
                    const res = await fetch(CONFIG.webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: messageText, sessionId, timestamp: new Date().toISOString() })
                    });
                    const data = await res.json();
                    response = data.output || data.response || data.message || data.text || JSON.stringify(data);
                } else {
                    await sleep(1500);
                    response = 'Widget is working! Check out https://aiserviceboost.com for more info.';
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
