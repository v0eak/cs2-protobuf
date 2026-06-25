# cs2-protobuf

[![node version][node-version]][node-version-href]
[![npm version][npm-version]][npm-version-href]
[![npm downloads][npm-downloads]][npm-downloads-href]

> TypeScript Library for CS2 Protobuf Encoding & Decoding

## Installation

```bash
npm install cs2-protobuf
```

## Usage

```ts
import { CMsgGCCStrike15V2GC2ClientTournamentInfo } from "cs2-protobuf"

// Example payload
const payload = new Uint8Array([0x00])

const decodedPayload = CMsgGCCStrike15V2GC2ClientTournamentInfo
    .decode(payload)

const binaryPayload = CMsgGCCStrike15V2GC2ClientTournamentInfo
    .encode({
        eventid: decodedPayload.eventid,
        gameType: decodedPayload.gameType,
        stageid: decodedPayload.stageid,
        teamids: decodedPayload.teamids
    })
```

## License

[MIT][license-href]

See `LICENSE` for more information.

<!-- Badges -->

[node-version]: https://img.shields.io/badge/Node.js-v24%2B-3366CB?labelColor=171717
[node-version-href]: https://nodejs.org
[npm-version]: https://img.shields.io/npm/v/cs2-protobuf?labelColor=171717&color=3366CB
[npm-version-href]: https://npmjs.com/package/cs2-protobuf
[npm-downloads]: https://img.shields.io/npm/dm/cs2-protobuf?labelColor=171717&color=3366CB
[npm-downloads-href]: https://npmjs.com/package/cs2-protobuf
[license-href]: https://github.com/v0eak/cs2-protobuf/blob/main/LICENSE