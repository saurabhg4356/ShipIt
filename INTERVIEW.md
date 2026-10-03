# ShipIt — Technical Interview & Architecture Deep-Dive Guide

This document provides comprehensive, production-grounded explanations for 25 critical architecture, DevOps, database, and backend engineering questions based directly on the actual implementation of **ShipIt**.

---

### 1. Why Node.js and Express?
* **High-Throughput I/O Suitability:** URL shorteners are almost purely I/O bound. Requests either resolve a key and issue an HTTP 302 redirect or record a row in PostgreSQL. Node.js’s single-threaded event loop with non-blocking libuv I/O excels at handling thousands of concurrent read/redirect requests with minimal thread-context-switching overhead compared to traditional thread-per-request architectures.
* **Lightweight Footprint:** Express.js provides an unopinionated, lightweight middleware pipeline (`app.use()`), allowing granular control over the HTTP request lifecycle (e.g., custom rate-limiting, Helmet security headers, body parsing, centralized error handling) without superfluous framework bloat.
* **Rich Ecosystem:** Broad battle-tested libraries (`pg`, `helmet`, `express-rate-limit`, `supertest`) enable production-grade security, database pooling, and integration testing without reinventing the wheel.

---

### 2. Why PostgreSQL?
* **ACID Guarantees & Atomic Operations:** URL redirection requires reliable counter increments. PostgreSQL provides transactional safety and native atomic expressions (`click_count = click_count + 1`), preventing race conditions and lost click counts without needing distributed locking.
* **Relational Integrity & Indexes:** Hard constraints (`UNIQUE` on `short_code`, `NOT NULL`, foreign keys) guarantee data consistency. A B-Tree index on `short_code` enables $O(\log N)$ or index-only lookups for instantaneous URL resolution.
* **Predictable Persistence:** Unlike NoSQL databases that may trade consistency for speed or suffer memory exhaustion when datasets exceed RAM, PostgreSQL handles structured relational data with robust write-ahead logging (WAL), automated backups, and replication pathways.

---

### 3. Why Docker?
* **Environment Parity ("Works on my machine" eliminated):** Docker packages the Node.js runtime, exact Alpine Linux dependencies, configuration, and libraries into an immutable image. The code runs identically on the developer's laptop, in the GitHub Actions CI environment, and on an Ubuntu VPS.
* **Multi-Stage Builds for Minimal Attack Surface:** In `Dockerfile`, Stage 1 builds and installs production dependencies (`npm ci --omit=dev`), while Stage 2 copies only the production artifacts onto a clean `node:22-alpine` base. Build tools and dev dependencies are never shipped to production.
* **Process Isolation & Non-Root Execution:** The container runs under the non-root `node` user (`USER node`), mitigating privilege escalation vulnerabilities if a remote code execution vulnerability were ever discovered.

---

### 4. Why Docker Compose?
* **Multi-Container Orchestration on a Single Host:** ShipIt consists of two cooperating services: the Node.js application container and the PostgreSQL database container. Docker Compose defines both in a declarative `docker-compose.yml` file, specifying environment variables, restart policies (`unless-stopped`), port bindings, and persistent volumes.
* **Isolated Networking:** Containers reside in a private bridge network (`shipit_network`). The application can resolve the database host via internal Docker DNS (`postgres:5432`), while PostgreSQL's port is never exposed to the public internet.
* **Dependency Health Checks:** The `depends_on` block enforces that the `app` container only initializes after the PostgreSQL container has passed its internal health check (`pg_isready`).

---

