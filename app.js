/**
 * Hashly - Client-Side Key-Value Lookup System
 * 
 * Uses MPHF + Chunked File Lookup for O(1) key lookups
 */

class HashlyLookup {
    constructor() {
        this.meta = null;
        this.index = null;
        this.initialized = false;
        this.cache = new Map(); // LRU cache for chunks
        this.maxCacheSize = 10;
    }

    /**
     * Initialize the lookup system
     */
    async init() {
        try {
            console.log('🚀 Initializing Hashly...');

            // Load metadata
            await this.loadMetadata();

            this.initialized = true;
            console.log('✅ Hashly initialized successfully');

            return true;
        } catch (error) {
            console.error('❌ Initialization error:', error);
            throw error;
        }
    }

    /**
     * Load metadata about chunks
     */
    async loadMetadata() {
        try {
            const [metaRes, indexRes] = await Promise.all([
                fetch('meta.json').catch(() => ({ ok: false })),
                fetch('packed_data/index.json')
            ]);

            if (indexRes.ok) {
                this.index = await indexRes.json();
            } else {
                throw new Error('Failed to load chunk index');
            }

            if (metaRes.ok) {
                this.meta = await metaRes.json();
            } else {
                console.warn('⚠️ Metadata not found, using defaults');
                this.meta = {
                    total_chunks: 2860,
                    total_keys: 14300247
                };
            }
            console.log(`📊 Loaded metadata: ${this.meta.total_keys?.toLocaleString() || 'N/A'} keys, ${this.meta.total_chunks || 'N/A'} chunks`);
            console.log(`🗂️ Loaded index for ${Object.keys(this.index).length} chunks`);
        } catch (error) {
            console.error('❌ Failed to load required data:', error);
            throw error;
        }
    }

    /**
     * FNV-1a 32-bit hash function
     * Must match Python implementation exactly
     */
    fnv1a_32(str) {
        let hval = 0x811c9dc5;
        const fnv_32_prime = 0x01000193;

        for (let i = 0; i < str.length; i++) {
            hval = hval ^ str.charCodeAt(i);
            hval = Math.imul(hval, fnv_32_prime);
        }

        return hval >>> 0; // Force unsigned 32-bit
    }

    /**
     * Validate key format
     */
    validateKey(key) {
        // Must be exactly 32 hex characters
        const hexPattern = /^[0-9a-f]{32}$/i;
        return hexPattern.test(key);
    }

    /**
     * Normalize key to lowercase
     */
    normalizeKey(key) {
        return key.toLowerCase().trim();
    }

    /**
     * Calculate Chunk ID using Hash Sharding
     */
    getChunkId(key) {
        // Matches mega_packer.js: uses the first 4 characters of the hash key
        return key.substring(0, 4).toLowerCase();
    }


    /**
     * Fetch chunk file
     */
    async fetchChunk(chunkId) {
        // Check cache first
        const cacheKey = `chunk_${chunkId}`;
        if (this.cache.has(cacheKey)) {
            console.log(`💾 Cache hit for chunk ${chunkId}`);
            return this.cache.get(cacheKey);
        }

        // Fetch from packed data using index
        const chunkInfo = this.index[chunkId];
        if (!chunkInfo) {
            throw new Error(`Chunk ${chunkId} not found in index`);
        }

        const [shardId, offset, length] = chunkInfo;
        const url = `packed_data/shard_${shardId}.gz`;


        console.log(`📥 Fetching chunk ${chunkId} from shard ${shardId} (Offset: ${offset}, Length: ${length})`);

        const response = await fetch(url, {
            headers: {
                'Range': `bytes=${offset}-${offset + length - 1}`
            }
        });

        if (!response.ok && response.status !== 206) {
            throw new Error(`Failed to fetch chunk ${chunkId}`);
        }

        // Decompress using DecompressionStream
        const ds = new DecompressionStream('gzip');
        const decompressedStream = response.body.pipeThrough(ds);
        const text = await new Response(decompressedStream).text();

        // Add to cache (LRU)
        this.addToCache(cacheKey, text);

        return text;
    }

