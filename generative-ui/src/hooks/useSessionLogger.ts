import { useEffect } from 'react';

export interface SessionLog {
  eventType: 'user_message' | 'ai_response' | 'card_click' | 'show_all_results';
  value: any;
  timestamp: number;
}

// Persist logs to localStorage so an accidental refresh mid-session
// doesn't destroy a participant's research data.
const STORAGE_KEY = 'ux_genui_session_logs';

function loadPersistedLogs(): SessionLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionLog[]) : [];
  } catch {
    return [];
  }
}

// Global array to persist logs across re-renders
const sessionLogs: SessionLog[] = loadPersistedLogs();

function persistLogs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionLogs));
  } catch {
    // Storage full or unavailable — keep logging in memory only
  }
}

// Brief, unobtrusive confirmation for the researcher shortcuts (Shift+E saves,
// Shift+C clears). Self-contained overlay (no layout impact); auto-dismisses after 2s.
function showToast(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  el.setAttribute('role', 'status');
  el.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'left:50%',
    'transform:translateX(-50%) translateY(8px)',
    'background:#000',
    'color:#fff',
    'font-size:13px',
    'font-family:inherit',
    'padding:8px 18px',
    'border-radius:9999px',
    'z-index:2147483647',
    'opacity:0',
    'transition:opacity .2s ease, transform .2s ease',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(() => el.remove(), 220);
  }, 2000);
}

// Export/clear + the shortcut handler live at MODULE scope, not inside the hook.
// useSessionLogger() is called from several components at once (useGenChat,
// ChatView); when these were per-instance closures each mount registered its own
// keydown listener, so Shift+E downloaded one file per instance and Shift+C
// fired one toast per instance. One module-level handler = one listener.
function exportLogs() {
  if (sessionLogs.length === 0) {
    alert('No interaction logs recorded in this session yet.');
    return;
  }
  const blob = new Blob([JSON.stringify(sessionLogs, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ux_genui_session_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('[SessionLogger] Logs exported successfully.');
  showToast('Session saved');
}

// Reset between participants. sessionLogs is a module-level array shared by
// every hook instance, so it must be emptied IN PLACE — clearing only
// localStorage would let the next logged event persist the stale array back.
function clearLogs() {
  sessionLogs.length = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — the in-memory reset above still stands
  }
  console.log('[SessionLogger] Logs cleared.');
  showToast('Logs cleared');
}

// Researcher shortcuts: Shift+E saves the session, Shift+C clears it.
function handleShortcutKeyDown(e: KeyboardEvent) {
  // Shift alone — never with Ctrl/Cmd/Alt, or Ctrl+Shift+C (DevTools
  // inspector) and Ctrl+Shift+E (network panel) would fire these.
  if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const isSave = e.key === 'E' || e.key === 'e';
  const isClear = e.key === 'C' || e.key === 'c';
  if (!isSave && !isClear) return;

  // Never hijack a capital letter the participant is typing into the composer
  const activeEl = document.activeElement;
  if (
    activeEl &&
    (activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.getAttribute('contenteditable') === 'true')
  ) {
    return;
  }
  e.preventDefault();
  if (isSave) exportLogs();
  else clearLogs();
}

// Ref-count so the listener is bound once and only unbound by the last consumer.
let shortcutConsumers = 0;

export const useSessionLogger = () => {
  const logEvent = (eventType: SessionLog['eventType'], value: any) => {
    const logItem: SessionLog = {
      eventType,
      value,
      timestamp: Date.now(),
    };
    sessionLogs.push(logItem);
    persistLogs();
    console.log('[SessionLogger]', logItem);
  };

  const logUserMessage = (text: string) => {
    logEvent('user_message', text);
  };

  const logAiResponse = (intent: any) => {
    logEvent('ai_response', intent);
  };

  const logCardClick = (flightId: string) => {
    logEvent('card_click', flightId);
  };

  const logShowAllResults = (resultCount: number) => {
    logEvent('show_all_results', { resultCount });
  };

  useEffect(() => {
    shortcutConsumers += 1;
    if (shortcutConsumers === 1) window.addEventListener('keydown', handleShortcutKeyDown);
    return () => {
      shortcutConsumers -= 1;
      if (shortcutConsumers === 0) window.removeEventListener('keydown', handleShortcutKeyDown);
    };
  }, []);

  return {
    logUserMessage,
    logAiResponse,
    logCardClick,
    logShowAllResults,
    exportLogs,
    clearLogs,
    logs: sessionLogs,
  };
};
