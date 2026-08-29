# Security policy

Argus RPC is a networking runtime. Security reports should avoid public disclosure until a fix is available.

## Supported versions

The actively maintained line is 2.x. Version 1.x is retained for historical reference and migration testing.

## Reporting

Open a private security advisory for `wbizmo/argus-rpc` on GitHub when possible. Include the affected version, reproduction steps, expected impact, and any proof-of-concept that can be shared safely.

## Security boundaries

Argus treats all bytes received from the network as untrusted. The runtime enforces frame-size limits, validates protocol direction and message identifiers, bounds queued work and writes, and exposes TLS/authentication hooks. Applications remain responsible for authorization decisions in method handlers or interceptors.