    /**
     * Add item to LRU cache
     */
    addToCache(key, value) {
        // Remove oldest if cache is full
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, value);
    }

    /**
     * Scan chunk for exact key match
     */
    scanChunk(chunkText, targetKey) {
        const lines = chunkText.split('\n');

        for (const line of lines) {
            if (!line.trim()) continue;

            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) continue;

            const key = line.substring(0, colonIndex).trim();

            if (key === targetKey) {
                const value = line.substring(colonIndex + 1).trim();
                return value;
            }
        }

        return null;
    }

    /**
     * Main lookup function
     */
    async lookup(key, onProgress = null) {
        const startTime = performance.now();

        try {
            // Step 1: Validate
            if (onProgress) onProgress('Validating key...');

            if (!this.validateKey(key)) {
                return { success: false };
            }


            // Step 2: Normalize
            const normalizedKey = this.normalizeKey(key);

            // Step 3: Calculate Chunk ID
            if (onProgress) onProgress('Calculating chunk ID...');

            const chunkId = this.getChunkId(normalizedKey);
            console.log(`📦 Chunk ID: ${chunkId}`);

            // Step 4: Fetch chunk
            if (onProgress) onProgress(`Loading chunk ${chunkId}...`);

            const chunkText = await this.fetchChunk(chunkId);

            // Step 5: Scan for key
            if (onProgress) onProgress('Scanning for key...');

            const value = this.scanChunk(chunkText, normalizedKey);

            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            if (value === null) {
                throw new Error('Key not found in dataset');
            }

            console.log(`✅ Found value in ${duration}ms`);

            return {
                success: true,
                value: value,
                duration: duration,
                chunkId: chunkId,
                mphfIndex: 'N/A' // No longer applicable
            };

        } catch (error) {
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            console.error('❌ Lookup error:', error);

            return {
                success: false,
                error: error.message,
                duration: duration
            };
        }
    }
}

class UIController {
    constructor(lookupSystem) {
        this.lookup = lookupSystem;
        this.isSearching = false;

        // DOM Elements
        this.searchForm = document.getElementById('searchForm');
        this.searchInput = document.getElementById('searchInput');
        
        this.shortcutHint = document.getElementById('shortcutHint');
        this.clearBtn = document.getElementById('clearBtn');
        this.loadingSpinner = document.getElementById('loadingSpinner');

        this.skeletonLoader = document.getElementById('skeletonLoader');
        
        this.plaintextCard = document.getElementById('plaintextCard');
        this.plaintextResultText = document.getElementById('plaintextResultText');
        this.copyPlaintextBtn = document.getElementById('copyPlaintextBtn');
        this.algoTag = document.getElementById('algoTag');

        this.hashListContainer = document.getElementById('hashListContainer');
        this.errorContainer = document.getElementById('errorContainer');
        this.errorMessage = document.getElementById('errorMessage');

        this.attachEventListeners();
    }