### 5. Why use GitHub Container Registry (GHCR)?
* **Separation of Source Code and Artifacts:** Servers should not pull raw Git source code, run `npm install`, or compile code on production VMs. Doing so wastes CPU, risks build failure on production, and requires Git credentials on the host. Instead, CI builds and tests the container, publishing an immutable container image to `ghcr.io`.
* **Security & Integrated RBAC:** GHCR natively integrates with GitHub Actions using the short-lived `GITHUB_TOKEN`, eliminating the need for long-lived static registry passwords.
* **Immutable Commit SHA Tagging:** Images are tagged with the specific Git commit SHA (e.g. `ghcr.io/user/shipit:252b054`) as well as `latest`. Production deployments pull the exact Git SHA, ensuring traceable, auditable, and rollback-ready releases.

---

### 6. Why use a VPS?
* **Direct Systems Understanding:** PaaS platforms (Heroku, Render, Vercel) abstract away operating system internals, systemd services, firewalls, and reverse proxies. Deploying on an Ubuntu Linux VPS provides direct, hands-on control over:
  - SSH key management and port hardening
  - Linux kernel parameters and process isolation
  - UFW (Uncomplicated Firewall) packet filtering
  - Native Nginx reverse proxy configuration
  - Certbot TLS certificate lifecycle
* **Cost Predictability & Resource Allocation:** A VPS provides dedicated CPU, memory, and NVMe SSD at a predictable monthly cost without unexpected bandwidth markups or cold-start sleep penalties.
* **Portability:** The deployment runbook is cloud-agnostic. It works identically on Hetzner, DigitalOcean, Linode, or Oracle Cloud.

---

### 7. Why Nginx?
* **Specialized Reverse Proxying:** While Node.js can terminate HTTP, it is not optimized to handle internet-facing edge traffic. Nginx is an event-driven, high-performance C server capable of handling tens of thousands of concurrent connections with negligible memory consumption.
* **Security Buffer:** Nginx buffers slow clients (Slowloris attacks), terminates TLS/HTTPS, enforces request payload limits, strips or normalizes malicious headers, and blocks unauthorized port access before traffic reaches Node.js.
* **Static Asset and Compression Offloading:** Nginx natively handles Gzip/Brotli compression, HTTP/2 multiplexing, and caching headers, freeing Node.js to focus solely on application logic.

---

### 8. How does reverse proxying work?
* **Traffic Flow:**
  1. An internet client sends an HTTPS request to `https://shipit.domain.com/abc123` on port 443.
  2. Nginx accepts the TLS connection, performs TLS handshake, and decrypts the request.
  3. Nginx rewrites or forwards the request via HTTP to the internal upstream `http://127.0.0.1:3000`.
  4. Nginx injects proxy headers so the backend knows the real client identity:
     - `X-Real-IP`: Client’s actual public IP.
     - `X-Forwarded-For`: Chain of IP addresses the request passed through.
     - `X-Forwarded-Proto`: Protocol used by the client (`https`).
     - `Host`: Original `Host` header requested by the client.
  5. The Node.js container (with `app.set('trust proxy', 1)`) consumes these headers for rate limiting and logging, processes the request, and returns an HTTP 302 response to Nginx.
  6. Nginx forwards the 302 response to the client over the encrypted HTTPS connection.

---

### 9. How does HTTPS work?
* **Transport Layer Security (TLS):**
  1. **TCP Handshake:** Client and server complete standard 3-way TCP handshake (SYN, SYN-ACK, ACK) on port 443.
  2. **TLS ClientHello:** Client sends supported TLS versions, cipher suites, and a random byte sequence.
  3. **TLS ServerHello & Certificate:** Server responds with chosen TLS version, cipher suite, server random, and its public SSL certificate signed by Let's Encrypt CA.
  4. **Verification:** Client validates certificate against trusted root CAs stored in the OS/browser.
  5. **Key Exchange (ECDHE):** Client and server exchange Diffie-Hellman parameters to derive a shared symmetric session key (Forward Secrecy).
  6. **Symmetric Encryption:** All subsequent HTTP traffic is encrypted using AES-GCM or ChaCha20-Poly1305 with the shared session key.

---

