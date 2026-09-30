// PocketResume Pro Service
// Clerk auth, plan checks, pricing table, and resume cloud sync via Convex.
// Bundled by esbuild into cloud-sync.js
// Usage: load via <script src="cloud-sync.js"> in options/tracker

(function () {
  'use strict';

  const CONFIG_KEYS = {
    resumes: 'resumes',
    cloudSyncStatus: 'cloudSyncStatus',
  };

  const ACCESS_CACHE_KEY = 'proAccessCache';
  const DELETED_KEY = 'deletedResumeIds';
  const MAX_RESUMES = 3;

  const CLOUD_CONFIG = {
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
    convexUrl: process.env.CONVEX_URL || '',
    freePlan: 'free_user',
    requiredPlan: 'pocketresume_pro',
    legacyPlans: ['cloud_sync', 'pro', 'premium'],
  };

  const PROMO_TRIAL = {
    enabled: true,
    start: new Date('2026-09-27T00:00:00').getTime(),
    end: new Date('2026-10-31T23:59:59.999').getTime(),
  };

  function isPromoTrialActive(now = Date.now()) {
    return PROMO_TRIAL.enabled && now >= PROMO_TRIAL.start && now <= PROMO_TRIAL.end;
  }

  let convexClient = null;
  let clerkClient = null;
  let convexUrl = null;
  let isInitialized = false;
  let syncInProgress = false;
  let authInfo = null;
  let clerkRebuildAt = 0;

  const EXTENSION_URL = chrome.runtime.getURL('.');
  const OPTIONS_URL = EXTENSION_URL + 'options.html';

  // clerk-js session touch rethrows non-auth errors (e.g. offline) from its
  // focus handler, surfacing as unhandled rejections. They are harmless —
  // Clerk retries on the next focus — so log and swallow them.
  globalThis.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason && event.reason.message ? String(event.reason.message) : String(event.reason || '');
    if (msg.startsWith('ClerkJS: Network error')) {
      event.preventDefault();
      console.warn('[CloudSync] Suppressed Clerk session touch network error:', msg);
    }
  });

  // --- Clerk Setup ---
  async function getClerkPublishableKey() {
    return CLOUD_CONFIG.clerkPublishableKey || null;
  }

  function userMatchesPlan(plans) {
    if (!clerkClient || !clerkClient.user) return false;
    if (clerkClient.session && typeof clerkClient.session.checkAuthorization === 'function') {
      try {
        for (const plan of plans) {
          if (clerkClient.session.checkAuthorization({ plan })) return true;
        }
      } catch (err) {
        console.warn('[CloudSync] Clerk billing authorization check failed, falling back to metadata:', err);
      }
    }
    const metadata = clerkClient.user.publicMetadata || {};
    const unsafeMetadata = clerkClient.user.unsafeMetadata || {};
    const plan = metadata.plan || unsafeMetadata.plan || '';
    const features = metadata.features || unsafeMetadata.features || [];
    return plans.includes(plan) || plans.some((p) => features.includes(p));
  }

  async function ensureClerkUser() {
    await init();
    if (clerkClient && clerkClient.user) return;
    if (typeof document !== 'undefined') return;
    if (Date.now() - clerkRebuildAt < 5000) return;
    clerkRebuildAt = Date.now();
    clerkClient = null;
    convexClient = null;
    authInfo = null;
    await init();
  }

  function persistAccessCache(state) {
    if (!state || !state.signedIn) return;
    try {
      chrome.storage.local.set({ [ACCESS_CACHE_KEY]: { ...state, checkedAt: Date.now() } });
    } catch (err) {
      console.warn('[CloudSync] Could not cache access state:', err);
    }
  }

  async function getAccessState() {
    await ensureClerkUser();
    const promoActive = isPromoTrialActive();
    if (!clerkClient || !clerkClient.user) {
      return {
        signedIn: false,
        isFreeSubscriber: false,
        isPro: false,
        promoActive,
        cloudSyncAccess: false,
        proAccess: false,
      };
    }
    const proPlans = [CLOUD_CONFIG.requiredPlan, ...CLOUD_CONFIG.legacyPlans];
    const isPro = userMatchesPlan(proPlans);
    const isFreeSubscriber = isPro || userMatchesPlan([CLOUD_CONFIG.freePlan]);
    const state = {
      signedIn: true,
      isFreeSubscriber,
      isPro,
      promoActive,
      cloudSyncAccess: isFreeSubscriber,
      proAccess: isPro || (promoActive && isFreeSubscriber),
    };
    persistAccessCache(state);
    return state;
  }

  async function hasCloudSyncAccess() {
    return (await getAccessState()).cloudSyncAccess;
  }

  async function hasProAccess() {
    return (await getAccessState()).proAccess;
  }

  function isConfigured() {
    return !!(CLOUD_CONFIG.clerkPublishableKey && CLOUD_CONFIG.convexUrl);
  }

  function getPricingUrl() {
    return '';
  }

  async function mountPricingTable(node, options = {}) {
    await init();
    if (!clerkClient) {
      throw new Error('Pro is not configured yet.');
    }
    if (!node) {
      throw new Error('Pricing table container is missing.');
    }
    if (typeof clerkClient.mountPricingTable !== 'function') {
      throw new Error('This Clerk SDK build does not support the billing pricing table.');
    }
    clerkClient.mountPricingTable(node, {
      for: 'user',
      highlightedPlan: CLOUD_CONFIG.requiredPlan,
      newSubscriptionRedirectUrl: chrome.runtime.getURL('options.html'),
      ...options,
    });
  }

  function unmountPricingTable(node) {
    if (!clerkClient || !node || typeof clerkClient.unmountPricingTable !== 'function') return;
    clerkClient.unmountPricingTable(node);
  }

  async function getConvexUrl() {
    return CLOUD_CONFIG.convexUrl || null;
  }

  function buildAuthInfo() {
    return {
      fetchAccessToken: async () => {
        if (!clerkClient || !clerkClient.session) return null;
        try {
          const token = await clerkClient.session.getToken({ template: 'convex' });
          console.log('[CloudSync] Clerk token fetch result:', token ? 'Got Token' : 'Null Token');
          return token;
        } catch (err) {
          console.error('[CloudSync] Failed to fetch Clerk token:', err);
          return null;
        }
      },
      isAuthenticated: () => !!(clerkClient && clerkClient.user),
    };
  }

  async function initClerk() {
    if (clerkClient) {
      if (!authInfo) authInfo = buildAuthInfo();
      return clerkClient;
    }

    const publishableKey = await getClerkPublishableKey();
    if (!publishableKey) {
      console.log('[CloudSync] No Clerk publishable key configured');
      return null;
    }

    try {
      const isServiceWorker = typeof document === 'undefined';
      const clerkModule = isServiceWorker
        ? await import('@clerk/chrome-extension/background')
        : await import('@clerk/chrome-extension/client');

      clerkClient = await clerkModule.createClerkClient({
        publishableKey
      });

      if (typeof clerkClient.load === 'function') {
        await clerkClient.load({
          afterSignOutUrl: OPTIONS_URL,
          signInForceRedirectUrl: OPTIONS_URL,
          signUpForceRedirectUrl: OPTIONS_URL,
          allowedRedirectProtocols: ['chrome-extension:'],
          appearance: {
            variables: {
              colorBackground: '#16161a',
              colorForeground: '#ffffff',
              colorMutedForeground: 'rgba(255, 255, 255, 0.6)',
              colorInput: 'rgba(255, 255, 255, 0.08)',
              colorInputForeground: '#ffffff',
              colorBorder: 'rgba(255, 255, 255, 0.2)',
              colorPrimary: '#f4933b',
              colorPrimaryForeground: '#1a1005',
              borderRadius: '0.75rem'
            }
          }
        });
      }

      authInfo = buildAuthInfo();

      console.log('[CloudSync] Clerk initialized');
      return clerkClient;
    } catch (err) {
      console.error('[CloudSync] Clerk init failed:', err);
      return null;
    }
  }

  // --- Convex Client Setup ---
  async function initConvex() {
    if (convexClient) return convexClient;

    const url = await getConvexUrl();
    if (!url) {
      console.log('[CloudSync] No Convex URL configured');
      return null;
    }

    if (!authInfo) {
      console.log('[CloudSync] Auth info not ready, deferring Convex init');
      return null;
    }

    convexUrl = url;

    try {
      const { ConvexClient } = await import('convex/browser');
      const client = new ConvexClient(url);
      client.setAuth(authInfo.fetchAccessToken, (isAuthenticated) => {
        console.log('[CloudSync] Convex auth changed:', isAuthenticated);
      });
      convexClient = client;
      console.log('[CloudSync] Convex client initialized with Clerk auth');
      return convexClient;
    } catch (err) {
      console.error('[CloudSync] Convex init failed:', err);
      return null;
    }
  }

  // --- Public API ---

  async function init() {
    if (convexClient) return;
    const clerk = await initClerk();
    if (clerk) {
      await initConvex();
    }
  }

  async function isSignedIn() {
    await init();
    return !!(clerkClient && clerkClient.user);
  }

  async function getUserEmail() {
    await init();
    if (!clerkClient || !clerkClient.user) return null;
    const emailObj = clerkClient.user.primaryEmailAddress;
    return emailObj ? emailObj.emailAddress : null;
  }

  async function getUserId() {
    await init();
    if (!clerkClient || !clerkClient.user) return null;
    return clerkClient.user.id;
  }

  async function getUserProfile() {
    await init();
    if (!clerkClient || !clerkClient.user) return null;
    const user = clerkClient.user;
    const emailObj = user.primaryEmailAddress;
    const email = emailObj ? emailObj.emailAddress : '';
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return {
      id: user.id,
      email,
      name: fullName || user.username || email || 'Signed in',
      imageUrl: user.imageUrl || '',
    };
  }

  async function signIn() {
    await init();
    if (!clerkClient) {
      throw new Error('Pro is not configured yet.');
    }
    clerkClient.openSignIn({});
  }

  async function signUp() {
    await init();
    if (!clerkClient) {
      throw new Error('Pro is not configured yet.');
    }
    if (typeof clerkClient.openSignUp === 'function') {
      clerkClient.openSignUp({});
    } else {
      clerkClient.openSignIn({});
    }
  }

  async function signOut() {
    try {
      chrome.storage.local.remove(ACCESS_CACHE_KEY);
    } catch (err) {
      console.warn('[CloudSync] Could not clear access cache:', err);
    }
    if (!clerkClient) return;
    await clerkClient.signOut({ redirectUrl: OPTIONS_URL });
  }

  async function pushResume(resume) {
    if (!convexClient) {
      console.log('[CloudSync] Not initialized, skipping push');
      return;
    }
    if (!(await hasCloudSyncAccess())) {
      throw new Error('Create a free account to sync your resumes.');
    }

    try {
      const ts = Number(resume.updatedAt);
      const updatedAt = Number.isFinite(ts) && ts > 0 ? ts : Date.now();

      await convexClient.mutation('resumes:upsert', {
        resumeId: resume.id,
        label: resume.label || 'Resume',
        content: resume.content || '',
        jsonContent: resume.jsonContent || '',
        updatedAt,
      });

      console.log('[CloudSync] Pushed resume:', resume.label);
    } catch (err) {
      console.error('[CloudSync] Push failed:', err);
    }
  }

  async function pushAllResumes(resumes) {
    if (!convexClient) {
      console.log('[CloudSync] Not initialized, skipping push');
      return;
    }
    if (!(await hasCloudSyncAccess())) {
      throw new Error('Create a free account to sync your resumes.');
    }

    syncInProgress = true;
    notifySyncStatus('syncing');

    try {
      if (resumes && resumes.length > 0) {
        for (const resume of resumes) {
          await pushResume(resume);
        }
      }

      notifySyncStatus('synced');
    } catch (err) {
      console.error('[CloudSync] Batch push failed:', err);
      notifySyncStatus('error');
    } finally {
      syncInProgress = false;
    }
  }

  async function pullAllResumes() {
    if (!convexClient) {
      console.log('[CloudSync] Not initialized, skipping pull');
      return [];
    }
    if (!(await hasCloudSyncAccess())) {
      throw new Error('Create a free account to sync your resumes.');
    }

    try {
      const results = await convexClient.query('resumes:list', {});
      console.log('[CloudSync] Pulled resumes:', results?.length || 0);
      return results || [];
    } catch (err) {
      console.error('[CloudSync] Pull failed:', err);
      return [];
    }
  }

  async function deleteCloudResume(resumeId) {
    if (!convexClient) return;
    if (!(await hasCloudSyncAccess())) {
      throw new Error('Create a free account to sync your resumes.');
    }

    try {
      await convexClient.mutation('resumes:remove', { resumeId });
      console.log('[CloudSync] Deleted cloud resume:', resumeId);
    } catch (err) {
      console.error('[CloudSync] Delete failed:', err);
    }
  }

  // --- Bidirectional auto-sync ---
  function cloudToLocal(doc) {
    return {
      id: doc.resumeId,
      label: doc.label || 'Resume',
      content: doc.content || '',
      jsonContent: doc.jsonContent || '',
      lastRefineBackup: '',
      lastRefineAppliedAt: '',
      refineAnswers: [],
      updatedAt: Number(doc.updatedAt) || 0,
    };
  }

  function resumeUpdatedAt(resume) {
    const n = Number(resume && resume.updatedAt);
    return Number.isFinite(n) ? n : 0;
  }

  function sameResumeSets(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    const byId = new Map(b.map((r) => [r.id, r]));
    for (const r of a) {
      const o = byId.get(r.id);
      if (!o) return false;
      if ((r.label || '') !== (o.label || '')) return false;
      if ((r.content || '') !== (o.content || '')) return false;
      if ((r.jsonContent || '') !== (o.jsonContent || '')) return false;
    }
    return true;
  }

  function tombstonesToObject(entries) {
    return entries.map(([id, deletedAt]) => ({ id, deletedAt }));
  }

  async function syncResumes() {
    if (!convexClient) return { changed: false, resumes: [] };
    if (syncInProgress) return { changed: false, resumes: [] };
    if (!(await hasCloudSyncAccess())) return { changed: false, resumes: [] };

    syncInProgress = true;
    notifySyncStatus('syncing');

    try {
      const stored = await chrome.storage.local.get(['resumes', DELETED_KEY]);
      const localResumes = Array.isArray(stored.resumes) ? stored.resumes : [];
      const tombstoneEntries = Array.isArray(stored[DELETED_KEY]) ? stored[DELETED_KEY] : [];
      const tombstoneAt = new Map(
        tombstoneEntries
          .filter((entry) => entry && typeof entry.id === 'string')
          .map((entry) => [entry.id, Number(entry.deletedAt) || 0])
      );

      const cloud = (await convexClient.query('resumes:list', {})) || [];
      const cloudById = new Map(cloud.map((doc) => [doc.resumeId, doc]));
      const localById = new Map(localResumes.map((resume) => [resume.id, resume]));

      const toPush = [];
      const toDelete = new Set();
      const remainingTombstones = new Map(tombstoneAt);
      const merged = [];

      for (const local of localResumes) {
        const cloudDoc = cloudById.get(local.id);
        const cloudAt = cloudDoc ? (Number(cloudDoc.updatedAt) || 0) : 0;
        const deletedAt = tombstoneAt.get(local.id);

        if (deletedAt) {
          if (!cloudDoc || deletedAt >= cloudAt) {
            if (cloudDoc) toDelete.add(local.id);
            remainingTombstones.delete(local.id);
            continue;
          }
          remainingTombstones.delete(local.id);
        }

        const isBlank = !(local.content || '').trim() && !(local.jsonContent || '').trim();
        if (isBlank && !cloudDoc && localResumes.length === 1 && cloud.length > 0) {
          continue;
        }

        if (cloudDoc && cloudAt > resumeUpdatedAt(local)) {
          merged.push({
            ...cloudToLocal(cloudDoc),
            lastRefineBackup: local.lastRefineBackup || '',
            refineAnswers: Array.isArray(local.refineAnswers) ? local.refineAnswers : [],
          });
        } else {
          merged.push(local);
          if (!cloudDoc || resumeUpdatedAt(local) > cloudAt) toPush.push(local);
        }
      }

      for (const doc of cloud) {
        if (localById.has(doc.resumeId)) continue;
        const deletedAt = tombstoneAt.get(doc.resumeId);
        if (deletedAt) {
          const cloudAt = Number(doc.updatedAt) || 0;
          remainingTombstones.delete(doc.resumeId);
          if (deletedAt >= cloudAt) {
            toDelete.add(doc.resumeId);
            continue;
          }
        }
        merged.push(cloudToLocal(doc));
      }

      merged.sort((a, b) => resumeUpdatedAt(b) - resumeUpdatedAt(a));
      const limited = merged.slice(0, MAX_RESUMES);
      for (const dropped of merged.slice(MAX_RESUMES)) {
        if (cloudById.has(dropped.id)) toDelete.add(dropped.id);
      }

      for (const id of toDelete) {
        try {
          await convexClient.mutation('resumes:remove', { resumeId: id });
        } catch (err) {
          console.error('[CloudSync] Cloud delete failed:', err);
        }
      }

      for (const resume of toPush) {
        if (limited.some((r) => r.id === resume.id)) {
          await pushResume(resume);
        }
      }

      const changed = !sameResumeSets(localResumes, limited);
      const persistedTombstones = tombstonesToObject(
        [...remainingTombstones.entries()].filter(([id]) => localById.has(id) || cloudById.has(id))
      );
      if (changed) {
        const persisted = limited.map((r) => ({
          id: r.id,
          label: r.label,
          content: r.content || '',
          jsonContent: r.jsonContent || '',
          lastRefineBackup: r.lastRefineBackup || '',
          lastRefineAppliedAt: r.lastRefineAppliedAt || '',
          refineAnswers: Array.isArray(r.refineAnswers) ? r.refineAnswers : [],
          updatedAt: resumeUpdatedAt(r),
        }));
        await chrome.storage.local.set({ resumes: persisted, [DELETED_KEY]: persistedTombstones });
      } else if (persistedTombstones.length !== tombstoneEntries.length) {
        await chrome.storage.local.set({ [DELETED_KEY]: persistedTombstones });
      }

      notifySyncStatus('synced');
      return { changed, resumes: limited };
    } catch (err) {
      console.error('[CloudSync] Sync failed:', err);
      notifySyncStatus('error');
      return { changed: false, resumes: [] };
    } finally {
      syncInProgress = false;
    }
  }

  // --- Auto-sync hook ---
  let syncDebounceTimer = null;

  function notifySyncStatus(status) {
    const obj = {};
    obj[CONFIG_KEYS.cloudSyncStatus] = status;
    chrome.storage.local.set(obj);
  }

  async function onLocalResumesChanged() {
    if (!clerkClient || !clerkClient.user) return;
    if (syncInProgress) return;

    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      syncResumes();
    }, 2000);
  }

  // --- Module export ---
  globalThis.CloudSync = {
    init,
    isConfigured,
    getPricingUrl,
    mountPricingTable,
    unmountPricingTable,
    isSignedIn,
    getUserEmail,
    getUserId,
    getUserProfile,
    hasCloudSyncAccess,
    hasProAccess,
    getAccessState,
    isPromoTrialActive,
    signIn,
    signUp,
    signOut,
    pushResume,
    pushAllResumes,
    pullAllResumes,
    deleteCloudResume,
    syncResumes,
    onLocalResumesChanged,
  };
})();
