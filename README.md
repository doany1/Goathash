# Goat Hash – High-Performance Browser-Side Hash Lookup
## [ [Goat Hash is Live](https://goathash.github.io/) ] 

Goat Hash is a specialized, privacy-focused hash lookup engine designed for security professionals (OSCP/PWK). It runs entirely in your browser using **GitHub Pages**, eliminating the need for expensive backend databases while providing instant results for 14.3 million records.

## What It Does

- **Instant MD5/NTLM Lookups**: Uses sub-second prefix sharding to find hashes without downloading the full database.
- **Parallel SHA Scanning**: Multi-threaded WebWorker engine to search SHA1 and SHA256 hashes in the browser background.
- **Privacy First**: No hashes are ever sent to a server. All processing happens locally in your browser memory.
- **Serverless Architecture**: Hosted for free on GitHub Pages using advanced HTTP Byte-Range requests.

## Who It Helps

- **Penetration Testers**: Quickly identify cleartext credentials during assessments (e.g., OSCP).
- **Security Researchers**: Analyze hashes offline-grade directly in a web interface.
- **CTF Players**: Fast, zero-config tool for rapid password recovery.

## How It Works (The Engineering)

### 1. High-Speed Sharding (MD5 & NTLM)
For O(1) complexity, the 14.3M record database is split into 16 compressed Gzip shards based on the first character of the hash. We further index these using a **4-character hex prefix**. When you search:
- The app calculates the prefix (e.g., `6d00`).
- It uses **HTTP Byte-Range requests** to fetch only the specific ~30KB chunk containing that hash.
- This makes lookups instant even on limited bandwidth.

### 2. Multi-Threaded Scanning (SHA1 & SHA256)
Since indexing SHA1/SHA256 is too bulky for static hosting, we implement a **Parallel Scanning Cluster**:
- Spawns **4 WebWorkers** as background threads.
- Streams a highly-compressed wordlist divided into 4 segments.
- Scans on-the-fly in the background, keeping the UI responsive.

## Core Features

- **Zero-Backend Design**: No SQL, No API, No Cost. 100% Static HTML/JS.
- **On-the-fly Decompression**: Uses the native `DecompressionStream` API for maximum speed.
- **Memory-Safe Packing**: Custom Node.js stream-packer ([mega_packer.js](cci:7://file:///e:/goathash.github.io/mega_packer.js:0:0-0:0)) used to process 4GB+ of raw data into browser-ready shards.
- **Responsive UI**: Modern glassmorphic design built with Tailwind CSS.

## Technology Stack

- **Core**: Vanilla JavaScript (Modern ES6+)
- **Concurrency**: WebWorker API (4x Multi-threading)
- **Compression**: Gzip-compressed Shards + Concatenated Gzip Members
- **Networking**: HTTP Byte-Range Requests
- **Styling**: Tailwind CSS

## Quick Start

1. **Open the live site**: [https://goathash.github.io/](https://goathash.github.io/)
2. **Paste a Hash**: MD5, NTLM, SHA1, or SHA256.
3. **Instant Results**: See the plaintext and duration instantly.

## Developer Info

If you want to build this database yourself:
1. Place your hash files in `new hash/`.
2. Run the packer: `node mega_packer.js`.
3. Deploy the `github_deployment` folder to any static host (GitHub Pages, Cloudflare Pages, Vercel).

---
*Developed with ❤️ for the security community.*
