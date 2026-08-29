# Protocol resource limits

The Argus wire format can represent method names up to 65,535 bytes and payloads up to 4,294,967,295 bytes, but those values are encoding capacities, not safe runtime defaults.

Argus v2 therefore enforces smaller configurable runtime ceilings before waiting for a declared body:

| Limit | Default |
| --- | ---: |
| Method name | 1 KiB |
| Payload | 8 MiB |
| Total frame | header + 1 KiB + 8 MiB |

A peer that declares a value above the configured limit is rejected immediately after the fixed header is available. The runtime does not wait for the oversized payload to arrive first.

Applications may lower the limits for constrained services. Increasing them should be deliberate because larger limits increase worst-case memory retention and queue pressure under fragmented or slow input.

The encoder uses the same limits as the decoder so locally generated frames cannot accidentally violate a deployment's configured resource contract.
