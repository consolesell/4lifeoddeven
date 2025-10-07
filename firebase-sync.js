// firebase-sync.js - Firebase Realtime Sync Module
// No modifications to existing bot required!

class FirebaseSync {
    constructor() {
        this.db = null;
        this.auth = null;
        this.user = null;
        this.isInitialized = false;
        this.syncEnabled = false;
        this.userId = null;
        this.userRef = null;
        
        // Sync intervals
        this.autoSyncInterval = null;
        this.lastSyncTime = 0;
        
        // Config from localStorage
        this.config = this.loadConfig();
    }

    /**
     * Initialize Firebase
     */
    async init(firebaseConfig) {
        try {
            // Initialize Firebase
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            
            this.db = firebase.database();
            this.auth = firebase.auth();
            this.isInitialized = true;
            
            console.log('✅ Firebase initialized successfully');
            
            // Listen for auth state changes
            this.auth.onAuthStateChanged((user) => {
                if (user) {
                    this.user = user;
                    this.userId = user.uid;
                    this.userRef = this.db.ref(`users/${this.userId}`);
                    console.log('✅ Firebase user authenticated:', user.email);
                    this.onAuthSuccess();
                } else {
                    this.user = null;
                    this.userId = null;
                    this.userRef = null;
                }
            });
            
            return true;
        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            return false;
        }
    }