    attachEventListeners() {
        this.searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSearch();
            return false; // Backup prevention
        });

        this.searchInput.addEventListener('input', () => {
            if (this.searchInput.value.length > 0) {
                this.clearBtn.classList.remove('hidden');
                this.shortcutHint.classList.add('hidden');
            } else {
                this.clearBtn.classList.add('hidden');
                this.shortcutHint.classList.remove('hidden');
                this.hideAll();
            }
        });

        this.clearBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.clearBtn.classList.add('hidden');
            this.shortcutHint.classList.remove('hidden');
            this.hideAll();
            this.searchInput.focus();
        });

        // Copy plain text button
        if (this.copyPlaintextBtn) {
            this.copyPlaintextBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(this.plaintextResultText.textContent.trim());
                    this.copyPlaintextBtn.classList.add('copied');
                    setTimeout(() => this.copyPlaintextBtn.classList.remove('copied'), 2000);
                } catch (e) {}
            });
        }

        // Command+K shortcut
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.searchInput.focus();
            }
        });

        // About Modal Logic
        const aboutBtn = document.getElementById('aboutBtn');
        const closeAboutBtn = document.getElementById('closeAboutBtn');
        const aboutModal = document.getElementById('aboutModal');
        const aboutModalContent = document.getElementById('aboutModalContent');

        if (aboutBtn && aboutModal) {
            const closeModal = () => {
                aboutModal.classList.add('opacity-0', 'pointer-events-none');
                aboutModalContent.classList.remove('scale-100');
                aboutModalContent.classList.add('scale-95');
            };

            aboutBtn.addEventListener('click', () => {
                aboutModal.classList.remove('opacity-0', 'pointer-events-none');
                aboutModalContent.classList.remove('scale-95');
                aboutModalContent.classList.add('scale-100');
            });

            closeAboutBtn.addEventListener('click', closeModal);
            aboutModal.addEventListener('click', (e) => {
                if (e.target === aboutModal) closeModal();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !aboutModal.classList.contains('opacity-0')) {
                    closeModal();
                }
            });
        }
    }

    computeNTLM(password) {
        let bytes = [];
        for (let i = 0; i < password.length; i++) {
            bytes.push(password.charCodeAt(i));
            bytes.push(0);
        }
        return window.md4(bytes);
    }

    isHash(str) {
        // Match MD5/NTLM (32), SHA1 (40), and SHA256 (64)
        return /^([0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64})$/i.test(str);
    }

    async handleSearch() {
        if (this.isSearching) return;

        const inputVal = this.searchInput.value.trim();
        if (!inputVal) return;

        this.isSearching = true;
        this.hideAll();
        
        // Processing State (State 3)
        this.showLoading();

        try {
            // CLOUDFLARE WORKER API (Manual Cloudflare Option)
            // If you have deployed the Worker, paste your URL here:
            // const apiEndpoint = 'https://goathash-api.YOURNAME.workers.dev/lookup?hash=';
            const apiEndpoint = null; 

            if (this.isHash(inputVal)) {
                let result = null;

                if (apiEndpoint) {
                    // Method 1: Cloudflare Worker API
                    this.updateLoadingStatus("Querying Cloudflare API...");
                    const response = await fetch(apiEndpoint + inputVal);
                    result = await response.json();
                } else {
                    // Method 2: High-Performance Local Shards
                    result = await this.lookup.lookup(inputVal, () => {});
                }

                if (result.success) {
                    this.hideLoading();
                    let algoType = "CRACKED";
                    const isMD5 = (CryptoJS.MD5(result.value).toString() === inputVal.toLowerCase());
                    const isSHA1 = (CryptoJS.SHA1(result.value).toString() === inputVal.toLowerCase());
                    const isSHA256 = (CryptoJS.SHA256(result.value).toString() === inputVal.toLowerCase());
                    const isNTLM = (this.computeNTLM(result.value).toLowerCase() === inputVal.toLowerCase());
                    
                    if (isMD5) algoType = "MD5";
                    else if (isSHA1) algoType = "SHA1";
                    else if (isSHA256) algoType = "SHA256";
                    else if (isNTLM) algoType = "NTLM";
                    
                    this.showPlaintextResult(result.value, algoType);
                } else {
                    // Local Brute-Force Fallback (Option A)
                    const len = inputVal.length;
                    if (len === 40 || len === 64) {
                        const type = len === 40 ? 'SHA1' : 'SHA256';
                        
                        // NEW: Internet API Fallback (CIRCL HashLookup)
                        // This searches 2.5 Billion + records instantly.
                        if (type === 'SHA1') {
                            try {
                                this.updateLoadingStatus("Checking global database...");
                                const remoteResponse = await fetch(`https://hashlookup.circl.lu/lookup/sha1/${inputVal}`);
                                if (remoteResponse.ok) {
                                    const remoteData = await remoteResponse.json();
                                    if (remoteData && remoteData.FileName) {
                                        // This is a file, show its name or context
                                        this.hideLoading();
                                        this.showPlaintextResult(remoteData.FileName, "CIRCL");
                                        return;
                                    }
                                }
                            } catch (e) {
                                console.warn("Remote API failed, falling back to local scan.");
                            }
                        }

                        await this.crackWithWorker(inputVal, type);
                    } else {
                        this.hideLoading();
                        this.showError('Hash not found in database.');
                    }
                }
            } else {
                // Input is plain text. Generate hashes instantly without backend! 
                // Wait briefly to show off the skeleton loader so it feels snappy but visible
                await new Promise(r => setTimeout(r, 150));
                
                this.hideLoading();
                // State 1: Hash List Container
                this.showHashList(inputVal);
            }
        } catch (error) {
            this.hideLoading();
            this.showError('Error: ' + (error.message || error));
            console.error(error);
        } finally {
            this.isSearching = false;
        }
    }

    async crackWithWorker(targetHash, type) {
        return new Promise((resolve) => {
            if (this.workers) this.workers.forEach(w => w.terminate());
            this.workers = [];
            
            const numWorkers = 4;
            let finishedWorkers = 0;
            let totalChecked = 0;
            const workerProgress = new Array(numWorkers).fill(0);
            let matchFound = false;

            const terminateAll = () => {
                this.workers.forEach(w => w.terminate());
                this.workers = [];
            };

            for (let i = 0; i < numWorkers; i++) {
                const worker = new Worker('worker.js');
                this.workers.push(worker);

                worker.onmessage = (e) => {
                    if (matchFound) return;
                    const { status, message, plaintext, checkedCount, error } = e.data;

                    if (status === 'progress') {
                        workerProgress[i] = checkedCount;
                        const total = workerProgress.reduce((a, b) => a + b, 0);
                        const formattedCount = new Intl.NumberFormat().format(total);
                        this.updateLoadingStatus(`Parallel scanning... Checked ${formattedCount} records`);
                    } else if (status === 'success') {
                        matchFound = true;
                        this.hideLoading();
                        this.showPlaintextResult(plaintext, type);
                        terminateAll();
                        resolve();
                    } else if (status === 'not_found' || status === 'error') {
                        finishedWorkers++;
                        if (finishedWorkers === numWorkers && !matchFound) {
                            this.hideLoading();
                            if (status === 'error') this.showError(`Sync Error: ${error}`);
                            else this.showError(`${type} hash not found in 14.3M records.`);
                            terminateAll();
                            resolve();
                        }
                    }
                };

                worker.onerror = (err) => {
                    console.error("Worker Error:", err);
                    finishedWorkers++;
                    if (finishedWorkers === numWorkers && !matchFound) {
                        this.hideLoading();
                        this.showError("Parallel scan failed or not found.");
                        terminateAll();
                        resolve();
                    }
                };

                worker.postMessage({ targetHash: targetHash.toLowerCase(), type, shard: i });
            }
            
            this.updateLoadingStatus("Initiating parallel scan (4 threads)...");
        });
    }

    updateLoadingStatus(msg) {
        // Find existing status or inject into skeleton
        let statusEl = document.getElementById('loadingStatusMsg');
        if (!statusEl) {
            statusEl = document.createElement('p');
            statusEl.id = 'loadingStatusMsg';
            statusEl.className = 'text-[11px] font-mono text-primary mt-2 animate-pulse';
            this.skeletonLoader.appendChild(statusEl);
        }
        statusEl.textContent = msg;
    }

    showLoading() {
        this.searchInput.disabled = true;
        this.searchInput.readOnly = true;
        this.searchInput.classList.add('cursor-not-allowed', 'opacity-70');
        this.searchInput.setAttribute('aria-busy', 'true');

        this.clearBtn.classList.add('hidden');
        this.shortcutHint.classList.add('hidden');
        this.loadingSpinner.classList.remove('hidden');
        this.skeletonLoader.classList.remove('hidden');

        // Reset status msg if any
        const statusEl = document.getElementById('loadingStatusMsg');
        if (statusEl) statusEl.remove();
    }

    hideLoading() {
        // Enable input
        this.searchInput.disabled = false;
        this.searchInput.readOnly = false;
        this.searchInput.classList.remove('cursor-not-allowed', 'opacity-70');
        this.searchInput.removeAttribute('aria-busy');

        this.loadingSpinner.classList.add('hidden');
        if (this.searchInput.value.length > 0) {
            this.clearBtn.classList.remove('hidden');
        } else {
            this.shortcutHint.classList.remove('hidden');
        }

        this.skeletonLoader.classList.add('hidden');
    }

    showPlaintextResult(plaintext, algoName) {
        if(this.algoTag) this.algoTag.textContent = algoName;
        if(this.plaintextResultText) this.plaintextResultText.textContent = plaintext;
        if(this.plaintextCard) this.plaintextCard.classList.remove('hidden');
    }

    showHashList(plaintext) {
        const md5Hash = CryptoJS.MD5(plaintext).toString();
        const sha1Hash = CryptoJS.SHA1(plaintext).toString();
        const sha256Hash = CryptoJS.SHA256(plaintext).toString();
        const ntlmHash = this.computeNTLM(plaintext);

        if(!this.hashListContainer) return;
        
        this.hashListContainer.innerHTML = 
            this.createHashRow('MD5', md5Hash) +
            this.createHashRow('SHA1', sha1Hash) +
            this.createHashRow('SHA256', sha256Hash) +
            this.createHashRow('NTLM', ntlmHash);
            
        this.hashListContainer.classList.remove('hidden');
    }

    createHashRow(name, hashValue) {
        // Includes a small inline script to handle the visual checkmark logic for individual rows
        return `
        <div class="group relative flex items-center w-full h-[32px] px-2 rounded hover:bg-surface transition-colors duration-100 cursor-pointer" onclick="navigator.clipboard.writeText('${hashValue}'); const c=this.querySelector('.copy-icon'), k=this.querySelector('.check-icon'); c.style.display='none'; k.style.display='block'; setTimeout(()=>{c.style.display='block'; k.style.display='none';},2000)">
            <span class="w-[48px] flex-shrink-0 text-[10px] font-medium tracking-[0.05em] uppercase text-text-muted font-sans">
                ${name}
            </span>
            <span class="flex-1 text-[13px] text-text-main font-mono truncate mr-8">
                ${hashValue}
            </span>
            <button class="absolute right-2 text-text-muted transition-opacity duration-100 opacity-0 group-hover:opacity-100 hover:text-primary" title="Copy to clipboard">
                <span class="material-symbols-outlined text-[16px] copy-icon">content_copy</span>
                <span class="material-symbols-outlined text-[16px] check-icon hidden" style="color:#106df9;">check</span>
            </button>
        </div>
        `;
    }

    showError(message) {
        if(this.errorMessage) this.errorMessage.textContent = message;
        if(this.errorContainer) this.errorContainer.classList.remove('hidden');
    }

    hideAll() {
        if(this.skeletonLoader) this.skeletonLoader.classList.add('hidden');
        if(this.plaintextCard) this.plaintextCard.classList.add('hidden');
        if(this.hashListContainer) this.hashListContainer.classList.add('hidden');
        if(this.errorContainer) this.errorContainer.classList.add('hidden');
    }
}

// ============================================================================
// Initialize Application
// ============================================================================

let app;

async function initApp() {
    try {
        console.log('🚀 Starting Hashly...');

        // Create lookup system
        const lookupSystem = new HashlyLookup();

        // Initialize
        await lookupSystem.init();

        // Create UI controller
        app = new UIController(lookupSystem);

        console.log('✅ Application ready');

    } catch (error) {
        console.error('❌ Failed to initialize application:', error);

        // Show error to user
        const errorContainer = document.getElementById('errorContainer');
        const errorMessage = document.getElementById('errorMessage');

        if (errorContainer && errorMessage) {
            errorMessage.textContent = `Initialization failed: ${error.message}`;
            errorContainer.classList.remove('hidden');
        }
    }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