### 10. Why Let's Encrypt?
* **Automated, Free, Trusted Certificate Authority:** Let's Encrypt is a non-profit CA providing free domain-validated (DV) X.509 certificates. It operates via the open ACME (Automated Certificate Management Environment) protocol.
* **Standard 90-Day Lifespan for Security:** Shorter certificate lifetimes reduce the exposure window if a private key is ever compromised and incentivize complete automation of the renewal process.

---

### 11. How does Certbot work?
* **ACME Protocol Execution:**
  1. Certbot initiates a challenge with Let's Encrypt using the HTTP-01 challenge method.
  2. Let's Encrypt provides a cryptographic token. Certbot places a corresponding verification file in `/var/www/certbot/.well-known/acme-challenge/<token>`.
  3. Let's Encrypt’s validation servers make an HTTP request to `http://your-domain.com/.well-known/acme-challenge/<token>`.
  4. Nginx serves this file. Upon validation, Let's Encrypt confirms domain ownership and issues the signed certificate pair (`fullchain.pem` and `privkey.pem`).
* **Automated Renewal via Cron / Systemd:** Certbot installs a systemd timer (`certbot.timer`) that runs twice daily. When certificates reach within 30 days of expiry, Certbot automatically requests renewal and reloads Nginx (`nginx -s reload`).

---

### 12. How does GitHub Actions deploy?
* **Event-Driven Workflow:** When code is pushed to the `main` or `master` branch:
  1. **Job 1 (Test):** Checks out code, installs dependencies with `npm ci`, and runs Jest tests (`npm test`). If any test fails, the entire workflow immediately terminates with a non-zero exit code.
  2. **Job 2 (Build & Push):** Sets up Docker Buildx, authenticates to `ghcr.io`, extracts Git commit SHA, builds the multi-stage Docker image, and pushes it with both `:latest` and `:<commit-sha>` tags.
  3. **Job 3 (Deploy):** Connects to the Ubuntu VPS over SSH using private key credentials stored in GitHub Secrets.

---

### 13. How does SSH deployment work?
* **Secure Remote Execution:**
  1. The GitHub Actions runner executes `appleboy/ssh-action` using `VPS_HOST`, `VPS_USER`, and `VPS_SSH_PRIVATE_KEY`.
  2. The runner connects to port 22 on the VPS using asymmetric SSH public-key cryptography.
  3. The runner executes the deployment script on the VPS:
     ```bash
     cd /opt/shipit
     echo "$GITHUB_TOKEN" | docker login ghcr.io -u $ACTOR --password-stdin
     export DOCKER_IMAGE=ghcr.io/user/shipit:<sha>
     docker compose pull app
     docker compose up -d --remove-orphans app
     ```
  4. The deployment script loops up to 12 times polling `http://127.0.0.1:3000/health`. If the health check passes, deployment exits with 0. If it fails, the workflow fails, notifying the developer.

---

### 14. How are secrets handled?
* **Zero Secrets in Git:** Neither `.env` nor credentials, certificates, or SSH keys are committed to the repository (`.gitignore` enforces this).
* **GitHub Repository Secrets:** Deployment credentials (`VPS_HOST`, `VPS_SSH_PRIVATE_KEY`, `VPS_USER`) are encrypted at rest by GitHub using Libsodium and masked from CI/CD job logs.
* **Server-Side File Permissions:** On the VPS, `.env` resides in `/opt/shipit/.env` with strict permissions:
  ```bash
  chmod 600 /opt/shipit/.env
  chown deploy:deploy /opt/shipit/.env
  ```
  Only the `deploy` user and root can read or modify the file.

---

