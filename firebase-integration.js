// firebase-integration.js - Integration with main bot
// Place AFTER firebase-sync.js in HTML

// YOUR FIREBASE CONFIG HERE
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBx-cS3l5_49Q2-xs5hqe5BKs79Laz4B0o",
  authDomain: "leotu-5c2b5.firebaseapp.com",
  databaseURL: "https://leotu-5c2b5-default-rtdb.firebaseio.com",
  projectId: "leotu-5c2b5",
  storageBucket: "leotu-5c2b5.firebasestorage.app",
  messagingSenderId: "694359717732",
  appId: "1:694359717732:web:1e79cc09e8e991f7322c71"
};

// Initialize Firebase when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔥 Initializing Firebase...');
    
    // Initialize Firebase
    await firebaseSync.init(FIREBASE_CONFIG);
    
    // Setup UI event listeners
    setupFirebaseUI();
    
    // Hook into bot events
    hookBotEvents();
});

/**
 * Setup Firebase UI event listeners
 */
function setupFirebaseUI() {
    // Sign In
    document.getElementById('firebaseSignIn')?.addEventListener('click', async () => {
        const email = document.getElementById('firebaseEmail').value.trim();
        const password = document.getElementById('firebasePassword').value.trim();
        
        if (!email || !password) {
            Utils.notify('Firebase', 'Please enter email and password', 'warning');
            return;
        }
        
        await firebaseSync.signIn(email, password);
        toggleFirebaseUI(true);
    });
    
    // Sign Up
    document.getElementById('firebaseSignUp')?.addEventListener('click', async () => {
        const email = document.getElementById('firebaseEmail').value.trim();
        const password = document.getElementById('firebasePassword').value.trim();
        
        if (!email || !password) {
            Utils.notify('Firebase', 'Please enter email and password', 'warning');
            return;
        }
        
        if (password.length < 6) {
            Utils.notify('Firebase', 'Password must be at least 6 characters', 'warning');
            return;
        }
        
        await firebaseSync.signUp(email, password);
        toggleFirebaseUI(true);
    });
    
    // Sign Out
    document.getElementById('firebaseSignOut')?.addEventListener('click', async () => {
        await firebaseSync.signOut();
        toggleFirebaseUI(false);
    });
    
    // Push Data
    document.getElementById('firebasePush')?.addEventListener('click', async () => {
        bot?.showLoading('Pushing data to Firebase...');
        await firebaseSync.pushData();
        bot?.hideLoading();
        updateSyncTime();
    });
    
    // Pull Data
    document.getElementById('firebasePull')?.addEventListener('click', async () => {
        bot?.showLoading('Pulling data from Firebase...');
        await firebaseSync.pullData();
        bot?.hideLoading();
        updateSyncTime();
    });
    
    // Backup
    document.getElementById('firebaseBackup')?.addEventListener('click', async () => {
        bot?.showLoading('Creating backup...');
        await firebaseSync.exportBackupToStorage();
        bot?.hideLoading();
    });
    
    // Auto-sync toggle
    document.getElementById('firebaseAutoSync')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            firebaseSync.startAutoSync(60000); // 1 minute
        } else {
            firebaseSync.stopAutoSync();
        }
        firebaseSync.saveConfig({ autoSync: e.target.checked });
    });
    
    // Real-time sync toggle
    document.getElementById('firebaseRealtime')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            firebaseSync.enableRealtimeSync();
        } else {
            firebaseSync.disableRealtimeSync();
        }
        firebaseSync.saveConfig({ realtimeSync: e.target.checked });
    });
}

/**
 * Toggle Firebase UI sections
 */
function toggleFirebaseUI(authenticated) {
    const authSection = document.getElementById('firebaseAuthSection');
    const syncSection = document.getElementById('firebaseSyncSection');
    const emailDisplay = document.getElementById('firebaseEmailDisplay');
    
    if (authenticated) {
        authSection?.classList.add('hidden');
        syncSection?.classList.remove('hidden');
        if (emailDisplay && firebaseSync.user) {
            emailDisplay.textContent = firebaseSync.user.email;
        }
    } else {
        authSection?.classList.remove('hidden');
        syncSection?.classList.add('hidden');
    }
}

/**
 * Update last sync time display
 */
function updateSyncTime() {
    const status = firebaseSync.getSyncStatus();
    const syncTimeEl = document.getElementById('lastSyncTime');
    
    if (syncTimeEl && status.lastSync > 0) {
        const time = new Date(status.lastSync);
        syncTimeEl.textContent = `Last sync: ${time.toLocaleTimeString()}`;
    }
}

/**
 * Hook into bot events for automatic syncing
 */
function hookBotEvents() {
    // Auto-sync when trade completes
    window.addEventListener('tradeCompleted', async (event) => {
        if (firebaseSync.user && firebaseSync.config.autoSync) {
            console.log('🔄 Auto-syncing after trade...');
            await firebaseSync.syncTrades();
            await firebaseSync.syncPerformance();
            updateSyncTime();
        }
    });
    
    // Sync on page unload
    window.addEventListener('beforeunload', () => {
        if (firebaseSync.user && firebaseSync.config.autoSync) {
            firebaseSync.pushData();
        }
    });
}

// Global helper for console access
window.firebase_push = () => firebaseSync.pushData();
window.firebase_pull = () => firebaseSync.pullData();
window.firebase_status = () => console.log(firebaseSync.getSyncStatus());