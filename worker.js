/**
 * Zero-dependency, zero-await synchronous hashing for high-speed wordlist streaming.
 */
const HashUtils = {
    sha1: function(str) {
        let buffer = new TextEncoder().encode(str);
        return this.hashSHA1(buffer);
    },
    sha256: function(str) {
        let buffer = new TextEncoder().encode(str);
        return this.hashSHA256(buffer);
    },
    
    // Minimal SHA1 implementation
    hashSHA1: function(buffer) {
        let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
        let len = buffer.length;
        let words = new Uint32Array(((len + 8) >> 6) + 1 << 4);
        for (let i = 0; i < len; i++) words[i >> 2] |= buffer[i] << (24 - (i % 4) * 8);
        words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
        words[words.length - 1] = len * 8;

        for (let i = 0; i < words.length; i += 16) {
            let w = new Uint32Array(80);
            for (let j = 0; j < 16; j++) w[j] = words[i + j];
            for (let j = 16; j < 80; j++) {
                let n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
                w[j] = (n << 1) | (n >>> 31);
            }
            let a = h0, b = h1, c = h2, d = h3, e = h4;
            for (let j = 0; j < 80; j++) {
                let f, k;
                if (j < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
                else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
                else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
                else { f = b ^ c ^ d; k = 0xCA62C1D6; }
                let temp = ((a << 5) | (a >>> 27)) + f + e + k + w[j];
                e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp | 0;
            }
            h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
        }
        return [h0, h1, h2, h3, h4].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
    },

    // Lightweight SHA256 (Simplified) - Using a standard JS implementation pattern
    hashSHA256: function(buffer) {
        const rotateRight = (n, x) => (x >>> n) | (x << (32 - n));
        const k = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        let len = buffer.length;
        let words = new Uint32Array(((len + 8) >> 6) + 1 << 4);
        for (let i = 0; i < len; i++) words[i >> 2] |= buffer[i] << (24 - (i % 4) * 8);
        words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
        words[words.length - 1] = len * 8;

        for (let i = 0; i < words.length; i += 16) {
            let w = new Uint32Array(64);
            for (let j = 0; j < 16; j++) w[j] = words[i + j];
            for (let j = 16; j < 64; j++) {
                let s0 = rotateRight(7, w[j - 15]) ^ rotateRight(18, w[j - 15]) ^ (w[j - 15] >>> 3);
                let s1 = rotateRight(17, w[j - 2]) ^ rotateRight(19, w[j - 2]) ^ (w[j - 2] >>> 10);
                w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
            }
            let [a, b, c, d, e, f, g, h_] = h;
            for (let j = 0; j < 64; j++) {
                let s1 = rotateRight(6, e) ^ rotateRight(11, e) ^ rotateRight(25, e);
                let ch = (e & f) ^ ((~e) & g);
                let temp1 = (h_ + s1 + ch + k[j] + w[j]) | 0;
                let s0 = rotateRight(2, a) ^ rotateRight(13, a) ^ rotateRight(22, a);
                let maj = (a & b) ^ (a & c) ^ (b & c);
                let temp2 = (s0 + maj) | 0;
                h_ = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
            }
            h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
            h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + h_) | 0;
        }
        return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
    }
};

self.onmessage = async function(e) {
    const { targetHash, type, shard } = e.data;
    const targetHex = targetHash.toLowerCase();
    const hashFunc = type === 'SHA1' ? HashUtils.sha1.bind(HashUtils) : HashUtils.sha256.bind(HashUtils);
    const shardUrl = `packed_data/plaintexts_${shard}.gz`;

    try {
        const response = await fetch(shardUrl);
        if (!response.ok) throw new Error(`Could not download ${shardUrl}`);
        
        const ds = new DecompressionStream('gzip');
        const reader = response.body.pipeThrough(ds).getReader();
        const decoder = new TextDecoder();

        let buffer = '';
        let checkedCount = 0;
        let lastReportTime = Date.now();

        while (true) {
            const { done, value } = await reader.read();
            
            if (value) {
                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split('\n');
                buffer = lines.pop();

                for (let i = 0; i < lines.length; i++) {
                    const text = lines[i].trim();
                    if (!text) continue;
                    
                    checkedCount++;
                    
                    // High-speed synchronous hashing
                    if (hashFunc(text) === targetHex) {
                        self.postMessage({ status: 'success', plaintext: text, checkedCount });
                        return;
                    }

                    if (checkedCount % 50000 === 0) {
                        const now = Date.now();
                        if (now - lastReportTime > 250) {
                            self.postMessage({ status: 'progress', checkedCount });
                            lastReportTime = now;
                        }
                    }
                }
            }

            if (done) {
                if (buffer.trim()) {
                    if (hashFunc(buffer.trim()) === targetHex) {
                        self.postMessage({ status: 'success', plaintext: buffer.trim(), checkedCount: checkedCount + 1 });
                        return;
                    }
                }
                break;
            }
        }

        self.postMessage({ status: 'not_found', checkedCount });

    } catch (err) {
        self.postMessage({ status: 'error', error: err.message });
    }
};
