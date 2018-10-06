# LimaCharlie.io API

Simple JS API for LimaCharlie.io, a cloud hosted endpoint security platform.

## Install
```
npm install limacharlie
```

```
const {Manager, Spout, Webhook} = require('limacharlie')
```

## Interfaces

### Manager
The Manager is used to enclose a single organization's identity with an OID and a Secret API Key.

### Spout
The Spout allows the runtime registration of an Output from LimaCharlie.io through an HTTPS JSON stream.

### Sensor
Simple interaction with the sensors. Task, tag, untag, list tags.

## Examples
This is still in early development. For latest examples on how to use the various interfaces, see the
[tests](https://github.com/refractionPOINT/limacharlie-js/blob/master/test/test.js).
Also note that the interfaces are directly based (and map to) the ones in the [Python API](https://github.com/refractionpoint/python-limacharlie)
which is better documented.