### 15. How is click counting implemented?
* **Atomic Concurrency-Safe Updates:**
  In [`src/services/linkService.js`](file:///c:/ShipIt/src/services/linkService.js), redirection uses a single atomic SQL update:
  ```sql
  UPDATE links
  SET click_count = click_count + 1,
      last_clicked_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  WHERE short_code = $1
  RETURNING original_url;
  ```
* **Why not Read-Modify-Write?** If two concurrent requests fetched the row (both seeing `click_count = 5`) and then issued `UPDATE links SET click_count = 6`, one click would be lost (race condition). The database-level atomic increment handles lock acquisition at the row level, guaranteeing accurate analytics.

---

### 16. How are short-code collisions prevented?
* **Dual Protection Strategy:**
  1. **Large Keyspace:** Using 6 characters from a 62-character alphabet ($[0-9a-zA-Z]$) provides $62^6 = 56,800,235,584$ (~56.8 billion) permutations.
  2. **Application-Level Retry Loop:** [`src/services/linkService.js`](file:///c:/ShipIt/src/services/linkService.js) executes up to 5 retries if an insert collision occurs.
  3. **Database-Level Hard Constraint:** The `short_code` column has a strict `UNIQUE` constraint. If a collision occurs, PostgreSQL throws error code `23505` (unique_violation). The service catches `23505`, logs a warning, and retries with a fresh cryptographically random code.

---

### 17. What happens if PostgreSQL goes down?
* **Graceful Degradation & Non-Crash Behavior:**
  1. The Node.js connection pool (`pg.Pool`) catches connection errors. The Express application does not crash.
  2. Inbound requests to `/health` detect that `SELECT 1` fails and return HTTP 503 `Service Unavailable`:
     ```json
     { "status": "ok", "database": "disconnected", "uptime": 124.5 }
     ```
  3. UptimeRobot detects the 503 status code and triggers immediate alerts to the engineering on-call team.
  4. Inbound API and redirect requests receive consistent 500 error responses (`INTERNAL_SERVER_ERROR`) via centralized error middleware, without exposing database connection strings or stack traces.
  5. The PostgreSQL Docker container restart policy (`restart: unless-stopped`) prompts the Docker daemon to automatically restart the container.

---

### 18. What happens if the Node.js container crashes?
* **Automated Recovery:**
  1. Docker’s `restart: unless-stopped` policy automatically restarts the container within seconds.
  2. Docker’s native `HEALTHCHECK` periodically probes `curl -f http://localhost:3000/health`. If 3 consecutive checks fail, Docker marks the container status as `unhealthy`.
  3. While Node.js is restarting, Nginx returns HTTP 502 `Bad Gateway` to incoming requests instead of dropping the TCP connection.
  4. If the crash is persistent, UptimeRobot alerts within 60 seconds.

---

### 19. What happens if Nginx goes down?
* **Impact & Recovery:**
  1. Incoming TCP connections on ports 80 and 443 are refused (`Connection Refused`).
  2. UptimeRobot immediately registers external downtime and triggers an alert.
  3. On Ubuntu, Nginx is managed as a systemd service (`systemctl status nginx`). Systemd can be configured with `Restart=always` in `/lib/systemd/system/nginx.service` to recover from unexpected process termination.

---

### 20. How does UptimeRobot detect downtime?
* **External Synthetic Polling:**
  1. UptimeRobot periodically sends an HTTP GET request from distributed geographic probing servers to `https://your-domain.com/health` every 1–5 minutes.
  2. It evaluates:
     - HTTP Status Code: Expects `200 OK`. If it receives `502`, `503`, `500`, or `404`, it marks the check as failed.
     - Response Timeout: If the server takes longer than 30 seconds to respond, it registers a timeout.
     - Response Body: Can optionally assert that `"status":"ok"` and `"database":"connected"` are present in the JSON payload.
  3. If two consecutive probes fail, UptimeRobot triggers email, SMS, or Slack webhook alerts.

---

### 21. How would you scale to 1 million links?
* **Data Volume Estimation:**
  - 1 link row $\approx 200$ bytes (IDs, URLs, timestamps, integer counts).
  - 1,000,000 links $\approx 200\text{ MB}$ raw data.
  - Index size on `short_code` $\approx 30\text{ MB}$.
* **PostgreSQL Capacity:** PostgreSQL effortlessly manages tens of gigabytes in RAM. At 1 million links, the entire table and B-Tree index fit comfortably in a $5/month VPS with 1 GB RAM. Lookups remain near $O(1)$ memory speeds.
* **Optimization Steps:**
  - Tune PostgreSQL `shared_buffers` to 25% of available system RAM.
  - Ensure `idx_links_short_code` index remains fully cached in memory.
  - Implement read-only replicas if read traffic dramatically outpaces write traffic.

---

### 22. Why would Redis be useful later?
* **Sub-Millisecond Read Caching:**
  - In a URL shortener, read/redirect requests outnumber write requests by 100:1 (heavy 80/20 power-law distribution where popular links receive 90% of traffic).
  - Caching hot `short_code -> original_url` mappings in Redis eliminates PostgreSQL query overhead entirely, reducing redirect latency from ~5ms to <0.5ms.
* **Distributed Sliding-Window Rate Limiting:**
  - In-memory rate limiting (`express-rate-limit`) only tracks requests per single Node.js process. When multiple Node.js instances run behind a load balancer, each has a separate counter.
  - Redis provides atomic counters (`INCR`, `EXPIRE`) or sorted sets to enforce unified rate limits across all application instances.
* **Write Buffering for Click Analytics:**
  - Instead of executing an immediate `UPDATE` query on PostgreSQL for every single click, increments can be buffered in Redis (`HINCRBY link:clicks abc123 1`) and flushed to PostgreSQL in batches every 10–60 seconds, drastically reducing database write IOPS.

---

### 23. How would you horizontally scale this system?
* **Architecture Evolution:**
  1. **Multiple Node.js Instances:** Run multiple stateless Node.js application containers across multiple VMs or behind Docker Swarm / Kubernetes / AWS ECS.
  2. **Centralized Load Balancer:** Replace single-node Nginx with an external HAProxy or Cloud Load Balancer distributing traffic across the Node.js instances via round-robin or least-connections.
  3. **Managed PostgreSQL with Read Replicas:** Run primary PostgreSQL for writes (`INSERT` links, bulk click flushes) and read replicas for `GET /:code` lookups.
  4. **Distributed Redis Cluster:** Shared caching and distributed rate limiting across all application nodes.

---

### 24. What are the limitations of a single VPS?
* **Single Point of Failure (SPOF):** If the physical host hardware fails, the datacenter loses power, or the VPS network is severed, the entire application becomes unavailable.
* **Vertical Resource Ceiling:** A single VM is constrained by its maximum assignable CPU, RAM, and disk I/O.
* **Geographic Latency:** Users located geographically distant from the single VPS datacenter will experience increased round-trip latency for TCP/TLS handshakes and redirects.
* **Maintenance Downtime:** OS kernel upgrades and system reboots cause brief service interruptions unless zero-downtime clustering is employed.

---

### 25. What would you change for a larger production system?
1. **Terraform (Infrastructure as Code):** Provision VPCs, subnets, firewall rules, and compute instances declaratively to allow reproducible multi-region deployments.
2. **Managed Database (e.g., RDS / Cloud SQL / Supabase):** Offload automated failover, automated point-in-time recovery (PITR), and read replicas to a managed service.
3. **Edge Redirection via Cloudflare CDN / Workers:** Perform short-code redirects directly at the Cloudflare edge from Key-Value storage (KV), dropping redirection latency to <15ms globally without traffic ever reaching origin servers.
4. **Asynchronous Event Pipeline for Analytics:** Replace synchronous SQL click updates with an event bus (Kafka / RabbitMQ / AWS SQS). Every click publishes a `{ shortCode, ip, userAgent, timestamp }` event consumed by an analytics pipeline (ClickHouse / BigQuery).
5. **Observability Stack:** Transition from simple uptime checks to Prometheus (metrics collection), Grafana (dashboards), and OpenTelemetry (distributed tracing).
