// Cloud Sync Service
// Handles push/pull of resumes to Convex with Clerk auth
// Bundled by esbuild into cloud-sync.js
// Usage: load via <script src="cloud-sync.js"> in popup/options/background

(function () {
  'use strict';

  const CONFIG_KEYS = {
    resumes: 'resumes',
    cloudSyncStatus: 'cloudSyncStatus',
    cloudOnboardingDismissed: 'cloudOnboardingDismissed',
    cloudOnboardingDismissedVersion: 'cloudOnboardingDismissedVersion',
  };

  const CLOUD_CONFIG = {
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
    convexUrl: process.env.CONVEX_URL || '',
    requiredPlan: 'cloud_sync',
  };

  let convexClient = null;
  let clerkClient = null;
  let convexUrl = null;
  let isInitialized = false;
  let syncInProgress = false;
  let authInfo = null;

  const EXTENSION_URL = chrome.runtime.getURL('.');
  const POPUP_URL = EXTENSION_URL + 'popup.html';

  // --- Clerk Setup ---
  async function getClerkPublishableKey() {
    return CLOUD_CONFIG.clerkPublishableKey || null;
  }

  async function hasCloudSyncAccess() {
    await init();
    if (!clerkClient || !clerkClient.user) return false;
    if (clerkClient.session && typeof clerkClient.session.checkAuthorization === 'function') {
      try {
        if (clerkClient.session.checkAuthorization({ plan: CLOUD_CONFIG.requiredPlan })) return true;
        if (clerkClient.session.checkAuthorization({ feature: CLOUD_CONFIG.requiredPlan })) return true;
        if (clerkClient.session.checkAuthorization({ plan: 'pro' })) return true;
        if (clerkClient.session.checkAuthorization({ plan: 'premium' })) return true;
      } catch (err) {
        console.warn('[CloudSync] Clerk billing authorization check failed, falling back to metadata:', err);
      }
    }
    const metadata = clerkClient.user.publicMetadata || {};
    const unsafeMetadata = clerkClient.user.unsafeMetadata || {};
    const plan = metadata.plan || unsafeMetadata.plan || '';
    const features = metadata.features || unsafeMetadata.features || [];
    return (
      plan === CLOUD_CONFIG.requiredPlan ||
      plan === 'pro' ||
      plan === 'premium' ||
      features.includes(CLOUD_CONFIG.requiredPlan)
    );
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
      throw new Error('Cloud sync is not configured yet.');
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
          afterSignOutUrl: POPUP_URL,
          signInForceRedirectUrl: POPUP_URL,
          signUpForceRedirectUrl: POPUP_URL,
          allowedRedirectProtocols: ['chrome-extension:'],
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
      throw new Error('Cloud sync is not configured yet.');
    }
    clerkClient.openSignIn({});
  }

  async function signOut() {
    if (!clerkClient) return;
    await clerkClient.signOut({ redirectUrl: POPUP_URL });
  }

  async function pushResume(resume) {
    if (!convexClient) {
      console.log('[CloudSync] Not initialized, skipping push');
      return;
    }
    if (!(await hasCloudSyncAccess())) {
      throw new Error('Cloud Sync requires an active plan.');
    }

    try {
      const updatedAt = resume.lastRefineAppliedAt
        ? new Date(resume.lastRefineAppliedAt).getTime()
        : Date.now();

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
      throw new Error('Cloud Sync requires an active plan.');
    }

    syncInProgress = true;
    notifySyncStatus('syncing');

    try {
      const localIds = new Set((resumes || []).map(r => r.id));

      const cloudResumes = await convexClient.query('resumes:list', {});
      const orphanIds = cloudResumes
        .map(r => r.resumeId)
        .filter(id => !localIds.has(id));

      for (const id of orphanIds) {
        await convexClient.mutation('resumes:remove', { resumeId: id });
        console.log('[CloudSync] Deleted orphan cloud resume:', id);
      }

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
      throw new Error('Cloud Sync requires an active plan.');
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
      throw new Error('Cloud Sync requires an active plan.');
    }

    try {
      await convexClient.mutation('resumes:remove', { resumeId });
      console.log('[CloudSync] Deleted cloud resume:', resumeId);
    } catch (err) {
      console.error('[CloudSync] Delete failed:', err);
    }
  }

  // --- Auto-sync hook ---
  let syncDebounceTimer = null;

  function notifySyncStatus(status) {
    const obj = {};
    obj[CONFIG_KEYS.cloudSyncStatus] = status;
    chrome.storage.local.set(obj);
  }

  async function onLocalResumesChanged(resumes) {
    if (!clerkClient || !clerkClient.user) return;
    if (syncInProgress) return;

    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      pushAllResumes(resumes);
    }, 2000);
  }

  // --- Onboarding State ---
  function dismissOnboarding() {
    const obj = {};
    obj[CONFIG_KEYS.cloudOnboardingDismissed] = true;
    obj[CONFIG_KEYS.cloudOnboardingDismissedVersion] = '5.8';
    chrome.storage.local.set(obj);
  }

  async function shouldShowOnboarding() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        CONFIG_KEYS.cloudOnboardingDismissed,
        CONFIG_KEYS.cloudOnboardingDismissedVersion,
        CONFIG_KEYS.resumes,
      ], (data) => {
        if (data[CONFIG_KEYS.cloudOnboardingDismissed] &&
            data[CONFIG_KEYS.cloudOnboardingDismissedVersion] === '5.8') {
          resolve(false);
          return;
        }
        if (!data[CONFIG_KEYS.resumes] || data[CONFIG_KEYS.resumes].length === 0) {
          resolve(false);
          return;
        }
        if (!isConfigured()) {
          resolve(false);
          return;
        }
        if (clerkClient && clerkClient.user) {
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
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
    signIn,
    signOut,
    pushResume,
    pushAllResumes,
    pullAllResumes,
    deleteCloudResume,
    onLocalResumesChanged,
    dismissOnboarding,
    shouldShowOnboarding,
  };
})();