    /**
     * Sign up new user
     */
    async signUp(email, password) {
        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            Utils.notify('Firebase Connected', 'Account created successfully!', 'success');
            return userCredential.user;
        } catch (error) {
            console.error('Sign up error:', error);
            Utils.notify('Firebase Error', error.message, 'error');
            throw error;
        }
    }

    /**
     * Sign in existing user
     */
    async signIn(email, password) {
        try {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            Utils.notify('Firebase Connected', 'Signed in successfully!', 'success');
            return userCredential.user;
        } catch (error) {
            console.error('Sign in error:', error);
            Utils.notify('Firebase Error', error.message, 'error');
            throw error;
        }
    }

    /**
     * Sign out
     */
    async signOut() {
        try {
            await this.auth.signOut();
            this.stopAutoSync();
            Utils.notify('Firebase', 'Signed out successfully', 'info');
        } catch (error) {
            console.error('Sign out error:', error);
        }
    }

    /**
     * Called when user authenticates
     */
    onAuthSuccess() {
        // Auto-pull data from Firebase
        this.pullData();
        
        // Start auto-sync if enabled
        if (this.config.autoSync) {
            this.startAutoSync(this.config.syncInterval || 60000); // Default 1 minute
        }
        
        // Update UI
        this.updateFirebaseUI(true);
    }

    /**
     * Push all local data to Firebase
     */
    async pushData() {
        if (!this.userRef) {
            Utils.notify('Firebase Error', 'Not authenticated', 'error');
            return false;
        }

        try {
            const data = {
                ticks: Storage.getTicks(),
                trades: Storage.getTrades(),
                performance: Storage.getPerformance(),
                models: Storage.getModels(),
                settings: Storage.getSettings(),
                lastSync: Date.now(),
                version: '1.0.0'
            };

            await this.userRef.set(data);
            this.lastSyncTime = Date.now();
            
            Utils.notify('Firebase Sync', 'Data pushed successfully', 'success');
            console.log('✅ Data pushed to Firebase');
            return true;
        } catch (error) {
            console.error('❌ Push error:', error);
            Utils.notify('Firebase Error', 'Failed to push data', 'error');
            return false;
        }
    }

    /**
     * Pull data from Firebase to local storage
     */
    async pullData() {
        if (!this.userRef) {
            Utils.notify('Firebase Error', 'Not authenticated', 'error');
            return false;
        }

        try {
            const snapshot = await this.userRef.once('value');
            const data = snapshot.val();

            if (!data) {
                console.log('ℹ️ No data in Firebase, will use local');
                return false;
            }

            // Ask user before overwriting local data
            if (Storage.getTrades().length > 0) {
                const confirmed = await this.confirmOverwrite(data);
                if (!confirmed) return false;
            }

            // Restore data
            if (data.ticks) Storage.setItem('ticks', data.ticks);
            if (data.trades) Storage.setItem('trades', data.trades);
            if (data.performance) Storage.setItem('performance', data.performance);
            if (data.models) Storage.setItem('models', data.models);
            if (data.settings) Storage.setItem('settings', data.settings);

            this.lastSyncTime = Date.now();
            Utils.notify('Firebase Sync', 'Data pulled successfully', 'success');
            console.log('✅ Data pulled from Firebase');
            
            // Refresh UI
            if (typeof bot !== 'undefined') {
                bot.updateUI();
            }
            
            return true;
        } catch (error) {
            console.error('❌ Pull error:', error);
            Utils.notify('Firebase Error', 'Failed to pull data', 'error');
            return false;
        }
    }

    /**
     * Sync specific data type
     */
    async syncTrades() {
        if (!this.userRef) return false;
        
        try {
            const trades = Storage.getTrades();
            await this.userRef.child('trades').set(trades);
            await this.userRef.child('lastSync').set(Date.now());
            console.log('✅ Trades synced');
            return true;
        } catch (error) {
            console.error('❌ Trade sync error:', error);
            return false;
        }
    }

    /**
     * Sync specific data type
     */
    async syncPerformance() {
        if (!this.userRef) return false;
        
        try {
            const performance = Storage.getPerformance();
            await this.userRef.child('performance').set(performance);
            console.log('✅ Performance synced');
            return true;
        } catch (error) {
            console.error('❌ Performance sync error:', error);
            return false;
        }
    }

    /**
     * Listen to real-time updates
     */
    enableRealtimeSync() {
        if (!this.userRef) return;

        this.userRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.lastSync > this.lastSyncTime) {
                console.log('📡 Remote data updated, pulling changes...');
                this.pullData();
            }
        });

        console.log('📡 Real-time sync enabled');
    }

    /**
     * Disable real-time sync
     */
    disableRealtimeSync() {
        if (this.userRef) {
            this.userRef.off();
            console.log('📡 Real-time sync disabled');
        }
    }

    /**
     * Start automatic syncing
     */
    startAutoSync(interval = 60000) {
        this.stopAutoSync();
        
        this.autoSyncInterval = setInterval(() => {
            if (this.userId) {
                console.log('🔄 Auto-syncing...');
                this.pushData();
            }
        }, interval);
        
        console.log(`🔄 Auto-sync started (${interval / 1000}s interval)`);
    }

    /**
     * Stop automatic syncing
     */
    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
            console.log('🔄 Auto-sync stopped');
        }
    }

    /**
     * Confirm overwrite dialog
     */
    async confirmOverwrite(remoteData) {
        return new Promise((resolve) => {
            const localTrades = Storage.getTrades().length;
            const remoteTrades = remoteData.trades?.length || 0;
            
            if (typeof bot !== 'undefined') {
                bot.showModal('confirm', 'Sync Data?', 
                    `Local: ${localTrades} trades\nFirebase: ${remoteTrades} trades\n\nOverwrite local with Firebase data?`,
                    () => resolve(true)
                );
                
                // Also handle cancel
                document.getElementById('modalCancel').onclick = () => {
                    bot.hideModal();
                    resolve(false);
                };
            } else {
                resolve(confirm(`Overwrite local data with Firebase?\nLocal: ${localTrades} trades, Remote: ${remoteTrades} trades`));
            }
        });
    }

    /**
     * Get sync status
     */
    getSyncStatus() {
        return {
            isAuthenticated: !!this.user,
            email: this.user?.email || null,
            lastSync: this.lastSyncTime,
            autoSyncEnabled: !!this.autoSyncInterval,
            realtimeSyncEnabled: this.syncEnabled
        };
    }

    /**
     * Save config
     */
    saveConfig(config) {
        this.config = { ...this.config, ...config };
        localStorage.setItem('firebase_config', JSON.stringify(this.config));
    }

    /**
     * Load config
     */
    loadConfig() {
        const saved = localStorage.getItem('firebase_config');
        return saved ? JSON.parse(saved) : {
            autoSync: true,
            syncInterval: 60000,
            realtimeSync: false
        };
    }

    /**
     * Update UI with Firebase status
     */
    updateFirebaseUI(authenticated) {
        const statusEl = document.getElementById('firebaseStatus');
        const emailEl = document.getElementById('firebaseEmail');
        
        if (statusEl) {
            statusEl.textContent = authenticated ? 'Connected' : 'Disconnected';
            statusEl.className = `status-badge ${authenticated ? 'connected' : 'disconnected'}`;
        }
        
        if (emailEl && authenticated) {
            emailEl.textContent = this.user.email;
        }
    }

    /**
     * Export backup to Firebase Storage (bonus feature)
     */
    async exportBackupToStorage() {
        if (!this.userId) return false;

        try {
            const backup = {
                timestamp: Date.now(),
                data: {
                    ticks: Storage.getTicks(),
                    trades: Storage.getTrades(),
                    performance: Storage.getPerformance(),
                    models: Storage.getModels(),
                    settings: Storage.getSettings()
                }
            };

            const backupRef = this.db.ref(`backups/${this.userId}/${backup.timestamp}`);
            await backupRef.set(backup);

            Utils.notify('Backup Created', 'Backup saved to Firebase', 'success');
            return true;
        } catch (error) {
            console.error('Backup error:', error);
            return false;
        }
    }

    /**
     * Get list of backups
     */
    async getBackups() {
        if (!this.userId) return [];

        try {
            const backupsRef = this.db.ref(`backups/${this.userId}`);
            const snapshot = await backupsRef.once('value');
            const backups = snapshot.val();

            if (!backups) return [];

            return Object.entries(backups).map(([timestamp, data]) => ({
                timestamp: parseInt(timestamp),
                date: new Date(parseInt(timestamp)),
                size: JSON.stringify(data).length
            }));
        } catch (error) {
            console.error('Get backups error:', error);
            return [];
        }
    }

    /**
     * Restore from specific backup
     */
    async restoreFromBackup(timestamp) {
        if (!this.userId) return false;

        try {
            const backupRef = this.db.ref(`backups/${this.userId}/${timestamp}`);
            const snapshot = await backupRef.once('value');
            const backup = snapshot.val();

            if (!backup || !backup.data) {
                Utils.notify('Restore Error', 'Backup not found', 'error');
                return false;
            }

            // Restore data
            Storage.restoreData(backup.data);
            Utils.notify('Restore Complete', 'Data restored from backup', 'success');
            
            if (typeof bot !== 'undefined') {
                bot.updateUI();
            }
            
            return true;
        } catch (error) {
            console.error('Restore error:', error);
            Utils.notify('Restore Error', 'Failed to restore backup', 'error');
            return false;
        }
    }
}

// Create global instance
const firebaseSync = new FirebaseSync();

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FirebaseSync;
}