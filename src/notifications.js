// ============================================================
// NOTIFICATIONS MODULE
// ============================================================
// Handles desktop notification scheduling, permission management,
// and notification preferences. Uses the Notification API directly
// but structured so Service Worker push can be added later.

const NOTIF_PREFS_KEY = 'wb_notification_prefs';

const DEFAULT_NOTIF_PREFS = {
  enabled: false,
  dueSoon: true,
  overdue: true,
  dailyBriefing: true,
};

/**
 * Factory function to create notifications module.
 * @param {Object} deps - Dependencies from the main app
 * @returns {{ init, scheduleNotifications, sendNotification, clearScheduled, requestPermission, getPrefs, savePrefs, renderNotificationSettings, isSupported }}
 */
export function createNotifications(deps) {
  const { getData, userKey, showToast, findTask } = deps;

  let _permissionState = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
  let _scheduledTimers = [];
  const _notifiedTags = new Set(); // prevent duplicate notifications per session
  let _initialized = false;

  // -- Preferences -------------------------------------------------------
  function _prefsKey() {
    return userKey(NOTIF_PREFS_KEY);
  }

  function getPrefs() {
    try {
      const raw = localStorage.getItem(_prefsKey());
      if (raw) return { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(raw) };
    } catch (_e) {
      /* use defaults */
    }
    return { ...DEFAULT_NOTIF_PREFS };
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem(_prefsKey(), JSON.stringify(prefs));
    } catch (_e) {
      /* silent */
    }
  }

  // -- Support check -----------------------------------------------------
  function isSupported() {
    return typeof Notification !== 'undefined';
  }

  // -- Permission --------------------------------------------------------
  function init() {
    if (_initialized) return;
    _initialized = true;
    if (isSupported()) {
      _permissionState = Notification.permission;
    }
  }

  async function requestPermission() {
    if (!isSupported()) {
      showToast('Notifications are not supported in this browser', true);
      return 'denied';
    }
    if (Notification.permission === 'granted') {
      _permissionState = 'granted';
      return 'granted';
    }
    if (Notification.permission === 'denied') {
      _permissionState = 'denied';
      showToast('Notifications are blocked. Please enable them in your browser settings.', true);
      return 'denied';
    }
    try {
      const result = await Notification.requestPermission();
      _permissionState = result;
      if (result === 'granted') {
        showToast('Notifications enabled');
      } else if (result === 'denied') {
        showToast('Notifications blocked. You can re-enable them in browser settings.', true);
      }
      return result;
    } catch (_e) {
      return 'denied';
    }
  }

  // -- Push subscription (v8) ---------------------------------------------
  async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) return existing;

      // Generate VAPID public key — stored in env, fallback to localStorage
      const vapidKey = localStorage.getItem('wb_vapid_public_key');
      if (!vapidKey) return null;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(vapidKey),
      });
      return sub;
    } catch (err) {
      console.warn('Push subscription failed:', err);
      return null;
    }
  }

  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function savePushSubscription(subscription) {
    if (!subscription || !deps.sb || !deps.getCurrentUser) return;
    const user = deps.getCurrentUser();
    if (!user) return;
    try {
      await deps.sb.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          subscription: JSON.stringify(subscription),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' },
      );
    } catch (err) {
      console.warn('Failed to save push subscription:', err);
    }
  }

  async function setupPush() {
    if (_permissionState !== 'granted') return;
    const sub = await subscribeToPush();
    if (sub) await savePushSubscription(sub);
  }

  // -- Send notification -------------------------------------------------
  function sendNotification(title, body, options = {}) {
    if (!isSupported() || _permissionState !== 'granted') return null;

    const tag = options.tag || title;
    if (_notifiedTags.has(tag)) return null;
    _notifiedTags.add(tag);

    try {
      const n = new Notification(title, {
        body,
        icon: options.icon || '/icon-192.png',
        tag,
        requireInteraction: false,
        ...options,
      });

      n.onclick = () => {
        window.focus();
        if (options.taskId && findTask) {
          const task = findTask(options.taskId);
          if (task) {
            // Expand the task if possible -- dispatch a custom event
            window.dispatchEvent(new CustomEvent('notification-task-click', { detail: { taskId: options.taskId } }));
          }
        }
        n.close();
      };

      // Auto-close after 10 seconds
      setTimeout(() => {
        try {
          n.close();
        } catch (_e) {
          /* already closed */
        }
      }, 10000);

      return n;
    } catch (_e) {
      console.warn('Notification creation failed:', _e.message || _e);
      return null;
    }
  }

  // -- Clear scheduled ---------------------------------------------------
  function clearScheduled() {
    _scheduledTimers.forEach((id) => clearTimeout(id));
    _scheduledTimers = [];
    _notifiedTags.clear();
  }

  // -- Schedule notifications --------------------------------------------
  function scheduleNotifications() {
    clearScheduled();

    if (!isSupported() || _permissionState !== 'granted') return;

    const prefs = getPrefs();
    if (!prefs.enabled) return;

    const data = getData();
    if (!data || !data.tasks) return;

    const now = Date.now();
    const activeTasks = data.tasks.filter((t) => t.status !== 'done' && !t.archived);

    // -- Due soon & overdue notifications --------------------------------
    if (prefs.dueSoon || prefs.overdue) {
      activeTasks.forEach((t) => {
        if (!t.dueDate) return;

        // Parse the due date -- assume end of day (23:59) for due dates
        const dueTime = new Date(t.dueDate + 'T23:59:59').getTime();
        const msUntilDue = dueTime - now;

        if (prefs.dueSoon) {
          // Due in ~1 hour (schedule if between now and 1 hour from now)
          const oneHourMs = 60 * 60 * 1000;
          if (msUntilDue > 0 && msUntilDue <= oneHourMs) {
            // Fire immediately if within window
            const delay = Math.max(0, msUntilDue - oneHourMs);
            const timerId = setTimeout(() => {
              sendNotification('\u23F0 Due in 1 hour', t.title, { tag: 'due-1h-' + t.id, taskId: t.id });
            }, delay);
            _scheduledTimers.push(timerId);
          } else if (msUntilDue > oneHourMs && msUntilDue <= oneHourMs + 60000) {
            // Schedule for when it becomes 1 hour away
            const timerId = setTimeout(() => {
              sendNotification('\u23F0 Due in 1 hour', t.title, { tag: 'due-1h-' + t.id, taskId: t.id });
            }, msUntilDue - oneHourMs);
            _scheduledTimers.push(timerId);
          }

          // Due in ~15 minutes
          const fifteenMinMs = 15 * 60 * 1000;
          if (msUntilDue > 0 && msUntilDue <= fifteenMinMs) {
            const timerId = setTimeout(() => {
              sendNotification('\uD83D\uDD25 Due in 15 minutes!', t.title, { tag: 'due-15m-' + t.id, taskId: t.id });
            }, 0);
            _scheduledTimers.push(timerId);
          } else if (msUntilDue > fifteenMinMs && msUntilDue <= fifteenMinMs + 60000) {
            const timerId = setTimeout(() => {
              sendNotification('\uD83D\uDD25 Due in 15 minutes!', t.title, { tag: 'due-15m-' + t.id, taskId: t.id });
            }, msUntilDue - fifteenMinMs);
            _scheduledTimers.push(timerId);
          }
        }

        // Overdue notification -- task just became overdue
        if (prefs.overdue && msUntilDue < 0 && msUntilDue > -60000) {
          // Just became overdue (within last minute)
          const timerId = setTimeout(() => {
            sendNotification('\u2757 Task overdue', t.title, { tag: 'overdue-' + t.id, taskId: t.id });
          }, 0);
          _scheduledTimers.push(timerId);
        } else if (prefs.overdue && msUntilDue > 0 && msUntilDue <= 60000) {
          // About to become overdue -- schedule for the moment
          const timerId = setTimeout(() => {
            sendNotification('\u2757 Task overdue', t.title, { tag: 'overdue-' + t.id, taskId: t.id });
          }, msUntilDue);
          _scheduledTimers.push(timerId);
        }
      });
    }

    // -- Daily briefing notifications ------------------------------------
    if (prefs.dailyBriefing) {
      const today = new Date();

      // Morning briefing at 9am
      const morning = new Date(today);
      morning.setHours(9, 0, 0, 0);
      const msToMorning = morning.getTime() - now;
      if (msToMorning > 0 && msToMorning < 24 * 60 * 60 * 1000) {
        const taskCount = activeTasks.length;
        if (taskCount > 0) {
          const timerId = setTimeout(() => {
            sendNotification(
              '\u2600\uFE0F Good morning!',
              'You have ' + taskCount + ' task' + (taskCount !== 1 ? 's' : '') + ' today',
              { tag: 'morning-briefing' },
            );
          }, msToMorning);
          _scheduledTimers.push(timerId);
        }
      }

      // End of day at 5pm
      const evening = new Date(today);
      evening.setHours(17, 0, 0, 0);
      const msToEvening = evening.getTime() - now;
      if (msToEvening > 0 && msToEvening < 24 * 60 * 60 * 1000) {
        const todayStr =
          today.getFullYear() +
          '-' +
          String(today.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(today.getDate()).padStart(2, '0');
        const completedToday = data.tasks.filter(
          (t) => t.status === 'done' && t.completedAt && t.completedAt.slice(0, 10) === todayStr,
        ).length;
        const remaining = activeTasks.length;
        const timerId = setTimeout(() => {
          sendNotification(
            '\uD83D\uDCCB Time to wrap up',
            completedToday +
              ' task' +
              (completedToday !== 1 ? 's' : '') +
              ' completed today, ' +
              remaining +
              ' remaining',
            { tag: 'eod-briefing' },
          );
        }, msToEvening);
        _scheduledTimers.push(timerId);
      }
    }
  }

  // -- Settings UI HTML --------------------------------------------------
  function renderNotificationSettings() {
    const prefs = getPrefs();
    const supported = isSupported();
    const permDenied = _permissionState === 'denied';

    if (!supported) {
      return (
        '<div style="margin-bottom:16px">' +
        '<label class="form-label">Notifications</label>' +
        '<p style="font-size:11px;color:var(--text3)">Desktop notifications are not supported in this browser.</p>' +
        '</div>'
      );
    }

    let html =
      '<div style="margin-bottom:16px;border-top:1px solid var(--border);padding-top:16px">' +
      '<label class="form-label" style="margin-bottom:8px">Notifications</label>' +
      '<p style="font-size:11px;color:var(--text3);margin-bottom:10px">Get reminders when tasks are due or overdue. Notifications only work while the app is open.</p>';

    if (permDenied && Notification.permission === 'denied') {
      html +=
        '<div style="font-size:11px;color:var(--red);margin-bottom:8px;padding:8px;background:rgba(239,68,68,0.08);border-radius:var(--radius-xs)">' +
        'Notifications are blocked by your browser. To re-enable: open browser settings &rarr; Site settings &rarr; Notifications &rarr; Allow for this site.' +
        '</div>';
    }

    html +=
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text2)">' +
      '<input type="checkbox" id="notifEnabled" ' +
      (prefs.enabled ? 'checked' : '') +
      ' data-action="toggle-notif-enabled" style="accent-color:var(--accent)">' +
      ' Enable desktop notifications' +
      '</label></div>';

    if (prefs.enabled) {
      html +=
        '<div style="padding-left:24px;display:flex;flex-direction:column;gap:6px">' +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text3)">' +
        '<input type="checkbox" id="notifDueSoon" ' +
        (prefs.dueSoon ? 'checked' : '') +
        ' data-action="toggle-notif-sub" data-notif-key="dueSoon" style="accent-color:var(--accent)">' +
        ' Due soon reminders</label>' +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text3)">' +
        '<input type="checkbox" id="notifOverdue" ' +
        (prefs.overdue ? 'checked' : '') +
        ' data-action="toggle-notif-sub" data-notif-key="overdue" style="accent-color:var(--accent)">' +
        ' Overdue alerts</label>' +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text3)">' +
        '<input type="checkbox" id="notifDailyBriefing" ' +
        (prefs.dailyBriefing ? 'checked' : '') +
        ' data-action="toggle-notif-sub" data-notif-key="dailyBriefing" style="accent-color:var(--accent)">' +
        ' Daily briefing (9am &amp; 5pm)</label>' +
        '</div>';
    }

    html += '</div>';
    return html;
  }

  return {
    init,
    scheduleNotifications,
    sendNotification,
    clearScheduled,
    requestPermission,
    getPrefs,
    savePrefs,
    renderNotificationSettings,
    isSupported,
    setupPush,
    subscribeToPush,
    // Exposed for testing
    _getPermissionState: () => _permissionState,
    _setPermissionState: (s) => {
      _permissionState = s;
    },
    _getScheduledTimers: () => _scheduledTimers,
    _getNotifiedTags: () => _notifiedTags,
  };
}
