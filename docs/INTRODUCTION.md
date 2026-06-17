# Introduction

Argus is a lightweight TypeScript-native RPC protocol over raw TCP built for learning, experimentation, benchmarking, and infrastructure research.

The project explores what happens beneath traditional HTTP APIs and higher-level RPC frameworks by implementing binary framing, request correlation, connection lifecycle management, heartbeats, retries, and failure detection directly over TCP.

## Purpose

Argus exists to answer practical infrastructure questions:

* How are requests and responses correlated over a single TCP connection?
* What does a binary protocol look like on the wire?
* How should timeouts be implemented?
* How can dead connections be detected?
* How should retries behave?
* How does connection pooling affect communication?

## Positioning

Argus is not intended to replace gRPC, HTTP, Thrift, tRPC, or other established communication systems.

Instead, Argus serves as a focused protocol engineering project for understanding how service-to-service communication works beneath higher-level abstractions.

## Origin

Argus was created by Williams Ashibuogwu (wbizmo) as an exploration of networking, transport protocols, observability, and reliability engineering.

The project takes inspiration from Argus Panoptes, the many-eyed guardian of Greek mythology.

Just as Argus was known for vigilance, the protocol is built around continuous awareness of network state through heartbeats, request tracking, retries, timeout handling, and connection monitoring.
